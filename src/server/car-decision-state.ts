import { professionalFacts } from "./specialist-bridge";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { carFactsSchema, currentCarMonth, type CarFacts } from "@/domain/car-planning";
import { carWorkflow, explicitFactPatch, invalidateCarConfirmations, isCarIntent } from "@/domain/car-workflow";
import { ApiError, serialize } from "./portfolio";
import { recordExplicitPreferences } from "./planning-memory";

export async function decisionDependencies(tx: Prisma.TransactionClient, workspaceId: string, ownGoalId: string | null = null) {
  const [assets, liabilities, goals, profile] = await Promise.all([
    tx.asset.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" }, select: { id: true, currentValueMinor: true, goalId: true, isAdjustable: true, liquidityLevel: true, currency: true } }),
    tx.liability.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { id: "asc" }, select: { id: true, monthlyPaymentMinor: true, outstandingBalanceMinor: true } }),
    tx.goal.findMany({ where: { workspaceId, deletedAt: null, ...(ownGoalId ? { id: { not: ownGoalId } } : {}) }, orderBy: { id: "asc" }, select: { id: true, preparedAmountMinor: true, monthlyContributionMinor: true } }),
    tx.profile.findUnique({ where: { workspaceId }, select: { stableMonthlyIncomeMinor: true, otherMonthlyIncomeMinor: true, rentExpenseMinor: true, transportExpenseMinor: true, essentialExpenseMinor: true } }),
  ]);
  const professional = await professionalFacts(tx, workspaceId);
  return JSON.parse(JSON.stringify({ assets, liabilities, goals, profile, professional }, (_, v) => typeof v === "bigint" ? v.toString() : v)) as { assets: { id: string; currentValueMinor: string; goalId: string | null; isAdjustable: boolean; liquidityLevel: string; currency: string }[]; liabilities: object[]; goals: object[]; profile: Record<string, string> | null; professional: Awaited<ReturnType<typeof professionalFacts>> };
}
export async function reconcileCarDependencies(tx: Prisma.TransactionClient, workspaceId: string) {
  const rows = await tx.carDecision.findMany({ where: { workspaceId } });
  for (const row of rows) {
    const latest = await decisionDependencies(tx, workspaceId, row.goalId);
    const previous = JSON.parse(row.dependenciesJson) as Partial<typeof latest>;
    const f = carFactsSchema.parse(JSON.parse(row.factsJson));
    const patch: Partial<CarFacts> = {};
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (previous.assets && !same(previous.assets, latest.assets)) {
      const usedChanged = f.sources.some((s) => s.use && !same(previous.assets?.find((a) => a.id === s.assetId), latest.assets.find((a) => a.id === s.assetId)));
      if (usedChanged) {
        patch.sourcesConfirmed = false;
        patch.sources = f.sources.filter((s) => latest.assets.some((a) => a.id === s.assetId)).map((s) => {
          const asset = latest.assets.find((a) => a.id === s.assetId)!;
          return { ...s, amountMinor: (BigInt(s.amountMinor) > BigInt(asset.currentValueMinor) ? asset.currentValueMinor : s.amountMinor), use: (asset.goalId && asset.goalId !== row.goalId) || !asset.isAdjustable ? false : s.use };
        });
      }
      const memories = await tx.planningMemory.findMany({ where: { workspaceId, status: "ACTIVE", nature: "HARD" } });
      for (const m of memories) {
        const rule = JSON.parse(m.ruleJson);
        if (rule.assetId && !same(previous.assets.find((a) => a.id === rule.assetId), latest.assets.find((a) => a.id === rule.assetId))) await tx.planningMemory.update({ where: { id: m.id }, data: { status: "REVIEW", version: { increment: 1 } } });
      }
    }
    if (previous.liabilities && !same(previous.liabilities, latest.liabilities)) patch.cashflowConfirmed = false;
    if (previous.goals && !same(previous.goals, latest.goals)) patch.otherGoalsConfirmed = false;
    if ("profile" in previous && !same(previous.profile, latest.profile)) {
      patch.cashflowConfirmed = false;
      const p = latest.profile;
      if (p) {
        patch.monthlyIncomeMinor = (BigInt(p.stableMonthlyIncomeMinor) + BigInt(p.otherMonthlyIncomeMinor)).toString();
        patch.livingExpensesMinor = (BigInt(p.rentExpenseMinor) + BigInt(p.transportExpenseMinor) + BigInt(p.essentialExpenseMinor)).toString();
        if (f.cuts.filter((c) => c.accepted).reduce((sum, c) => sum + BigInt(c.amountMinor), 0n) + BigInt(f.replacedTransportMinor ?? "0") > BigInt(patch.livingExpensesMinor)) {
          patch.cuts = f.cuts.map((c) => ({ ...c, accepted: false }));
          if (BigInt(f.replacedTransportMinor ?? "0") > BigInt(patch.livingExpensesMinor)) { patch.replacedTransportMinor = null; patch.costsConfirmed = false; }
        }
      }
    }
    if ((previous.professional || latest.professional.budget || latest.professional.coverageState !== "UNKNOWN" || latest.professional.holdings.length) && !same(previous.professional, latest.professional)) {
      const pro = latest.professional;
      if (!same(previous.professional?.budget, pro.budget) && pro.budget) {
        const debt = latest.liabilities.reduce((sum, item) => sum + BigInt((item as { monthlyPaymentMinor: string }).monthlyPaymentMinor), 0n);
        patch.monthlyIncomeMinor = pro.budget.incomeMinor;
        patch.livingExpensesMinor = (BigInt(pro.budget.livingMinor) - (pro.budget.debtIncluded ? debt : 0n) + BigInt(pro.budget.extraFixedMinor)).toString();
        patch.cashflowConfirmed = false;
        patch.cuts = pro.budget.cuts.map((c, index) => ({ id: `BUDGET:${index}`, name: c.name, amountMinor: c.amountMinor, impact: c.impact, accepted: c.accepted }));
      }
      if ((pro.budget || pro.coverageState !== "UNKNOWN" || previous.professional?.coverageState && previous.professional.coverageState !== "UNKNOWN") && (!same(previous.professional?.policies, pro.policies) || !same(previous.professional?.budget, pro.budget) || previous.professional?.coverageState !== pro.coverageState)) {
        const extra = pro.budget?.proposedPremiumConfirmed ? BigInt(pro.budget.proposedPremiumMinor) : 0n;
        patch.monthlyPremiumMinor = ((pro.budget?.premiumsIncluded ? 0n : BigInt(pro.premiumMinor)) + extra).toString();
        patch.insuranceConfirmed = false;
      }
      if (f.sources.some((source) => source.use && !same(previous.professional?.holdings.find((h) => h.assetId === source.assetId), pro.holdings.find((h) => h.assetId === source.assetId)))) patch.sourcesConfirmed = false;
    }
    if (latest.professional.budget && patch.cashflowConfirmed === false) {
      const b = latest.professional.budget;
      const debt = latest.liabilities.reduce((sum, item) => sum + BigInt((item as { monthlyPaymentMinor: string }).monthlyPaymentMinor), 0n);
      patch.monthlyIncomeMinor = b.incomeMinor;
      patch.livingExpensesMinor = (BigInt(b.livingMinor) - (b.debtIncluded ? debt : 0n) + BigInt(b.extraFixedMinor)).toString();
      if (BigInt(patch.livingExpensesMinor) < 0n) patch.livingExpensesMinor = "0";
    }
    if (patch.livingExpensesMinor !== undefined && patch.livingExpensesMinor !== null) {
      const cuts = patch.cuts ?? f.cuts;
      if (cuts.filter((c) => c.accepted).reduce((sum, c) => sum + BigInt(c.amountMinor), 0n) + BigInt(f.replacedTransportMinor ?? "0") > BigInt(patch.livingExpensesMinor)) { patch.cuts = cuts.map((c) => ({ ...c, accepted: false })); patch.costsConfirmed = false; if (BigInt(f.replacedTransportMinor ?? "0") > BigInt(patch.livingExpensesMinor)) patch.replacedTransportMinor = null; }
    }
    const changed = Object.keys(patch).length > 0;
    if (same(previous, latest) && !changed) continue;
    await tx.carDecision.update({ where: { id: row.id }, data: { dependenciesJson: JSON.stringify(latest), ...(changed ? { factsJson: JSON.stringify({ ...f, ...patch }), evaluationJson: null, version: { increment: 1 } } : {}) } });
  }
}

