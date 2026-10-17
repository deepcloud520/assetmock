import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addMonths, carFactsSchema, currentCarMonth, type CarFacts } from "@/domain/car-planning";
import { adoptCarDecision, carContext, completeCarPurchase, evaluateCarDecision, guideCarDecision, previewCarPurchase, reviewCarDecision, saveCarDecision } from "./car-planning";

const ids: string[] = [];
async function seed(overrides: Partial<CarFacts> = {}) {
  const workspace = await db.workspace.create({ data: { portfolioRevision: 1 } }); ids.push(workspace.id);
  const asset = await db.asset.create({ data: { workspaceId: workspace.id, name: "可用存款", type: "CASH", currentValueMinor: 20000000n, liquidityLevel: "T0", riskLevel: 1 } });
  const facts = carFactsSchema.parse({ targetMonth: addMonths(currentCarMonth(), 6), budgetMinor: "12000000", landingFeesMinor: "1000000", runningMonthlyMinor: "100000", replacedTransportMinor: "0", monthlyIncomeMinor: "1500000", livingExpensesMinor: "700000", monthlyPremiumMinor: "100000", reserveFloorMinor: "3000000", cashflowConfirmed: true, insuranceConfirmed: true, constraintsConfirmed: true, costsConfirmed: true, sourcesConfirmed: true, otherGoalsConfirmed: true, sources: [{ assetId: asset.id, amountMinor: "20000000", availableMonth: currentCarMonth(), use: true }], ...overrides });
  const decision = await saveCarDecision(workspace.id, { expectedRevision: 1, facts });
  if (!decision) throw new Error("missing decision");
  return { workspace, asset, facts, decision };
}
async function active(overrides: Partial<CarFacts> = {}) {
  const seeded = await seed(overrides);
  await evaluateCarDecision(seeded.workspace.id, seeded.decision.id, 1);
  const plan = await adoptCarDecision(seeded.workspace.id, seeded.decision.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH", reason: "确认资金与预算" });
  return { ...seeded, plan };
}

describe("car decision persistence and confirmation", () => {
  afterAll(async () => { vi.useRealTimers(); await db.workspace.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
  it("persists incomplete drafts without creating phantom goals", async () => {
    const s = await seed({ budgetMinor: null, cashflowConfirmed: false });
    const evaluation = await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
    expect(evaluation.missing).toContain("确认收支与原有债务口径");
    expect(await db.goal.count({ where: { workspaceId: s.workspace.id } })).toBe(0);
  });
  it("adopts atomically and exact retries do not duplicate money or tasks", async () => {
    const s = await active();
    const again = await adoptCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH", reason: "确认资金与预算" });
    expect(again.id).toBe(s.plan.id);
    expect(await db.carPlanVersion.count({ where: { decisionId: s.decision.id } })).toBe(1);
    expect(await db.carFundingReservation.count({ where: { decisionId: s.decision.id } })).toBe(1);
    expect((await db.asset.findUniqueOrThrow({ where: { id: s.asset.id } })).currentValueMinor).toBe(20000000n);
    expect(await db.liability.count({ where: { workspaceId: s.workspace.id } })).toBe(0);
    expect(await db.action.count({ where: { workspaceId: s.workspace.id } })).toBe(2);
  });
  it("blocks adoption after ledger or transaction changes", async () => {
    for (const scope of ["portfolioRevision", "transactionRevision"] as const) {
      const s = await seed(); await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
      await db.workspace.update({ where: { id: s.workspace.id }, data: { [scope]: { increment: 1 } } });
      await expect(adoptCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH", reason: "确认" })).rejects.toThrow("已变化");
      expect(await db.carFundingReservation.count({ where: { decisionId: s.decision.id } })).toBe(0);
    }
  });
  it("rejects cross-workspace requests and draft version conflicts", async () => {
    const a = await seed(); const b = await seed();
    await expect(evaluateCarDecision(b.workspace.id, a.decision.id, 1)).rejects.toThrow("不存在");
    await saveCarDecision(a.workspace.id, { id: a.decision.id, expectedVersion: 1, expectedRevision: 1, facts: a.facts });
    await expect(saveCarDecision(a.workspace.id, { id: a.decision.id, expectedVersion: 1, expectedRevision: 1, facts: a.facts })).rejects.toThrow("草稿已变化");
  });
  it("excludes protected funds and resolves overlap between prepared cash and linked assets", async () => {
    const s = await seed();
    const goal = await db.goal.create({ data: { workspaceId: s.workspace.id, name: "教育", type: "EDUCATION", targetAmountMinor: 6000000n, targetDate: new Date("2030-01-01"), preparedAmountMinor: 5000000n, monthlyContributionMinor: 100000n } });
    await db.asset.create({ data: { workspaceId: s.workspace.id, goalId: goal.id, name: "教育存款", type: "CASH", currentValueMinor: 3000000n, liquidityLevel: "T0", riskLevel: 1 } });
    const missing = await carContext(db, s.workspace.id, s.facts, s.decision.id);
    expect(missing.missing.some((m) => m.includes("是否包含"))).toBe(true);
    const context = await carContext(db, s.workspace.id, { ...s.facts, goalReconciliations: [{ goalId: goal.id, preparedIncludesLinked: true }] }, s.decision.id);
    expect(context.otherGoalReserveMinor).toBe("2000000"); expect(context.otherGoalMonthlyMinor).toBe("100000");
    expect(context.sources).toHaveLength(1);
  });
  it("honors reservations created by the generic goal agent", async () => {
    const s = await seed();const goal=await db.goal.create({data:{workspaceId:s.workspace.id,name:"进修",type:"OTHER",targetAmountMinor:10000000n,preparedAmountMinor:10000000n,targetDate:new Date("2030-01-01")}});
    const generic=await db.goalDecision.create({data:{workspaceId:s.workspace.id,title:"进修",goalId:goal.id}});
    await db.goalFundingReservation.create({data:{workspaceId:s.workspace.id,decisionId:generic.id,assetId:s.asset.id,amountMinor:10000000n}});
    const context=await carContext(db,s.workspace.id,s.facts,s.decision.id);expect(context.missing.some(m=>m.includes("金额超过"))).toBe(true);expect(context.otherGoalReserveMinor).toBe("0");
    await expect(evaluateCarDecision(s.workspace.id,s.decision.id,1)).rejects.toThrow("资料已变化");
    const latest=await db.carDecision.findUniqueOrThrow({where:{id:s.decision.id}});
    const evaluation=await evaluateCarDecision(s.workspace.id,s.decision.id,latest.version);expect(evaluation.scenarios.every(x=>!x.adoptable)).toBe(true);
  });
  it("keeps only one active car plan so future income cannot fund two purchases", async () => {
    const s = await active();
    const d = await saveCarDecision(s.workspace.id, { expectedRevision: 2, facts: s.facts });
    await evaluateCarDecision(s.workspace.id, d!.id, 1);
    await expect(adoptCarDecision(s.workspace.id, d!.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH", reason: "另买一辆" })).rejects.toThrow("仅维护一个");
  });
  it("uses actual available funds in review and preserves the adopted plan until confirmation", async () => {
    const s = await active();
    const review = await reviewCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 2, expectedRevision: 2, month: currentCarMonth(), facts: s.facts, actualFundingMinor: "1000000", note: "只保留一万元给买车，其余另有安排" });
    const result = JSON.parse(review.resultJson);
    expect(result.needsAdjustment).toBe(true);
    expect(result.evaluation.scenarios.find((p: { key: string }) => p.key === "ON_TIME_CASH").feasible).toBe(false);
    const row = await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } });
    expect(row.activePlanId).toBe(s.plan.id); expect(row.version).toBe(3);
    expect(await db.carPlanVersion.count({ where: { decisionId: row.id } })).toBe(1);
    const adopted = await adoptCarDecision(s.workspace.id, row.id, { expectedVersion: 3, scenarioKey: "LOWER_BUDGET_CASH", reason: "减少预算", reviewId: review.id });
    expect(adopted.version).toBe(2);
    expect((await db.carMonthlyReview.findUniqueOrThrow({ where: { id: review.id } })).adoptedPlanId).toBe(adopted.id);
  });
  it("does not double-count cuts already reflected in actual spending", async () => {
    const cut = { id: "cut", name: "娱乐", amountMinor: "100000", impact: "少聚餐", accepted: true };
    const s = await active({ cuts: [cut] });
    const review = await reviewCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 2, expectedRevision: 2, month: currentCarMonth(), facts: { ...s.facts, livingExpensesMinor: "600000" }, actualFundingMinor: "17000000", note: "支出已减少1000元" });
    const result = JSON.parse(review.resultJson);
    expect(result.evaluation.scenarios[0].monthlyAfterPurchaseMinor).toBe("700000");
    expect(result.executedCuts).toEqual(["娱乐"]);
  });
  it("accepts executed cuts greater than the remaining actual expenses", async () => {
    const s = await active({ cuts: [{ id: "cut", name: "可选消费", amountMinor: "600000", impact: "暂停可选消费", accepted: true }] });
    const review = await reviewCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 2, expectedRevision: 2, month: currentCarMonth(), facts: { ...s.facts, livingExpensesMinor: "100000" }, actualFundingMinor: "17000000", note: "按真实支出维护" });
    expect(JSON.parse(review.resultJson).evaluation.scenarios[0].monthlyAfterPurchaseMinor).toBe("1200000");
  });
  it("rejects overreported actual balances", async () => {
    const s = await active();
    await expect(reviewCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 2, expectedRevision: 2, month: currentCarMonth(), facts: s.facts, actualFundingMinor: "99999999", note: "" })).rejects.toThrow("超过");
  });
  it("records actual purchase exactly once, then reviews debt without creating a second loan", async () => {
    const s = await active();
    const input = { expectedVersion: 2, expectedRevision: 2, actualPriceMinor: "12000000", actualFeesMinor: "1000000", actualVehicleValueMinor: "11000000", purchasedMonth: currentCarMonth(), loan: { quoted: true, annualRatePercent: "0", rateBasis: "NOMINAL_ANNUAL", termMonths: 12, downPaymentPercent: 50, maxPrincipalMinor: "6000000", method: "EQUAL_PAYMENT", feeMinor: "0" }, confirmLedgerUpdate: true };
    const preview = await previewCarPurchase(s.workspace.id, s.decision.id, input);
    expect(preview.scenario.upfrontMinor).toBe("7000000");
    expect((await db.asset.findUniqueOrThrow({ where: { id: s.asset.id } })).currentValueMinor).toBe(20000000n);
    expect(await db.liability.count({ where: { workspaceId: s.workspace.id } })).toBe(0);
    const purchase = await completeCarPurchase(s.workspace.id, s.decision.id, input);
    const retry = await completeCarPurchase(s.workspace.id, s.decision.id, input);
    expect(retry).toMatchObject({ vehicleAssetId: purchase.vehicleAssetId });
    expect((await db.asset.findUniqueOrThrow({ where: { id: s.asset.id } })).currentValueMinor).toBe(13000000n);
    expect(await db.liability.count({ where: { workspaceId: s.workspace.id } })).toBe(1);
    expect(await db.carFundingReservation.count({ where: { decisionId: s.decision.id } })).toBe(0);
    const row = await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } });
    const review = await reviewCarDecision(s.workspace.id, row.id, { expectedVersion: row.version, expectedRevision: 3, month: currentCarMonth(), facts: JSON.parse(row.factsJson), actualFundingMinor: "10000000", note: "实际购车后复盘" });
    expect(JSON.parse(review.resultJson).afterPurchaseBalanceMinor).toBe("100000");
    expect(JSON.parse(review.resultJson).evaluation.missing).toEqual([]);
  });
  it("recalculates on month changes rather than reusing an old cached evaluation", async () => {
    const s = await seed(); await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
    const current = currentCarMonth();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(`${addMonths(current, 1)}-02T00:00:00+08:00`));
    try {
      await expect(adoptCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH", reason: "确认" })).rejects.toThrow("月份已变化");
      const next = await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
      expect(next.asOfMonth).toBe(addMonths(current, 1));
    } finally { vi.useRealTimers(); }
  });
  it("keeps guidance usable when AI is unavailable and does not invent confirmed facts", async () => {
    const s = await seed({ budgetMinor: null, cashflowConfirmed: false });
    const reply = await guideCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, content: "我想买车，还不知道预算" });
    expect(reply.mode).toBe("FALLBACK"); expect(reply.facts.budgetMinor).toBeNull(); expect(reply.facts.cashflowConfirmed).toBe(false);
    expect(reply.conversation).toHaveLength(2);
  });
});
