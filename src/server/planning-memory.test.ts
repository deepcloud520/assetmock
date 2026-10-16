import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { carFactsSchema, currentCarMonth, addMonths } from "@/domain/car-planning";
import { resumeCarDecision, reconcileCarDependencies } from "./car-decision-state";
import { memoryContext, recordExplicitPreferences, updatePlanningMemory } from "./planning-memory";
import { saveCarDecision, evaluateCarDecision, adoptCarDecision, guideCarDecision, listCarDecisions } from "./car-planning";
vi.mock("./agent-runtime", () => ({ structuredResponse: vi.fn().mockRejectedValue(new Error("offline")) }));
const ids: string[] = [];
async function seed() {
  const workspace = await db.workspace.create({ data: { portfolioRevision: 1 } }); ids.push(workspace.id);
  const asset = await db.asset.create({ data: { workspaceId: workspace.id, name: "现金存款", type: "CASH", currentValueMinor: 20000000n, liquidityLevel: "T0", riskLevel: 1 } });
  const fund = await db.asset.create({ data: { workspaceId: workspace.id, name: "指数基金", type: "EQUITY_FUND", currentValueMinor: 8000000n, liquidityLevel: "T3", riskLevel: 4 } });
  const facts = carFactsSchema.parse({ purpose: "通勤买车", targetMonth: addMonths(currentCarMonth(), 6), budgetMinor: "12000000", landingFeesMinor: "1000000", runningMonthlyMinor: "100000", replacedTransportMinor: "0", monthlyIncomeMinor: "1500000", livingExpensesMinor: "700000", monthlyPremiumMinor: "100000", reserveFloorMinor: "3000000", cashflowConfirmed: true, costsConfirmed: true, insuranceConfirmed: true, constraintsConfirmed: true, sourcesConfirmed: true, otherGoalsConfirmed: true, sources: [{ assetId: asset.id, amountMinor: "20000000", availableMonth: currentCarMonth(), use: true }, { assetId: fund.id, amountMinor: "8000000", availableMonth: currentCarMonth(), use: false }] });
  const decision = await saveCarDecision(workspace.id, { expectedRevision: 1, facts });
  return { workspace, asset, fund, facts, decision };
}
afterAll(async () => { await db.workspace.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
describe("progressive decisions and evidence memory", () => {
  it("resumes one draft with unknown budget and reuses the ledger", async () => {
    const workspace = await db.workspace.create({ data: {} }); ids.push(workspace.id);
    await db.asset.create({ data: { workspaceId: workspace.id, name: "存款", type: "CASH", currentValueMinor: 8000000n, liquidityLevel: "T0", riskLevel: 1 } });
    const first = await resumeCarDecision(workspace.id, { intent: "明年想买车，还不知道预算" });
    const again = await resumeCarDecision(workspace.id, { intent: "明年想买车，还不知道预算" });
    expect(again.id).toBe(first.id);
    expect(await db.carDecision.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await db.goal.count({ where: { workspaceId: workspace.id } })).toBe(0);
    const facts = JSON.parse(first.factsJson);
    expect(facts.budgetMinor).toBeNull(); expect(facts.sources[0].amountMinor).toBe("8000000");
    expect(facts.sourcesConfirmed).toBe(false);
  });
  it("does not classify ambiguous goals as cars", async () => {
    const workspace = await db.workspace.create({ data: {} }); ids.push(workspace.id);
    await expect(resumeCarDecision(workspace.id, { intent: "想买车还是买房，还没决定" })).rejects.toThrow("明确");
    expect(await db.carDecision.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });
  it("links an unfinished old conversation without losing its messages or creating a goal", async () => {
    const workspace = await db.workspace.create({ data: {} }); ids.push(workspace.id);
    const session = await db.agentSession.create({ data: { workspaceId: workspace.id, kind: "GOAL_DISCOVERY", title: "旧对话", sourceRevision: 0, goalDraftJson: JSON.stringify({ target_amount_minor: "10000000", target_date: "2027-04-01" }), messages: { create: { role: "USER", content: "我想买车用于通勤", sourceRevision: 0 } } } });
    const draft = await resumeCarDecision(workspace.id, { intent: "明年想买车", goalSessionId: session.id });
    expect(draft.goalSessionId).toBe(session.id); expect(JSON.parse(draft.conversationJson)[0].content).toBe("我想买车用于通勤");
    expect(JSON.parse(draft.factsJson).budgetMinor).toBe("10000000");
    expect((await db.agentSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("CAR_LINKED");
  });
  it("keeps target cash limits separate from real balances and traces facts to a message", async () => {
    const s = await seed();
    const reply = await guideCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, content: "指数基金最多使用5万元，本次不想贷款" });
    expect(reply.facts.sources.find((a) => a.assetId === s.fund.id)?.amountMinor).toBe("5000000");
    expect((await db.asset.findUniqueOrThrow({ where: { id: s.fund.id } })).currentValueMinor).toBe(8000000n);
    expect(reply.facts.sourcesConfirmed).toBe(false); expect(reply.facts.cashflowConfirmed).toBe(true);
    const row = await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } });
    const evidence = JSON.parse(row.fieldEvidenceJson).sources;
    expect(JSON.parse(row.conversationJson).some((m: { id: string }) => m.id === evidence.sourceRef)).toBe(true);
  });
  it("extracts explicit preference evidence, without promoting scope or hard authority", async () => {
    const s = await seed();
    await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "message-1", "本次不想动基金");
    const memories = await memoryContext(db, s.workspace.id, s.decision.id, "EXPLAIN");
    expect(memories).toHaveLength(1); expect(memories[0]).toMatchObject({ quote: "本次不想动基金", sourceRef: "message-1", scope: "DECISION", nature: "SOFT" });
    expect(await memoryContext(db, s.workspace.id, s.decision.id, "CALCULATE")).toHaveLength(0);
    expect(await memoryContext(db, s.workspace.id, "another-goal", "CLARIFY")).toHaveLength(0);
  });
  it("requires explicit scope and constraint confirmation and never changes active plans", async () => {
    const s = await seed(); await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
    const plan = await adoptCarDecision(s.workspace.id, s.decision.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH" });
    await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "message-2", "只考虑全款");
    const memory = (await memoryContext(db, s.workspace.id, s.decision.id, "CLARIFY"))[0];
    await expect(updatePlanningMemory(s.workspace.id, memory.id, { expectedVersion: 1, action: "CONFIRM", scope: "GLOBAL" })).rejects.toThrow("跨目标");
    await expect(updatePlanningMemory(s.workspace.id, memory.id, { expectedVersion: 1, action: "CONFIRM", nature: "HARD" })).rejects.toThrow("具体");
    await updatePlanningMemory(s.workspace.id, memory.id, { expectedVersion: 1, action: "CONFIRM", nature: "HARD", confirmConstraint: true });
    expect((await memoryContext(db, s.workspace.id, s.decision.id, "CALCULATE"))).toHaveLength(1);
    expect((await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } })).activePlanId).toBe(plan.id);
    const choice = await db.planningMemory.findFirstOrThrow({ where: { decisionId: s.decision.id, evidenceType: "CHOICE" } });
    expect(choice.scope).toBe("DECISION"); expect(choice.content).not.toContain("厌恶"); expect(plan.reason).toContain("未另行说明动机");
  });
  it("deletion stops future context while immutable plan evidence remains", async () => {
    const s = await seed(); await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "message-3", "只考虑全款");
    const soft = (await memoryContext(db, s.workspace.id, s.decision.id, "CLARIFY"))[0];
    const hard = await updatePlanningMemory(s.workspace.id, soft.id, { expectedVersion: 1, action: "CONFIRM", nature: "HARD", confirmConstraint: true });
    const row = await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } });
    await evaluateCarDecision(s.workspace.id, row.id, row.version);
    const plan = await adoptCarDecision(s.workspace.id, row.id, { expectedVersion: row.version, scenarioKey: "ON_TIME_CASH" });
    await updatePlanningMemory(s.workspace.id, hard!.id, { expectedVersion: 1, action: "DELETE" });
    expect(await memoryContext(db, s.workspace.id, row.id, "CALCULATE")).toHaveLength(0);
    expect((await memoryContext(db, s.workspace.id, row.id, "CLARIFY"))).toHaveLength(0);
    const snapshot = JSON.parse((await db.carPlanVersion.findUniqueOrThrow({ where: { id: plan.id } })).snapshotJson);
    expect(snapshot.acceptedTradeoffs.preferences[0].id).toBe(hard!.id);
  });
  it("an unverified inference cannot become an effective constraint even with malformed stored authority", async () => {
    const s = await seed();
    await db.planningMemory.create({ data: { workspaceId: s.workspace.id, decisionId: s.decision.id, content: "可能偏好不贷款", quote: "选择全款", sourceRef: "choice", evidenceType: "INFERENCE", nature: "HARD", status: "ACTIVE", confirmedAt: new Date(), ruleJson: '{"kind":"CASH_ONLY"}', reviewWhen: "待核实" } });
    expect(await memoryContext(db, s.workspace.id, s.decision.id, "CALCULATE")).toHaveLength(0);
  });
  it("isolates workspaces for memory reads, edits and foreign session links", async () => {
    const a = await seed(); const b = await seed();
    await recordExplicitPreferences(db, a.workspace.id, a.decision.id, "message-a", "只考虑全款");
    const memory = (await memoryContext(db, a.workspace.id, a.decision.id, "CLARIFY"))[0];
    expect(await memoryContext(db, b.workspace.id, a.decision.id, "EXPLAIN")).toHaveLength(0);
    await expect(updatePlanningMemory(b.workspace.id, memory.id, { expectedVersion: 1, action: "DELETE" })).rejects.toThrow("变化");
    await expect(resumeCarDecision(b.workspace.id, { intent: "我想买车", goalSessionId: "foreign" })).rejects.toThrow("原会话");
  });
  it("rechecks changed used assets, preserves independent confirmations and expires proposals", async () => {
    const s = await seed(); await evaluateCarDecision(s.workspace.id, s.decision.id, 1);
    await db.asset.update({ where: { id: s.asset.id }, data: { currentValueMinor: 15000000n } });
    await db.workspace.update({ where: { id: s.workspace.id }, data: { portfolioRevision: { increment: 1 } } });
    await listCarDecisions(s.workspace.id);
    const row = await db.carDecision.findUniqueOrThrow({ where: { id: s.decision.id } }); const facts = JSON.parse(row.factsJson);
    expect(row.evaluationJson).toBeNull(); expect(facts.sourcesConfirmed).toBe(false); expect(facts.sources[0].amountMinor).toBe("15000000");
    expect(facts.costsConfirmed).toBe(true); expect(facts.insuranceConfirmed).toBe(true); expect(facts.cashflowConfirmed).toBe(true);
    await expect(adoptCarDecision(s.workspace.id, row.id, { expectedVersion: 1, scenarioKey: "ON_TIME_CASH" })).rejects.toThrow("变化");
  });
  it("rechecks related asset constraints but preserves unrelated preferences", async () => {
    const s = await seed(); await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "message-fund", "本次不想动基金，只考虑全款");
    const preferences = await memoryContext(db, s.workspace.id, s.decision.id, "CLARIFY");
    const fund = preferences.find((m) => JSON.parse(m.ruleJson).kind === "EXCLUDE_ASSET")!;
    await updatePlanningMemory(s.workspace.id, fund.id, { expectedVersion: 1, action: "CONFIRM", nature: "HARD", confirmConstraint: true });
    await db.asset.update({ where: { id: s.fund.id }, data: { currentValueMinor: 7000000n } });
    await db.$transaction((tx) => reconcileCarDependencies(tx, s.workspace.id));
    const all = await db.planningMemory.findMany({ where: { workspaceId: s.workspace.id } });
    expect(all.some((m) => m.nature === "HARD" && m.status === "REVIEW")).toBe(true);
    expect(all.some((m) => JSON.parse(m.ruleJson).kind === "CASH_ONLY" && m.status === "ACTIVE")).toBe(true);
  });
  it("uses the current expression to flag a conflicting old constraint for review", async () => {
    const s = await seed(); await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "before", "只考虑全款");
    const old = (await memoryContext(db, s.workspace.id, s.decision.id, "CLARIFY"))[0];
    await recordExplicitPreferences(db, s.workspace.id, s.decision.id, "after", "现在可以贷款");
    expect((await db.planningMemory.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("REVIEW");
    expect((await memoryContext(db, s.workspace.id, s.decision.id, "CLARIFY")).map((m) => m.quote)).toEqual(["现在可以贷款"]);
  });
});