export async function resumeCarDecision(workspaceId: string, body: unknown) {
  const input = z.object({ intent: z.string().trim().max(2000).default(""), goalSessionId: z.string().optional() }).strict().parse(body);
  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, include: { profile: true, assets: { where: { deletedAt: null } } } });
    if (!workspace) throw new ApiError("工作区不存在", 404);
    const existing = await tx.carDecision.findFirst({ where: { workspaceId, status: { not: "PURCHASED" } }, orderBy: { updatedAt: "desc" } });
    if (!existing && !isCarIntent(input.intent)) throw new ApiError("请先明确是否想买车；其他目标请继续原目标对话", 422);
    const session = input.goalSessionId ? await tx.agentSession.findFirst({ where: { id: input.goalSessionId, workspaceId, goalId: null }, include: { messages: { orderBy: { createdAt: "asc" } } } }) : null;
    if (input.goalSessionId && !session) throw new ApiError("原会话不存在或已生成正式目标", 409);
    if (existing) {
      const history = JSON.parse(existing.conversationJson) as { id: string; role: string; content: string }[];
      const hasNewMessage = input.intent && input.intent !== "我想买车" && !history.some((m) => m.role === "USER" && m.content === input.intent);
      if (hasNewMessage || (session && !existing.goalSessionId)) {
        const sourceRef = randomUUID();
        const facts = carFactsSchema.parse(JSON.parse(existing.factsJson));
        const patch = explicitFactPatch(input.intent);
        const next = await tx.carDecision.update({ where: { id: existing.id }, data: { ...(session && !existing.goalSessionId ? { goalSessionId: session.id } : {}), conversationJson: JSON.stringify([...history, ...(session?.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content })), ...(hasNewMessage ? [{ id: sourceRef, role: "USER", content: input.intent }] : [])]), factsJson: JSON.stringify({ ...facts, ...patch, ...invalidateCarConfirmations(facts, patch) }), evaluationJson: null, version: { increment: 1 } } });
        if (session) await tx.agentSession.update({ where: { id: session.id }, data: { status: "CAR_LINKED" } });
        await recordExplicitPreferences(tx, workspaceId, existing.id, sourceRef, input.intent);
        return serialize(next);
      }
      return serialize(existing);
    }
    const p = workspace.profile;
    const pro = await professionalFacts(tx, workspaceId);
    const debt = (await tx.liability.findMany({ where: { workspaceId, deletedAt: null } })).reduce((sum, l) => sum + l.monthlyPaymentMinor, 0n);
    const oldDraft = session ? JSON.parse(session.goalDraftJson) : {};
    const facts = carFactsSchema.parse({ purpose: input.intent.slice(0, 400), targetMonth: oldDraft.target_date?.slice(0, 7) ?? null, budgetMinor: oldDraft.target_amount_minor ?? null,
      monthlyIncomeMinor: p ? (p.stableMonthlyIncomeMinor + p.otherMonthlyIncomeMinor).toString() : null,
      livingExpensesMinor: p ? (p.rentExpenseMinor + p.transportExpenseMinor + p.essentialExpenseMinor).toString() : null,
      ...(pro.budget ? { monthlyIncomeMinor: pro.budget.incomeMinor, livingExpensesMinor: (BigInt(pro.budget.livingMinor) - (pro.budget.debtIncluded ? debt : 0n) + BigInt(pro.budget.extraFixedMinor)).toString(), monthlyPremiumMinor: ((pro.budget.premiumsIncluded ? 0n : BigInt(pro.premiumMinor)) + (pro.budget.proposedPremiumConfirmed ? BigInt(pro.budget.proposedPremiumMinor) : 0n)).toString() } : {}),
      ...explicitFactPatch(input.intent),
      sources: workspace.assets.map((a) => ({ assetId: a.id, amountMinor: a.currentValueMinor.toString(), availableMonth: a.liquidityLevel === "T0" ? currentCarMonth() : null, use: false })),
    });
    const messageId = randomUUID();
    const history = [...(session?.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })) ?? []), { id: messageId, role: "USER", content: input.intent, createdAt: new Date().toISOString() }, { id: randomUUID(), role: "ASSISTANT", content: `已读取现有底账。${carWorkflow(facts, "0").questions.join(" ")}预算可以留空。`, createdAt: new Date().toISOString() }];
    const row = await tx.carDecision.upsert({ where: { resumeKey: workspaceId }, update: {}, create: { workspaceId, resumeKey: workspaceId, goalSessionId: session?.id, sourceRevision: workspace.portfolioRevision, factsJson: JSON.stringify(facts), dependenciesJson: JSON.stringify(await decisionDependencies(tx, workspaceId)), conversationJson: JSON.stringify(history), fieldEvidenceJson: JSON.stringify({ purpose: { sourceRef: messageId, quote: input.intent, type: "EXPRESSION" } }) } });
    if (session) await tx.agentSession.update({ where: { id: session.id }, data: { status: "CAR_LINKED" } });
    await recordExplicitPreferences(tx, workspaceId, row.id, messageId, input.intent);
    return serialize(row);
  });
}
