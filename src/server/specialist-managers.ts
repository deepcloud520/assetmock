import { goalFactsSchema } from "@/domain/agents";
import { agentFacts } from "./agent-context";
import { assessGenericGoal } from "./goal-capabilities";
import { applyRedLines, currentConstraints } from "./decision-database";
import { naturalDate } from "@/domain/database-planning";
import { createBudget, policyColumns, professionalState, publishedProducts, recordRevision, registerDependencies } from "./unified-store";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { budgetCapacity, budgetSchema, holdingSchema, insuranceNeedsSchema, investmentNeedsSchema, monthlyPremium, policySchema, screenInsurance, screenInvestments, type ProductMatch } from "@/domain/specialist-managers";

import { currentCarMonth, carFactsSchema, evaluateCarPlan } from "@/domain/car-planning";
import { ApiError, serialize } from "./portfolio";
import { carContext } from "./car-planning";
import { reconcileCarDependencies } from "./car-decision-state";
import { memoryContext, memoryEvidence } from "./planning-memory";
import { professionalFacts } from "./specialist-bridge";
import { structuredResponse } from "./agent-runtime";
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const day = () => `${currentCarMonth()}-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", day: "2-digit" }).format(new Date())}`;
const version = z.number().int().nonnegative();
async function stateClaim(tx: Prisma.TransactionClient, workspaceId: string, expected: number) {
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } }); if (!workspace) throw new ApiError("工作区不存在", 404);
  await professionalState(tx, workspaceId);
  const claim = await tx.workspace.updateMany({ where: { id: workspaceId, professionalRevision: expected }, data: { professionalRevision: { increment: 1 } } });
  if (!claim.count) throw new ApiError("专业资料已变化，请刷新", 409);
  return professionalState(tx, workspaceId);
}
async function loadFacts(tx: Prisma.TransactionClient, workspaceId: string) {
  const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { profile: true, assets: { where: { deletedAt: null } }, liabilities: { where: { deletedAt: null } }, goals: { where: { deletedAt: null } } } });
  if (!workspace) throw new ApiError("工作区不存在", 404);
  const [state, policies, holdings, reservations, memories, decisions, genericReservations, genericDecisions] = await Promise.all([
    professionalState(tx, workspaceId), tx.insurancePolicy.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" } }), tx.holdingDetail.findMany({ where: { workspaceId, asset: { deletedAt: null } }, orderBy: { assetId: "asc" } }), tx.carFundingReservation.findMany({ where: { workspaceId } }), tx.planningMemory.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: { id: "asc" } }), tx.carDecision.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
    tx.goalFundingReservation.findMany({where:{workspaceId}}),tx.goalDecision.findMany({where:{workspaceId,legacyDecisionId:null,status:{not:"REDACTED"}},orderBy:{id:"asc"}}),
  ]);
  const productCatalog = await publishedProducts(tx);
  const signature = createHash("sha256").update(json({ day: day(), portfolio: workspace.portfolioRevision, transactions: workspace.transactionRevision, state, policies, holdings, memories, reservations:[...reservations,...genericReservations], genericDecisions:genericDecisions.map(d=>({id:d.id,version:d.version,activePlanId:d.activePlanId})), decisions: decisions.map((d) => ({ id: d.id, version: d.version, activePlanId: d.activePlanId })), catalog: productCatalog.map((p) => [p.id, p.version]) })).digest("hex");
  return { workspace, state, policies, holdings, reservations:[...reservations,...genericReservations], memories, decisions, genericDecisions, signature, productCatalog };
}
async function createAction(tx: Prisma.TransactionClient, workspaceId: string, key: string, manager: string, title: string, reason: string, revision: number, details: object, dueDate?: Date) {
  const old = await tx.action.findUnique({ where: { sourceKey: key } }); if (old) return old;
  const task = await tx.agentTask.create({ data: { workspaceId, type: "SPECIALIST", status: "COMPLETED", sourceRevision: revision, completedAt: new Date() } });
  return tx.action.create({ data: { workspaceId, sourceKey: key, generationTaskId: task.id, sourceRevision: revision, kind: `SPECIALIST_${manager}`, title, reason, priority: 1, status: "ACCEPTED", verificationType: "USER_CONFIRMATION", dueDate, detailsJson: json({ ...details, manager, steps: [reason], completionCriteria: "完成后确认实际情况", verificationRequired: "仅用户声明，未自动验证外部交易" }) } });
}
async function syncReminders(tx: Prisma.TransactionClient, facts: Awaited<ReturnType<typeof loadFacts>>) {
  const workspaceId = facts.workspace.id; const expected: string[] = [];
  async function add(key: string, manager: string, title: string, due: string, details: object) {
    expected.push(key); const existing = await tx.managerReminder.findUnique({ where: { sourceKey: key } });
    const dueDate = new Date(`${due}T00:00:00+08:00`);
    const changed = existing && (existing.dueDate.getTime() !== dueDate.getTime() || existing.title !== title);
    if (changed && existing.actionId) await tx.action.updateMany({ where: { id: existing.actionId, status: { in: ["ACCEPTED", "DEFERRED"] } }, data: { status: "DISMISSED" } });
    const row = await tx.managerReminder.upsert({ where: { sourceKey: key }, create: { workspaceId, sourceKey: key, manager, title, dueDate, detailsJson: json(details) }, update: { title, dueDate, detailsJson: json(details), ...(changed ? { status: "OPEN", snoozedUntil: null, actionId: null } : {}) } });
    if (row.status === "SNOOZED" && row.snoozedUntil && row.snoozedUntil <= new Date()) { await tx.managerReminder.update({ where: { id: row.id }, data: { status: "OPEN", snoozedUntil: null } }); if (row.actionId) await tx.action.updateMany({ where: { id: row.actionId, status: "DEFERRED" }, data: { status: "ACCEPTED" } }); }
    if (row.status === "OPEN" && due <= day() && !row.actionId) {
      const action = await createAction(tx, workspaceId, `REMINDER:${key}:${due}`, manager, title, "日期已到，请核对实际情况；未确认不代表未到账或未执行。", facts.state?.version ?? 0, details, dueDate);
      await tx.managerReminder.update({ where: { id: row.id }, data: { actionId: action.id } });
    }
  }
  for (const row of facts.policies) { const p = policySchema.parse(JSON.parse(row.dataJson)); if (p.confirmed) for (const [kind, due, label] of [["payment", p.nextPaymentOn, "缴费"], ["renewal", p.renewalOn, "续保"]] as const) if (due) await add(`POLICY:${row.id}:${kind}`, "INSURANCE", `${p.name}：核对${label}`, due, { policyId: row.id }); }
  for (const d of facts.decisions.filter((d) => d.status !== "PURCHASED")) { const f = carFactsSchema.parse(JSON.parse(d.factsJson)); for (const b of f.bonuses.filter((b) => b.confirmed)) await add(`BONUS:${d.id}:${b.id}`, "GOAL", `核对${b.name}是否到账`, `${b.month}-01`, { decisionId: d.id, bonusId: b.id }); if (d.activePlanId) await add(`REVIEW:${d.id}:${currentCarMonth()}`, "GOAL", "核对本月目标准备进度", `${currentCarMonth()}-01`, { decisionId: d.id }); }
  for(const d of facts.genericDecisions.filter(d=>d.status==="ACTIVE"&&d.activePlanId))await add(`GENERIC_REVIEW:${d.id}:${currentCarMonth()}`,"GOAL",`核对“${d.title}”本月资金进度`,`${currentCarMonth()}-01`,{genericDecisionId:d.id});
  const outdated = await tx.managerReminder.findMany({ where: { workspaceId, status: { in: ["OPEN", "SNOOZED"] }, sourceKey: { notIn: expected } } });
  for (const r of outdated) { await tx.managerReminder.update({ where: { id: r.id }, data: { status: "CLOSED" } }); if (r.actionId) await tx.action.updateMany({ where: { id: r.actionId, status: { in: ["ACCEPTED", "DEFERRED"] } }, data: { status: "DISMISSED" } }); }
}
export async function getManagers(workspaceId: string) {
  return db.$transaction(async (tx) => {
    await reconcileCarDependencies(tx, workspaceId);
    const f = await loadFacts(tx, workspaceId); const professional = await professionalFacts(tx, workspaceId);
    await syncReminders(tx, f);
    const premium = monthlyPremium(professional.policies);
    const debt = f.workspace.liabilities.reduce((s, l) => s + l.monthlyPaymentMinor, 0n); const goals = f.workspace.goals.reduce((s, g) => s + g.monthlyContributionMinor, 0n);
    const capacity = professional.budget ? budgetCapacity(professional.budget, debt, premium, goals) : null;
    const evaluations = await tx.professionalEvaluation.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 20 });
    const reminders = await tx.managerReminder.findMany({ where: { workspaceId }, orderBy: { dueDate: "asc" }, take: 100 });
    const selections = await tx.productSelection.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 50 });
    const total = f.workspace.assets.reduce((sum, a) => sum + a.currentValueMinor, 0n);
    const largest = [...f.workspace.assets].sort((a, b) => a.currentValueMinor > b.currentValueMinor ? -1 : a.currentValueMinor < b.currentValueMinor ? 1 : 0)[0];
    const allocation = { totalMinor: total.toString(), largestName: largest?.name ?? null, largestRatioPercent: total > 0n && largest ? Number(largest.currentValueMinor * 10000n / total) / 100 : null, protectedCount: f.workspace.assets.filter((a) => a.goalId || !a.isAdjustable).length };
    const impacts = [];
    for (const d of f.decisions) {
      const facts = carFactsSchema.parse(JSON.parse(d.factsJson)); const context = await carContext(tx, workspaceId, facts, d.id); const evaluation = await applyRedLines(tx, workspaceId, d.id, facts, context, evaluateCarPlan(facts, context));
      const active = d.activePlanId ? await tx.carPlanVersion.findUnique({ where: { id: d.activePlanId } }) : null;
      const snapshot = active ? JSON.parse(active.snapshotJson) : null;
      impacts.push({ id: d.id, status: d.status, name: facts.purpose, activePlanId: d.activePlanId, missing: evaluation.missing, summary: d.status === "PURCHASED" ? "已购车，继续维护实际费用" : evaluation.missing.length ? "资料变化或尚待确认，请核对后比较；生效方案保留" : evaluation.scenarios.some((s) => s.adoptable) ? "当前条件存在可行安排，可与生效方案比较" : "当前条件存在缺口，需要比较调整", assumptions: snapshot?.acceptedTradeoffs ?? null });
    }
    if(f.genericDecisions.length){const shared=await agentFacts(workspaceId,null,null,tx);for(const d of f.genericDecisions){
      const parsed=goalFactsSchema.safeParse(JSON.parse(d.factsJson));if(!parsed.success){impacts.push({id:d.id,status:d.status,name:d.title,activePlanId:d.activePlanId,missing:["目标资料需重新核对"],summary:"目标资料尚不完整，原方案保留",assumptions:null,generic:true});continue;}const result=assessGenericGoal(parsed.data,shared,d.goalId,d.id);
      impacts.push({id:d.id,status:d.status,name:d.title,activePlanId:d.activePlanId,missing:result.missing,summary:result.status==="FEASIBLE"?"当前条件可行，可进入目标管家比较与确认":result.status==="INFEASIBLE"?"当前资金存在缺口，请比较调整；原方案保留":"资料尚待核对，补齐后重新计算；原方案保留",assumptions:null,generic:true});
    }}
    const productVersions = (await tx.productVersion.findMany({ where: { status: "PUBLISHED" } })).map((v) => ({ id: v.id, name: JSON.parse(v.dataJson).name, category: JSON.parse(v.dataJson).category, version: v.version }));
    return serialize({ productVersions, version: f.state?.version ?? 0, sourceSignature: f.signature, workspace: f.workspace, budget: professional.budget, insuranceNeeds: JSON.parse(f.state?.insuranceJson ?? "{}"), investmentNeeds: JSON.parse(f.state?.investmentJson ?? "{}"), policies: f.policies.map((p) => ({ id: p.id, version: p.version, productVersionId: p.productVersionId, data: JSON.parse(p.dataJson) })), holdings: f.holdings.map((h) => ({ id: h.id, version: h.version, assetId: h.assetId, productVersionId: h.productVersionId, data: JSON.parse(h.dataJson) })), reservations: f.reservations, premiumMinor: premium, debtMinor: debt, goalMonthlyMinor: goals, capacity, allocation, expensesReady: professional.expenseReady, coverageState: professional.coverageState,
      evaluations: evaluations.map((e) => ({ id: e.id, manager: e.manager, createdAt: e.createdAt, isStale: e.sourceSignature !== f.signature, input: JSON.parse(e.inputJson), result: JSON.parse(e.resultJson) })), selections: selections.map((s) => ({ ...s, snapshot: JSON.parse(s.snapshotJson) })), reminders: reminders.map((r) => ({ ...r, isDue: r.status === "OPEN" && r.dueDate <= new Date(), details: JSON.parse(r.detailsJson) })), impacts });
  }, { timeout: 15000 });
}
const commandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("BUDGET"), expectedVersion: version, data: budgetSchema, validFrom: naturalDate.optional(), reason: z.string().min(1).max(500).default("确认预算"), historical: z.boolean().default(false), schedule: z.object({ incomeDay: z.number().int().min(1).max(31).nullable().optional(), debtDay: z.number().int().min(1).max(31).nullable().optional(), premiumDay: z.number().int().min(1).max(31).nullable().optional(), fixedDay: z.number().int().min(1).max(31).nullable().optional() }).strict().optional() }).strict(),
  z.object({ command: z.literal("POLICY"), expectedVersion: version, id: z.string().optional(), data: policySchema, productVersionId: z.string().nullable().optional(), pageHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional() }).strict(),
  z.object({ command: z.literal("DELETE_POLICY"), expectedVersion: version, id: z.string() }).strict(),
  z.object({ command: z.literal("HOLDING"), expectedVersion: version, data: holdingSchema, productVersionId: z.string().nullable().optional(), pageHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional() }).strict(),
  z.object({ command: z.literal("INSURANCE_NEEDS"), expectedVersion: version, data: insuranceNeedsSchema }).strict(),
  z.object({ command: z.literal("INVESTMENT_NEEDS"), expectedVersion: version, data: investmentNeedsSchema }).strict(),
  z.object({ command: z.literal("EVALUATE"), manager: z.enum(["INSURANCE", "INVESTMENT", "CASHFLOW"]), expectedVersion: version }).strict(),
  z.object({ command: z.literal("SELECT"), evaluationId: z.string(), productId: z.string(), confirm: z.literal(true) }).strict(),
  z.object({ command: z.literal("REMINDER"), id: z.string(), status: z.enum(["DONE", "CLOSED", "SNOOZED", "OPEN"]), snoozedUntil: z.string().datetime().optional() }).strict(),
]);
export async function managerCommand(workspaceId: string, body: unknown) {
  const input = commandSchema.parse(body);
  await db.$transaction((tx) => applyManagerCommand(tx, workspaceId, input), { timeout: 15000 });
  return getManagers(workspaceId);
}
export async function applyManagerCommand(tx: Prisma.TransactionClient, workspaceId: string, body: unknown) {
  const input = commandSchema.parse(body);
    const f = await loadFacts(tx, workspaceId);
    if (input.command === "SELECT") {
      const e = await tx.professionalEvaluation.findFirst({ where: { id: input.evaluationId, workspaceId } }); if (!e) throw new ApiError("评估不存在", 404);
      const prior = await tx.productSelection.findUnique({ where: { workspaceId_evaluationId_productId: { workspaceId, evaluationId: e.id, productId: input.productId } } }); if (prior) return;
      if (e.sourceSignature !== f.signature) throw new ApiError("资料或产品版本已变化，请重新评估", 409);
      const match = (JSON.parse(e.resultJson).products as ProductMatch[]).find((p) => p.product.id === input.productId);
      if (!match || match.status === "EXCLUDED") throw new ApiError("该产品不满足条件，不能选择", 422);
      const selection = await tx.productSelection.create({ data: { workspaceId, evaluationId: e.id, productId: input.productId, snapshotJson: json({ product: match.product, status: match.status, missing: match.missing, input: JSON.parse(e.inputJson), confirmedAt: new Date().toISOString(), evidenceType: "CHOICE", purchaseStatus: "NOT_PURCHASED" }) } });
      const pv = await tx.productVersion.findUnique({ where: { productId_version: { productId: match.product.id, version: match.product.version } } });
      if (pv) await tx.productSelectionVersion.create({ data: { selectionId: selection.id, workspaceId, productVersionId: pv.id } });
      await registerDependencies(tx, workspaceId, "PRODUCT_SELECTION", selection.id);
      await createAction(tx, workspaceId, `PRODUCT:${selection.id}`, e.manager, match.status === "PENDING" ? `核实${match.product.name}` : `办理前核对${match.product.name}`, "已保存意向，需核实条件和报价后在外部平台操作；没有记录实际购买。", f.state?.version ?? 0, { selectionId: selection.id, sourceUrl: match.product.sourceUrl, missing: match.missing }); return;
    }
    if (input.command === "REMINDER") {
      const r = await tx.managerReminder.findFirst({ where: { id: input.id, workspaceId } }); if (!r) throw new ApiError("提醒不存在", 404);
      if (input.status === "SNOOZED" && (!input.snoozedUntil || new Date(input.snoozedUntil) <= new Date())) throw new ApiError("请选择未来的提醒时间", 422);
      await tx.managerReminder.update({ where: { id: r.id }, data: { status: input.status, snoozedUntil: input.status === "SNOOZED" ? new Date(input.snoozedUntil!) : null } });
      if (r.actionId) { const next = input.status === "DONE" ? "USER_MARKED_COMPLETED" : input.status === "CLOSED" ? "DISMISSED" : input.status === "SNOOZED" ? "DEFERRED" : "ACCEPTED"; const a = await tx.action.findUnique({ where: { id: r.actionId } }); if (a) { await tx.action.update({ where: { id: a.id }, data: { status: next } }); await tx.actionFeedback.create({ data: { actionId: a.id, fromStatus: a.status, toStatus: next, reason: "用户处理专业提醒；完成仅为用户声明" } }); } } return;
    }
    if (input.command === "EVALUATE") {
      if (input.expectedVersion !== (f.state?.version ?? 0)) throw new ApiError("资料已变化，请刷新", 409);
      const preferences = await memoryContext(tx, workspaceId, input.manager === "INVESTMENT" ? JSON.parse(f.state?.investmentJson ?? "{}").decisionId ?? undefined : undefined, "EXPLAIN");
      let result: object; let facts: object; const redLines: { constraintId: string; result: string; detail: string }[] = [];
      if (input.manager === "INSURANCE") {
        const needs = insuranceNeedsSchema.parse(JSON.parse(f.state?.insuranceJson ?? "{}")); facts = needs;
        result = { summary: "先比较关注的保障类型；个人报价、健康告知及承保条件需进一步核实。", products: screenInsurance(f.productCatalog, needs), missing: needs.status === "UNKNOWN" ? ["已有保障尚未核实，不判断保障充分或缺口金额"] : [], evidence: memoryEvidence(preferences), assumptions: ["静态资料不表示当前可投保", "推荐为待核实候选，不代表核保通过"], actions: ["核对已有保单", "获取适用个人报价和最新条款"] };
      } else if (input.manager === "INVESTMENT") {
        const needs = investmentNeedsSchema.parse(JSON.parse(f.state?.investmentJson ?? "{}")); facts = needs;
        const constraints = await memoryContext(tx, workspaceId, needs.decisionId ?? undefined, "CALCULATE");
        const asset = f.workspace.assets.find((a) => a.id === needs.assetId);
        const occupied = f.reservations.filter((r) => r.assetId === needs.assetId).reduce((s, r) => s + r.amountMinor, 0n);
        const excluded = [...constraints, ...preferences.filter((m) => m.evidenceType === "EXPRESSION")].some((m) => { const rule = JSON.parse(m.ruleJson); return rule.kind === "EXCLUDE_ASSET" && rule.assetId === needs.assetId; });
        const structured = await currentConstraints(tx, workspaceId, needs.decisionId ?? undefined);
        for (const c of structured) {
          let status = "PASS";
          if (c.type === "NO_USE_ASSET" && c.assetId === needs.assetId) status = "VIOLATED";
          if (c.type === "NO_USE_GOAL_FUND" && asset?.goalId === c.goalId) status = "VIOLATED";
          if (["MIN_LIQUID", "NO_USE_EMERGENCY"].includes(c.type)) { const cash = f.workspace.assets.filter((a) => a.currency === "CNY" && a.liquidityLevel === "T0" && !a.goalId).reduce((sum, a) => sum + a.currentValueMinor, 0n) - f.reservations.reduce((sum, r) => sum + r.amountMinor, 0n) - BigInt(needs.amountMinor); status = !needs.assetId ? "UNDETERMINED" : (c.operator === "GT" ? cash > c.thresholdValue! : cash >= c.thresholdValue!) ? "PASS" : "VIOLATED"; }
          if (c.type === "OTHER") status = "SKIPPED_MANUAL";
          redLines.push({ constraintId: c.id, result: status, detail: c.userText });
        }
        const forbidden = redLines.some((c) => c.result !== "PASS") || Boolean(needs.assetId && (!asset || asset.goalId || !asset.isAdjustable || asset.currency !== "CNY" || excluded || BigInt(needs.amountMinor) > asset.currentValueMinor - occupied));
        result = { summary: "按用途、期限、流动性和已确认风险条件筛选；不同类别不按收益混排。", products: screenInvestments(f.productCatalog, needs, day(), forbidden), redLines, evidence: memoryEvidence(preferences), assumptions: ["不假设未来收益填补目标缺口", "产品选择不会改动真实持仓"], actions: ["核实实际渠道风险等级与赎回到账", "操作前重新核对资金占用"] };
      } else {
        const b = budgetSchema.parse(JSON.parse(f.state?.budgetJson ?? "{}")); facts = b;
        const p = await professionalFacts(tx, workspaceId);
        result = { summary: "已确认预算用于规划，实际存款须另外核对。", capacity: budgetCapacity(b, f.workspace.liabilities.reduce((s, l) => s + l.monthlyPaymentMinor, 0n), monthlyPremium(p.policies), f.workspace.goals.reduce((s, g) => s + g.monthlyContributionMinor, 0n)), products: [], evidence: memoryEvidence(preferences), missing: p.expenseReady ? [] : ["保费承诺尚未完整核实，可投入金额仅为初步值"], actions: ["核对实际余额与本月变化"] };
      }
      const evaluated = await tx.professionalEvaluation.create({ data: { workspaceId, manager: input.manager, sourceSignature: f.signature, inputJson: json(facts), resultJson: json({ ...result, sourceVersion: { portfolio: f.workspace.portfolioRevision, transactions: f.workspace.transactionRevision, professional: f.state?.version ?? 0 }, calculatedOn: day() }) } }); for (const p of (result as { products?: ProductMatch[] }).products ?? []) for (const c of redLines) await tx.redLineCheck.create({ data: { workspaceId, professionalEvaluationId: evaluated.id, constraintId: c.constraintId, candidateKey: p.product.id, result: c.result, detailJson: json({ text: c.detail }) } }); await registerDependencies(tx, workspaceId, "PROFESSIONAL_EVALUATION", evaluated.id); return;
    }
    await stateClaim(tx, workspaceId, input.expectedVersion);
    await recordRevision(tx, workspaceId, "PROFESSIONAL", input.command === "POLICY" || input.command === "DELETE_POLICY" ? input.id ?? workspaceId : workspaceId, { command: input.command, prior: { budget: f.state.budgetJson, insurance: f.state.insuranceJson, investment: f.state.investmentJson, policies: f.policies, holdings: f.holdings } }, "专业资料修改前");
    if (input.command === "BUDGET") {
      const includedDebt = input.data.debtIncluded ? f.workspace.liabilities.reduce((sum, l) => sum + l.monthlyPaymentMinor, 0n) : 0n;
      const pro = await professionalFacts(tx, workspaceId);
      const acceptedCuts = input.data.cuts.filter((c) => c.accepted).reduce((sum, c) => sum + BigInt(c.amountMinor), 0n);
      if (BigInt(input.data.livingMinor) - acceptedCuts < includedDebt + (input.data.premiumsIncluded ? BigInt(pro.premiumMinor) : 0n)) throw new ApiError("消费调整后的生活预算不足以包含声明的还款和保费，请核对口径", 422);
    }
    if (input.command === "BUDGET") await createBudget(tx, workspaceId, input.data, input.validFrom, input.reason, input.schedule, input.historical);
    if (input.command === "INSURANCE_NEEDS") { if (input.data.status === "NONE" && f.policies.length) throw new ApiError("仍有已登记保单，不能声明没有保障；请核对或删除记录", 422); await tx.insuranceNeed.upsert({ where: { workspaceId }, create: { workspaceId, status: input.data.status, insured: "本人", category: input.data.category, dataJson: json({ ...input.data, insured: "本人" }) }, update: { status: input.data.status, insured: "本人", category: input.data.category, dataJson: json({ ...input.data, insured: "本人" }), version: { increment: 1 } } }); }
    if (input.command === "INVESTMENT_NEEDS") {
      if (input.data.assetId && !f.workspace.assets.some((a) => a.id === input.data.assetId)) throw new ApiError("资产不属于当前工作区", 422);
      if (input.data.decisionId && !f.decisions.some((d) => d.id === input.data.decisionId)) throw new ApiError("决策不属于当前工作区", 422);
      await tx.investmentNeed.upsert({ where: { workspaceId }, create: { workspaceId, assetId: input.data.assetId, decisionId: input.data.decisionId, category: input.data.category, dataJson: json(input.data) }, update: { assetId: input.data.assetId, decisionId: input.data.decisionId, category: input.data.category, dataJson: json(input.data), version: { increment: 1 } } });
    }
    if ((input.command === "POLICY" || input.command === "HOLDING") && input.productVersionId) {
      const p = await tx.productVersion.findUnique({ where: { id: input.productVersionId } }); if (!p) throw new ApiError("关联产品版本不存在", 422);
      const category = JSON.parse(p.dataJson).category; const insurance = ["ACCIDENT", "MEDICAL", "TERM_LIFE"].includes(category);
      if (insurance !== (input.command === "POLICY")) throw new ApiError("产品类别与保单或持仓不匹配", 422);
    }
    if (input.command === "POLICY") {
      if (!input.id && input.data.insured !== "本人") throw new ApiError("本版本仅登记本人的新增保单", 422);
      const linked = input.data.cashValueAssetId ? f.workspace.assets.find((a) => a.id === input.data.cashValueAssetId) : null;
      if (input.data.cashValueAssetId && (!linked || linked.type !== "INSURANCE_CASH_VALUE")) throw new ApiError("现金价值只能关联本工作区的保险现金价值资产", 422);
      if (input.id) { const claim = await tx.insurancePolicy.updateMany({ where: { id: input.id, workspaceId, deletedAt: null }, data: { ...policyColumns(input.data), ...(input.productVersionId !== undefined ? { productVersionId: input.productVersionId } : {}), dataJson: json(input.data), version: { increment: 1 } } }); if (!claim.count) throw new ApiError("保单不存在", 404); }
      else await tx.insurancePolicy.create({ data: { workspaceId, ...policyColumns(input.data), ...(input.productVersionId !== undefined ? { productVersionId: input.productVersionId } : {}), dataJson: json(input.data) } });
      await recordRevision(tx, workspaceId, "POLICY", input.id ?? (await tx.insurancePolicy.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: "desc" } })).id, input.data, "保单资料确认");
      const policyId = input.id ?? (await tx.insurancePolicy.findFirstOrThrow({ where: { workspaceId }, orderBy: { createdAt: "desc" } })).id;
      await tx.sourceEvidence.create({ data: { workspaceId, entityType: "POLICY", entityId: policyId, sourceType: "USER_ENTRY", reviewedAt: input.data.confirmed ? new Date() : null, note: input.data.note || "用户录入；未核对原附件", pageHash: input.pageHash ?? null } });
      const needs = JSON.parse(f.state?.insuranceJson ?? "{}"); await tx.insuranceNeed.upsert({ where: { workspaceId }, create: { workspaceId, status: "PROVIDED", dataJson: json({ ...needs, status: "PROVIDED" }) }, update: { status: "PROVIDED", dataJson: json({ ...needs, status: "PROVIDED" }), version: { increment: 1 } } });
    }
    if (input.command === "DELETE_POLICY") { const claim = await tx.insurancePolicy.updateMany({ where: { id: input.id, workspaceId, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } }); if (!claim.count) throw new ApiError("保单不存在", 404); }
    if (input.command === "HOLDING") {
      const asset = f.workspace.assets.find((a) => a.id === input.data.assetId); if (!asset) throw new ApiError("资产不属于当前工作区", 422);
      if (input.data.feeMinor !== null && BigInt(input.data.feeMinor) > asset.currentValueMinor) throw new ApiError("动用费用不能超过资产余额", 422);
      await tx.holdingDetail.upsert({ where: { assetId: asset.id }, create: { workspaceId, assetId: asset.id, ...(input.productVersionId !== undefined ? { productVersionId: input.productVersionId } : {}), availableOn: input.data.availableOn, feeMinor: input.data.feeMinor === null ? null : BigInt(input.data.feeMinor), confirmed: input.data.confirmed, dataJson: json(input.data) }, update: { ...(input.productVersionId !== undefined ? { productVersionId: input.productVersionId } : {}), availableOn: input.data.availableOn, feeMinor: input.data.feeMinor === null ? null : BigInt(input.data.feeMinor), confirmed: input.data.confirmed, dataJson: json(input.data), version: { increment: 1 } } });
    }
    await reconcileCarDependencies(tx, workspaceId);
    const current = await professionalState(tx, workspaceId);
    if (input.command === "HOLDING") await tx.sourceEvidence.create({ data: { workspaceId, entityType: "HOLDING", entityId: input.data.assetId, sourceType: "USER_ENTRY", reviewedAt: input.data.confirmed ? new Date() : null, note: input.data.note || "用户录入；未连接机构验证", pageHash: input.pageHash ?? null } });
    await tx.auditEvent.create({ data: { workspaceId, entityType: "SPECIALIST", entityId: workspaceId, action: input.command, revision: current.version } });
}
export async function explainManager(workspaceId: string, body: unknown) {
  const input = z.object({ evaluationId: z.string(), question: z.string().trim().min(1).max(1000) }).strict().parse(body);
  const e = await db.professionalEvaluation.findFirst({ where: { workspaceId, id: input.evaluationId } }); if (!e) throw new ApiError("请先完成本领域评估", 404);
  const currentSignature = await db.$transaction(async (tx) => { await reconcileCarDependencies(tx, workspaceId); return (await loadFacts(tx, workspaceId)).signature; });
  if (e.sourceSignature !== currentSignature) throw new ApiError("资料或产品版本已变化，请重新评估后提问", 409);
  const schema = { type: "object", additionalProperties: false, required: ["reply"], properties: { reply: { type: "string" } } };
  try { const answer = await structuredResponse<{ reply: string }>("解释已提供的专业结果。只能引用输入事实和产品资料，不得补写数字、条款、收益、承保结论或修改推荐排序。资料缺失说明需核实。回答当前问题，最多两个补问。", { question: input.question, evaluation: JSON.parse(e.resultJson) }, "specialist_explanation", schema, 12000); return { reply: z.string().min(1).max(3000).parse(answer.reply), mode: "AI" }; }
  catch { return { reply: `${JSON.parse(e.resultJson).summary} 请查看候选卡的匹配依据、待核实条件和官方来源。涉及资金变化时先更新资料，再重新评估。`, mode: "RULE" }; }
}
