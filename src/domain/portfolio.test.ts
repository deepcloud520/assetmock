import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetInputSchema, goalInputSchema, liabilityInputSchema, moneyMinorSchema } from "./portfolio";
import { db } from "@/lib/db";
import { createResource, deleteResource, saveLedgerBatch, updateResource } from "@/server/portfolio";

describe("portfolio input rules", () => {
  it("keeps money as exact minor-unit bigint values", () => {
    expect(moneyMinorSchema.parse("9007199254740991")).toBe(9_007_199_254_740_991n);
    expect(() => moneyMinorSchema.parse("12.50")).toThrow();
    expect(() => moneyMinorSchema.parse("9007199254740992")).toThrow();
  });

  it("rejects invalid asset risk levels", () => {
    expect(() => assetInputSchema.parse({
      name: "指数基金",
      type: "EQUITY_FUND",
      currentValueMinor: "1000000",
      currency: "CNY",
      liquidityLevel: "D7",
      riskLevel: 6,
      isInvestable: true,
      isAdjustable: true,
      goalId: null,
    })).toThrow();
  });

  it("requires goal dates to be in the future", () => {
    expect(() => goalInputSchema.parse({
      name: "购房",
      type: "HOME_PURCHASE",
      targetAmountMinor: "30000000",
      targetDate: "2020-01-01",
      preparedAmountMinor: "0",
      monthlyContributionMinor: "0",
      priority: 1,
      isFlexible: false,
    })).toThrow();
  });

  it("validates installment totals against principal and interest", () => {
    const valid = { name: "住房贷款", isInstallment: true, outstandingBalanceMinor: null, monthlyPaymentMinor: "450000", remainingMonths: 240, totalRepaymentMinor: "108000000", principalMinor: "80000000", interestMinor: "28000000", repaymentMethod: "EQUAL_PAYMENT" };
    expect(liabilityInputSchema.parse(valid).isInstallment).toBe(true);
    expect(() => liabilityInputSchema.parse({ ...valid, totalRepaymentMinor: "107000000" })).toThrow("本息和必须等于本金加利息");
    expect(() => liabilityInputSchema.parse({ ...valid, totalRepaymentMinor: null, interestMinor: null })).toThrow("本息和");
  });
});

describe("portfolio revision transaction", () => {
  let workspaceId = "";
  let assetId = "";

  beforeAll(async () => {
    const workspace = await db.workspace.create({ data: {} });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("increments revision and writes an audit event on every mutation", async () => {
    const created = await createResource("asset", workspaceId, {
      name: "应急储蓄",
      type: "BANK_DEPOSIT",
      currentValueMinor: "5000000",
      currency: "CNY",
      liquidityLevel: "T0",
      riskLevel: 1,
      isInvestable: true,
      isAdjustable: true,
      goalId: null,
    });
    assetId = created.id;

    await updateResource("asset", workspaceId, assetId, {
      name: "家庭应急储蓄",
      type: "BANK_DEPOSIT",
      currentValueMinor: "6000000",
      currency: "CNY",
      liquidityLevel: "T0",
      riskLevel: 1,
      isInvestable: true,
      isAdjustable: false,
      goalId: null,
    });
    await deleteResource("asset", workspaceId, assetId);

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { auditEvents: true, assets: true },
    });
    expect(workspace.portfolioRevision).toBe(3);
    expect(workspace.auditEvents.map((event) => event.revision)).toEqual([1, 2, 3]);
    expect(workspace.assets[0].deletedAt).toBeInstanceOf(Date);
  });

  it("saves a customizable ledger in one revision and treats omitted amounts as zero at the API boundary", async () => {
    const existing = await db.asset.create({
      data: { workspaceId, name: "银行卡活期", type: "CASH", currentValueMinor: 1n, liquidityLevel: "T0", riskLevel: 1 },
    });
    const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await saveLedgerBatch(workspaceId, {
      expectedRevision: before.portfolioRevision,
      headers: { assetName: "账户名称", liabilityPayment: "月度还款" },
      profile: {
        stableMonthlyIncomeMinor: "1200000",
        otherMonthlyIncomeMinor: "0",
        rentExpenseMinor: "0",
        transportExpenseMinor: "0",
        essentialExpenseMinor: "0",
      },
      assets: [
        { id: existing.id, name: "自定义工资卡", type: "CASH", currentValueMinor: "0" },
        { name: "家中备用现金", type: "CASH", currentValueMinor: "50000" },
      ],
      liabilities: [{ name: "自定义借款", type: "OTHER", outstandingBalanceMinor: "0", monthlyPaymentMinor: "0" }],
    });

    const after = await db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { assets: { where: { deletedAt: null } }, liabilities: { where: { deletedAt: null } }, auditEvents: { orderBy: { revision: "asc" } } },
    });
    expect(after.portfolioRevision).toBe(before.portfolioRevision + 1);
    expect(after.ledgerConfirmedAt).toBeInstanceOf(Date);
    expect(JSON.parse(after.ledgerHeadersJson)).toMatchObject({ assetName: "账户名称", liabilityPayment: "月度还款", assetAmount: "余额" });
    expect(after.assets.find((item) => item.id === existing.id)?.name).toBe("自定义工资卡");
    expect(after.assets.find((item) => item.name === "家中备用现金")?.currentValueMinor).toBe(50_000n);
    expect(after.assets.find((item) => item.name === "家中备用现金")?.liquidityLevel).toBe("T0");
    expect(after.liabilities.find((item) => item.name === "自定义借款")?.outstandingBalanceMinor).toBe(0n);
    expect(after.auditEvents.at(-1)?.action).toBe("BATCH_CONFIRMED");
    await expect(saveLedgerBatch(workspaceId, {
      expectedRevision: before.portfolioRevision,
      profile: { stableMonthlyIncomeMinor: "0", otherMonthlyIncomeMinor: "0", rentExpenseMinor: "0", transportExpenseMinor: "0", essentialExpenseMinor: "0" },
      assets: [], liabilities: [],
    })).rejects.toThrow("其他页面更新");
    expect((await db.profile.findUniqueOrThrow({ where: { workspaceId } })).stableMonthlyIncomeMinor).toBe(1200000n);
  });
});
