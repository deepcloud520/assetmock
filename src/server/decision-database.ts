import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { constraintSchema, checkRedLine, today, type ConstraintRule } from "@/domain/database-planning";
import { addMonths, currentCarMonth, carFactsSchema, type CarFacts, type CarContext, type CarEvaluation } from "@/domain/car-planning";
import { encode, ensureUnified, parseLegacy, registerDependencies } from "./unified-store";
import { ApiError } from "./portfolio";
export async function currentConstraints(tx: Prisma.TransactionClient, workspaceId: string, decisionId?: string) {
  await ensureUnified(tx, workspaceId);
  const memories = await tx.planningMemory.findMany({ where: { workspaceId, nature: "HARD", status: "ACTIVE", confirmedAt: { not: null }, evidenceType: { not: "INFERENCE" }, OR: [{ scope: "GLOBAL" }, ...(decisionId ? [{ scope: "DECISION", decisionId }] : [])] } });
  const old = await tx.decisionConstraint.findMany({ where: { workspaceId, recordKind: "CURRENT", memoryId: { not: null }, status: "ACTIVE" } });
  for (const c of old) if (!await tx.planningMemory.findFirst({ where: { id: c.memoryId!, workspaceId, nature: "HARD", status: "ACTIVE", confirmedAt: { not: null } } })) await tx.decisionConstraint.update({ where: { id: c.id }, data: { status: "SUPERSEDED" } });
  for (const m of memories) {
    if (await tx.decisionConstraint.findFirst({ where: { workspaceId, memoryId: m.id } })) continue;
    const rule = parseLegacy(m.ruleJson) as { kind?: string; assetId?: string }; if (!["CASH_ONLY", "EXCLUDE_ASSET"].includes(rule.kind ?? "")) continue;
    await tx.decisionConstraint.create({ data: { workspaceId, decisionId: m.scope === "GLOBAL" ? null : m.decisionId, scope: m.scope, type: rule.kind === "CASH_ONLY" ? "NO_NEW_DEBT" : "NO_USE_ASSET", operator: "NOT_USE", assetId: rule.assetId ?? null, userText: m.quote, confirmedAt: m.confirmedAt, memoryId: m.id } });
  }
  return tx.decisionConstraint.findMany({ where: { workspaceId, recordKind: "CURRENT", status: "ACTIVE", confirmedAt: { not: null }, OR: [{ scope: "GLOBAL" }, ...(decisionId ? [{ scope: "DECISION", decisionId }] : [])] }, orderBy: { createdAt: "asc" } });
}
export async function applyRedLines(tx: Prisma.TransactionClient, workspaceId: string, decisionId: string, facts: CarFacts, context: CarContext, evaluation: CarEvaluation, persist = false) {
  const constraints = await currentConstraints(tx, workspaceId, decisionId); const goals = await tx.goal.findMany({ where: { workspaceId, deletedAt: null }, include: { assets: { where: { deletedAt: null } } } });
  const assetsByGoal = Object.fromEntries(goals.map((g) => [g.id, g.assets.map((a) => a.id)]));
  const checks = evaluation.scenarios.flatMap((s) => constraints.map((c) => checkRedLine({ ...c, thresholdValue: c.thresholdValue?.toString() ?? null } as ConstraintRule, s, facts, context, assetsByGoal)));
  for (const scenario of evaluation.scenarios) {
    const blocked = checks.filter((c) => c.candidateKey === scenario.key && c.result !== "PASS");
    if (blocked.length) { scenario.adoptable = false; scenario.reasons.push(...blocked.map((c) => `${c.result === "VIOLATED" ? "与你之前的选择冲突" : c.result === "SKIPPED_MANUAL" ? "红线需人工核对" : "红线资料待核实"}：${c.detail.text}`)); }
  }
  if (evaluation.recommendedKey && !evaluation.scenarios.find((s) => s.key === evaluation.recommendedKey)?.adoptable) evaluation.recommendedKey = evaluation.scenarios.find((s) => s.adoptable)?.key ?? null;
  const enriched = { ...evaluation, redLineChecks: checks };
  if (persist) {
    const row = await tx.carDecision.findUniqueOrThrow({ where: { id: decisionId } });
    const record = await tx.carEvaluationRecord.create({ data: { workspaceId, decisionId, decisionVersion: row.version, sourceSignature: createHash("sha256").update(encode({ facts, context, constraints })).digest("hex"), calculatedOn: today(), formulaVersion: evaluation.formulaVersion, inputJson: encode({ facts, context }), resultJson: encode(enriched) } });
    for (const c of checks) await tx.redLineCheck.create({ data: { workspaceId, constraintId: c.constraintId, evaluationId: record.id, candidateKey: c.candidateKey, result: c.result, detailJson: encode(c.detail) } });
    await registerDependencies(tx, workspaceId, "CAR_EVALUATION", record.id);
  }
  return enriched;
}
export async function saveConstraint(tx: Prisma.TransactionClient, workspaceId: string, body: unknown, oldId?: string) {
  const data = constraintSchema.parse(body);
  if (oldId) { const old = await tx.decisionConstraint.findFirst({ where: { id: oldId, workspaceId, recordKind: "CURRENT", status: "ACTIVE" } }); if (!old) throw new ApiError("约束已变化", 409); await tx.decisionConstraint.update({ where: { id: oldId }, data: { status: "SUPERSEDED" } }); if (old.memoryId) await tx.planningMemory.update({ where: { id: old.memoryId }, data: { status: "SUPERSEDED" } }); }
  const { confirm: _confirm, ...fields } = data; void _confirm;
  const next = await tx.decisionConstraint.create({ data: { ...fields, workspaceId, thresholdValue: data.thresholdValue === null ? null : BigInt(data.thresholdValue), confirmedAt: new Date(), sourceId: oldId ?? null } });
  if (oldId) await tx.decisionConstraint.update({ where: { id: oldId }, data: { supersededById: next.id } });
  await tx.workspace.update({ where: { id: workspaceId }, data: { professionalRevision: { increment: 1 } } });
  await tx.carDecision.updateMany({ where: { workspaceId, ...(data.scope === "DECISION" ? { id: data.decisionId! } : {}), status: { not: "PURCHASED" } }, data: { evaluationJson: null, version: { increment: 1 } } });
  return next;
}
export async function seedPlanMemory(tx: Prisma.TransactionClient, workspaceId: string, planVersionId: string, facts: CarFacts, reasons: { category: string; userText?: string | null; assetId?: string | null }[] = [], previousPlanId?: string | null) {
  const plan = await tx.carPlanVersion.findUniqueOrThrow({ where: { id: planVersionId } });
  const current = await currentConstraints(tx, workspaceId, plan.decisionId);
  for (const c of current) { const { id, createdAt: _createdAt, ...fields } = c; void _createdAt; await tx.decisionConstraint.create({ data: { ...fields, planVersionId, recordKind: "SNAPSHOT", sourceId: id, memoryId: null, supersededById: null } }); }
  for (const r of reasons) await tx.decisionReason.create({ data: { workspaceId, planVersionId, category: r.category, userText: r.userText ?? null, assetId: r!.assetId ?? null, evidenceSource: "USER_SELECTION" } });
  const definitions: { category: string; content: string; checkType: string; rule: string; expectedValue: bigint | null; dueOn: string | null; referenceId: string | null }[] = [
    { category: "INCOME", content: "月度收入达到规划收入", checkType: "PERIODIC", rule: "GTE", expectedValue: facts.monthlyIncomeMinor === null ? null : BigInt(facts.monthlyIncomeMinor), dueOn: null, referenceId: null },
    { category: "EXPENSE", content: "月度生活支出不超过规划预算", checkType: "PERIODIC", rule: "LTE", expectedValue: facts.livingExpensesMinor === null ? null : BigInt(facts.livingExpensesMinor), dueOn: null, referenceId: null },
  ];
  for (const b of facts.bonuses.filter((x) => x.confirmed)) definitions.push({ category: "BONUS", content: `${b.name}按预期到账`, checkType: "AMOUNT_DUE", rule: "GTE_BY_DATE", expectedValue: BigInt(b.amountMinor), dueOn: new Date(Date.parse(`${addMonths(b.month, 1)}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10), referenceId: b.id });
  for (const c of facts.cuts.filter((x) => x.accepted)) definitions.push({ category: "SPENDING", content: `执行消费调整：${c.name}`, checkType: "PERIODIC", rule: "GTE", expectedValue: BigInt(c.amountMinor), dueOn: null, referenceId: c.id });
  for (const s of facts.sources.filter((x) => x.use)) definitions.push({ category: "ASSET_AVAILABLE", content: "资金按期可用且金额足够", checkType: "AMOUNT_DUE", rule: "GTE_BY_DATE", expectedValue: BigInt(s.amountMinor), dueOn: s.availableMonth ? `${s.availableMonth}-01` : null, referenceId: s.assetId });
  const old = previousPlanId ? await tx.planAssumption.findMany({ where: { workspaceId, planVersionId: previousPlanId } }) : [];
  if (previousPlanId) await tx.planAssumption.updateMany({ where: { workspaceId, planVersionId: previousPlanId }, data: { lifecycle: "SUPERSEDED" } });
  for (const d of definitions) { const previous = old.find((x) => x.category === d.category && x.referenceId === d.referenceId); await tx.planAssumption.create({ data: { ...d, workspaceId, planVersionId, currency: d.expectedValue === null ? null : "CNY", sourceId: previous?.id ?? null, sourceJson: encode({ source: "PLAN_FACTS", confirmedExpectedOnly: true }) } }); }
  await registerDependencies(tx, workspaceId, "PLAN", planVersionId);
}
export async function migrateDecisionMemory(tx: Prisma.TransactionClient, workspaceId: string) {
  const decisions = await tx.carDecision.findMany({ where: { workspaceId }, include: { plans: { orderBy: { version: "asc" } } } });
  for (const d of decisions) { await currentConstraints(tx, workspaceId, d.id); for (const p of d.plans) {
    if (await tx.planAssumption.count({ where: { planVersionId: p.id } })) continue;
    const parsed = carFactsSchema.safeParse(parseLegacy(p.factsJson));
    if (!parsed.success) { await tx.migrationIssue.upsert({ where: { workspaceId_entityType_entityId_code: { workspaceId, entityType: "PLAN", entityId: p.id, code: "INVALID_FACTS" } }, create: { workspaceId, entityType: "PLAN", entityId: p.id, code: "INVALID_FACTS", note: "历史方案原文保留，请核对" }, update: {} }); continue; }
    // Historical rows are not backfilled with today's constraints or inferred motives.
    await seedPlanMemory(tx, workspaceId, p.id, parsed.data);
    await tx.decisionConstraint.deleteMany({ where: { workspaceId, planVersionId: p.id, recordKind: "SNAPSHOT" } });
    const snapshot = parseLegacy(p.snapshotJson) as { acceptedTradeoffs?: { preferences?: { rule?: { kind?: string; assetId?: string }; nature: string; evidenceType: string; quote: string }[]; reserveFloorMinor?: string } }; const accepted = snapshot.acceptedTradeoffs?.preferences ?? [];
    for (const m of accepted) { const r = m.rule; if (m.nature === "HARD" && m.evidenceType !== "INFERENCE" && ["CASH_ONLY", "EXCLUDE_ASSET"].includes(r?.kind ?? "")) await tx.decisionConstraint.create({ data: { workspaceId, decisionId: d.id, planVersionId: p.id, recordKind: "SNAPSHOT", type: r!.kind === "CASH_ONLY" ? "NO_NEW_DEBT" : "NO_USE_ASSET", operator: "NOT_USE", assetId: r!.assetId ?? null, userText: m.quote, confirmedAt: p.adoptedAt } }); }
    if (snapshot.acceptedTradeoffs?.reserveFloorMinor != null && parsed.data.constraintsConfirmed) await tx.decisionConstraint.create({ data: { workspaceId, decisionId: d.id, planVersionId: p.id, recordKind: "SNAPSHOT", type: "NO_USE_EMERGENCY", operator: "GTE", thresholdValue: BigInt(snapshot.acceptedTradeoffs.reserveFloorMinor), unit: "CENTS", currency: "CNY", userText: "当时确认的储备底线", confirmedAt: p.adoptedAt } });
    if (p.reason && !["已确认所展示的预算", "根据本月实际情况确认调整"].some((prefix) => p.reason.startsWith(prefix))) { const expressed = await tx.planningMemory.findFirst({ where: { workspaceId, sourceRef: p.id, evidenceType: "CHOICE", quote: { contains: p.reason } } }); if (expressed) await tx.decisionReason.create({ data: { workspaceId, planVersionId: p.id, category: "OTHER", userText: p.reason, evidenceSource: "LEGACY_USER_CHOICE" } }); }
    if (p.id !== d.activePlanId) await tx.planAssumption.updateMany({ where: { planVersionId: p.id }, data: { lifecycle: "SUPERSEDED" } });
  } }
}
export async function syncAssumptionDue(tx: Prisma.TransactionClient, workspaceId: string) {
  const definitions = await tx.planAssumption.findMany({ where: { workspaceId, lifecycle: "ACTIVE" } }); const period = today().slice(0, 7);
  for (const a of definitions) {
    const plan = await tx.carPlanVersion.findUniqueOrThrow({ where: { id: a.planVersionId } });
    const periods: string[] = []; if (a.checkType === "PERIODIC") { let p = currentCarMonth(plan.adoptedAt); while (p <= period && periods.length < 1200) { periods.push(p); p = addMonths(p, 1); } } else periods.push("ONCE");
    for (const key of periods) {
      const dueOn = key === "ONCE" ? a.dueOn : new Date(Date.parse(`${addMonths(key, 1)}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      const due = dueOn !== null && dueOn < today();
      const row = await tx.assumptionVerification.upsert({ where: { assumptionId_period: { assumptionId: a.id, period: key } }, create: { workspaceId, assumptionId: a.id, period: key, status: due ? "OVERDUE" : "PENDING" }, update: {} });
      if (due && row.status === "PENDING") await tx.assumptionVerification.update({ where: { id: row.id }, data: { status: "OVERDUE" } });
      if (due && !["CONFIRMED", "FAILED"].includes(row.status)) await assumptionAction(tx, workspaceId, a.id, key, `核对逾期假设：${a.content}`, false);
    }
  }
}
async function assumptionAction(tx: Prisma.TransactionClient, workspaceId: string, assumptionId: string, period: string, title: string, failed: boolean) {
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const sourceKey = `ASSUMPTION:${assumptionId}:${period}:${failed ? "FAILED" : "DUE"}`;
  await tx.action.upsert({ where: { sourceKey }, create: { workspaceId, sourceKey, generationTaskId: assumptionId, sourceRevision: workspace.professionalRevision, kind: "SPECIALIST_GOAL", title, reason: failed ? "用户确认的实际情况不满足假设，请比较影响后确认调整" : "到期尚未核实，不自动认定失效", priority: 1, status: "ACCEPTED", verificationType: "USER_CONFIRMATION", detailsJson: encode({ assumptionId, period, revisionScope: "PROFESSIONAL" }) }, update: {} });
}
export async function verifyAssumption(tx: Prisma.TransactionClient, workspaceId: string, input: { assumptionId: string; period: string; expectedVersion: number; actualValue: string | null; occurredOn: string | null; evidence: string; reviewId?: string }) {
  const a = await tx.planAssumption.findFirst({ where: { id: input.assumptionId, workspaceId, lifecycle: "ACTIVE" } }); if (!a) throw new ApiError("假设不存在或方案已替代", 409);
  const plan = await tx.carPlanVersion.findUniqueOrThrow({ where: { id: a.planVersionId } });
  if (a.checkType === "PERIODIC" && (input.period < currentCarMonth(plan.adoptedAt) || input.period > currentCarMonth())) throw new ApiError("只能核对方案生效后的实际月份", 422);
  const key = a.checkType === "PERIODIC" ? input.period : "ONCE";
  let v = await tx.assumptionVerification.findUnique({ where: { assumptionId_period: { assumptionId: a.id, period: key } } });
  if (!v) { if (input.expectedVersion !== 0) throw new ApiError("核对记录已变化", 409); v = await tx.assumptionVerification.create({ data: { workspaceId, assumptionId: a.id, period: key } }); }
  else if (v.revision !== input.expectedVersion) throw new ApiError("核对记录已变化，请刷新", 409);
  if (a.expectedValue === null || input.actualValue === null) throw new ApiError("实际值或判断口径缺失，不能确定核对结果", 422);
  if (input.occurredOn && input.occurredOn > today()) throw new ApiError("实际发生日期不能在未来", 422);
  const actual = BigInt(input.actualValue); const passAmount = a.rule === "LTE" ? actual <= a.expectedValue : actual >= a.expectedValue;
  if (a.rule === "GTE_BY_DATE" && (!input.occurredOn || !a.dueOn)) throw new ApiError("需要核对实际发生日期", 422);
  const passDate = a.rule !== "GTE_BY_DATE" || input.occurredOn! <= a.dueOn!;
  const status = passAmount && passDate ? "CONFIRMED" : "FAILED";
  const history = JSON.parse(v.historyJson); history.push({ revision: v.revision, status: v.status, actualValue: v.actualValue?.toString() ?? null, evidence: v.evidence, occurredOn: v.occurredOn, verifiedAt: v.verifiedAt });
  await tx.assumptionVerification.update({ where: { id: v.id }, data: { status, actualValue: actual, occurredOn: input.occurredOn, evidence: input.evidence, verifiedBy: "USER", verifiedAt: new Date(), reviewId: input.reviewId, revision: { increment: 1 }, historyJson: encode(history) } });
  if (status === "FAILED") {
    const periodicDelta = a.checkType === "PERIODIC" ? (a.rule === "LTE" ? a.expectedValue - actual : actual - a.expectedValue).toString() : null;
    const currentWorkspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const impact = await tx.professionalEvaluation.create({ data: { workspaceId, manager: "GOAL", sourceSignature: `ASSUMPTION:${a.id}:${key}:${v.revision + 1}`, inputJson: encode({ assumptionId: a.id, planVersionId: a.planVersionId, expected: a.expectedValue, actual, period: key }), resultJson: encode({ summary: "已确认实际情况不满足生效方案假设，请核对原方案筹资条件后重新计算。生效方案保持至确认调整。", products: [], impact: { periodicSurplusChangeMinor: periodicDelta, missedDate: !passDate, expected: a.expectedValue, actual, source: "USER_CONFIRMATION", portfolioRevision: currentWorkspace.portfolioRevision }, missing: ["逐项更新原决策资料并重新评估"], actions: ["核对并比较买车计划调整"] }) } });
    await registerDependencies(tx, workspaceId, "PROFESSIONAL_EVALUATION", impact.id);
    await assumptionAction(tx, workspaceId, a.id, key, `假设失效：${a.content}`, true);
  } else await tx.action.updateMany({ where: { workspaceId, sourceKey: { in: [`ASSUMPTION:${a.id}:${key}:FAILED`, `ASSUMPTION:${a.id}:${key}:DUE`] }, status: { in: ["ACCEPTED", "DEFERRED"] } }, data: { status: "USER_MARKED_COMPLETED" } });
  return status;
}
