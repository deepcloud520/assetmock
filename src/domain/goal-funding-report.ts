import { ACCOUNT_NAMES, assetAccount, type AccountKey } from './account-classification';
import type { CarContext, CarEvaluation, CarFacts, CarScenario } from './car-planning';
export type ReportAsset = { id: string; name: string; type: string; goalId: string | null; currentValueMinor: string; reservedMinor: string; currency: string };
export type AccountImpact = { account: AccountKey; name: string; currentMinor: string; reservedMinor: string; usedMinor: string; afterMinor: string; accumulatedMinor: string; availableAfterMinor: string };
export type FundingReport = {
  version: 'goal-funding-report-v1'; goal: { name: string; amountMinor: string | null; targetMonth: string | null }; asOfMonth: string;
  calculationVersion: string; sourceSignature: string | null; evaluationId: string | null;
  basis: { incomeMinor: string | null; livingMinor: string | null; premiumMinor: string | null; existingDebtMonthlyMinor: string; otherGoalMonthlyMinor: string; otherGoalReserveMinor: string };
  protectedSources: CarContext['protectedSources'];
  missing: string[]; assumptions: string[]; recommendation: string; reserveFloorMinor: string | null; monthlyPaymentLimitMinor: string | null;
  assessments: CarEvaluation['assessments']; scenarios: Array<{ key: string; accounts: AccountImpact[]; assets: Array<ReportAsset & { account: AccountKey; usedMinor: string; afterMinor: string; availableMonth: string | null; includedMinor: string; feeMinor: string }>;
    projectedNewCashMinor: string; netWorthNote: string; actions: Array<{ title: string; month: string; amountMinor: string }> }>;
};
const n = (v: string | null | undefined) => BigInt(v ?? '0');
export function buildFundingReport(facts: CarFacts, context: CarContext, evaluation: CarEvaluation): FundingReport {
  return { version: 'goal-funding-report-v1', goal: { name: facts.purpose || '买车', amountMinor: facts.budgetMinor, targetMonth: facts.targetMonth }, asOfMonth: context.asOfMonth,
    calculationVersion: evaluation.formulaVersion, sourceSignature: evaluation.sourceSignature ?? null, evaluationId: evaluation.evaluationId ?? null,
    basis: { incomeMinor: facts.monthlyIncomeMinor, livingMinor: facts.livingExpensesMinor, premiumMinor: facts.monthlyPremiumMinor, existingDebtMonthlyMinor: context.monthlyDebtMinor, otherGoalMonthlyMinor: context.otherGoalMonthlyMinor, otherGoalReserveMinor: context.otherGoalReserveMinor }, protectedSources: context.protectedSources,
    reserveFloorMinor: facts.reserveFloorMinor, monthlyPaymentLimitMinor: facts.maxMonthlyPaymentMinor ?? null,
    missing: evaluation.missing, assumptions: evaluation.assumptions, recommendation: evaluation.recommendationReason ?? '', assessments: evaluation.assessments,
    scenarios: evaluation.scenarios.map(s => scenarioImpact(s, context)) };
}
function scenarioImpact(s: CarScenario, context: CarContext): FundingReport['scenarios'][number] {
  const assets = (context.accountAssets ?? []).filter(a => a.currency === 'CNY').map(a => {
    const source = context.sources.find(f => f.assetId === a.id);
    const usedMinor = s.funding.filter(f => f.assetId === a.id).reduce((v, f) => v + n(f.usedMinor), 0n).toString();
    const remaining = s.purchaseAssetRemaining?.[a.id];
    const after = remaining === undefined ? n(a.currentValueMinor) : n(a.currentValueMinor) - n(source?.amountMinor) + n(remaining);
    return { ...a, account: assetAccount(a), usedMinor, afterMinor: after.toString(), availableMonth: source?.month ?? null, includedMinor: source?.amountMinor ?? '0', feeMinor: source?.feeMinor ?? '0' };
  });
  const newCash = n(s.purchaseAccumulatedMinor);
  const accumulated = s.funding.filter(f => !f.assetId).reduce((v,f) => v + n(f.usedMinor), newCash);
  const accounts = (Object.keys(ACCOUNT_NAMES) as AccountKey[]).map(account => {
    const rows = assets.filter(a => a.account === account);
    const sum = (field: 'currentValueMinor' | 'reservedMinor' | 'usedMinor' | 'afterMinor') => rows.reduce((v,r) => v + n(r[field]),0n);
    const future = account === 'liquidity';
    const priorSpending = sum('currentValueMinor') - sum('afterMinor') - sum('usedMinor');
    return { account, name: ACCOUNT_NAMES[account], currentMinor: sum('currentValueMinor').toString(), reservedMinor: sum('reservedMinor').toString(),
      usedMinor: (sum('usedMinor') + (future ? accumulated-newCash : 0n)).toString(), afterMinor: (sum('afterMinor') + (future ? newCash : 0n)).toString(), accumulatedMinor: ((future ? accumulated : 0n) - priorSpending).toString(),
      availableAfterMinor: (rows.reduce((v, a) => v + n(s.purchaseAssetRemaining?.[a.id]), 0n) + (future ? newCash : 0n)).toString() };
  });
  return { key: s.key, accounts, assets, projectedNewCashMinor: accumulated.toString(),
    netWorthNote: '账户余额为规划中的现有金融资产及预计结余。购车会新增车辆资产和可能的贷款负债；车辆估值待确认，不能把车价全部当作净资产损失。外币资产不参与本次计算。',
    actions: [{ title: '每月准备购车资金并核对实际结余', month: context.asOfMonth, amountMinor: s.requiredSavingMinor ?? s.monthlySavingMinor },
      ...s.funding.filter(f => f.assetId).map(f => ({ title: `核对并准备${f.name}`, month: f.month, amountMinor: f.usedMinor })),
      { title: '购车前核对价格、报价与可用资金', month: s.purchaseMonth, amountMinor: s.upfrontMinor }] };
}
