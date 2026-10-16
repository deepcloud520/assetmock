import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { commitFinancialImport, extractFromText } from "./financial-import";

describe("financial record import", () => {
  let workspaceId = "";
  beforeAll(async () => {
    workspaceId = (await db.workspace.create({ data: { profile: { create: {} } } })).id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("extracts text into a review draft without persisting it", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ assets: [{ name: "工资卡", amount_yuan: "12345.67" }], liabilities: [], warnings: [] }) } }] }), { status: 200 })));
    const result = await extractFromText("工资卡 12345.67元");
    expect(result.assets[0]).toEqual({ name: "工资卡", currentValueMinor: "1234567" });
    expect(await db.asset.count({ where: { workspaceId } })).toBe(0);
  });

  it("maps a verbatim repayment method instead of trusting a model enum", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ assets: [], liabilities: [{ name: "住房贷款", is_installment: true, amount_yuan: null, monthly_payment_yuan: "4500", term_months: 240, total_repayment_yuan: "1080000", principal_yuan: "800000", interest_yuan: "280000", repayment_method_text: "等额本息" }], warnings: [] }) } }] }), { status: 200 })));
    const result = await extractFromText("住房贷款，还款方式：等额本息");
    expect(result.liabilities[0].repaymentMethod).toBe("EQUAL_PAYMENT");
  });

  it("imports reviewed assets and installment liabilities in one revision", async () => {
    vi.unstubAllGlobals();
    vi.stubEnv("ALLOW_AI_IN_TEST", "false");
    await commitFinancialImport(workspaceId, {
      expectedRevision: 0,
      assets: [{ name: "余额宝", currentValueMinor: "800000", currency: "CNY", isAdjustable: true }],
      liabilities: [{ name: "住房贷款", isInstallment: true, outstandingBalanceMinor: null, monthlyPaymentMinor: "450000", remainingMonths: 240, totalRepaymentMinor: "108000000", principalMinor: "80000000", interestMinor: "28000000", repaymentMethod: "EQUAL_PAYMENT" }],
    });
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { assets: true, liabilities: true, auditEvents: true } });
    expect(workspace.portfolioRevision).toBe(1);
    expect(workspace.assets[0]).toMatchObject({ type: "CASH", currentValueMinor: 800000n, classificationSource: "RULE_FALLBACK" });
    expect(workspace.liabilities[0]).toMatchObject({ isInstallment: true, outstandingBalanceMinor: 80000000n, totalRepaymentMinor: 108000000n, repaymentMethod: "EQUAL_PAYMENT" });
    expect(workspace.auditEvents).toHaveLength(1);
  });
});
