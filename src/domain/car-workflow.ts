import { type CarFacts } from "./car-planning";

export type CarStep = "goal" | "cashflow" | "sources" | "costs" | "boundaries" | "ready";
export const carStepLabels: Record<CarStep, string> = { goal: "理解目标", cashflow: "核对收支", sources: "安排资金", costs: "核对费用", boundaries: "保护边界", ready: "比较取舍" };
export function isCarIntent(text: string) {
  return !/(?:买车.*(?:还是|或者).*买房|买房.*(?:还是|或者).*买车)/.test(text) && /(?:买|购|换)(?:一辆|辆|台|一台)?(?:汽车|车)|购车/.test(text) && !/(?:不|没|无)(?:想|打算|准备|计划|需要)?(?:买|购|换)车|自行车|电动车|摩托车/.test(text);
}
export function carWorkflow(f: CarFacts, debtMinor: string, ledgerMissing: string[] = []) {
  const gaps: { step: CarStep; question: string }[] = [];
  if (!f.purpose.trim()) gaps.push({ step: "goal", question: "这次买车主要解决什么需要？" });
  if (!f.targetMonth) gaps.push({ step: "goal", question: "希望哪一个月买车？预算可以暂时不确定。" });
  if (f.monthlyIncomeMinor === null || f.livingExpensesMinor === null || !f.cashflowConfirmed) gaps.push({ step: "cashflow", question: "已读取的收入、生活支出和月还款符合目前情况吗？" });
  if (!f.sourcesConfirmed || f.sources.some((s) => s.use && !s.availableMonth) || ledgerMissing.some((m) => /来源|余额|资产|可用月份/.test(m))) gaps.push({ step: "sources", question: "哪些资产愿意用于本次安排，各自最多使用多少、何时可用？" });
  if (f.landingFeesMinor === null || f.runningMonthlyMinor === null || f.replacedTransportMinor === null || !f.costsConfirmed) gaps.push({ step: "costs", question: "落地和每月养车分别需要多少，能替代多少原交通费？" });
  if (f.monthlyPremiumMinor === null || !f.insuranceConfirmed) gaps.push({ step: "costs", question: "现有保费及年度费用每月需要预留多少？保障不清楚可以注明。" });
  if (f.reserveFloorMinor === null || !f.constraintsConfirmed) gaps.push({ step: "boundaries", question: "最低要保留多少应急资金？哪些钱必须保留？" });
  if (!f.otherGoalsConfirmed || ledgerMissing.some((m) => /目标|准备金额/.test(m))) gaps.push({ step: "boundaries", question: "其他目标的准备资金和每月投入核对好了吗？" });
  const step = gaps[0]?.step ?? "ready";
  const partial = f.cashflowConfirmed && f.monthlyIncomeMinor !== null && f.livingExpensesMinor !== null
    ? (BigInt(f.monthlyIncomeMinor) - BigInt(f.livingExpensesMinor) - BigInt(debtMinor)).toString() : null;
  return { step, questions: gaps.filter((g) => g.step === step).slice(0, 2).map((g) => g.question),
    beforeAdoption: gaps.filter((g) => g.step !== step).map((g) => g.question),
    notRelevant: [f.loan ? "未参与方案的资产无需补赎回细节" : "当前全款路径无需贷款报价"],
    partialBalanceMinor: partial, partialLabel: "已确认收入扣除生活支出与现有还款；尚未扣除保费、其他目标和购车费用，不能当作购车预算。",
    outcome: step === "ready" ? "可以比较不同预算的资金占用和每月余量" : step === "cashflow" ? "核对后先判断生活现金流" : step === "sources" ? "核对后明确哪些钱可用、哪些需要保留" : "补齐后逐步缩小判断的不确定性" };
}

// A change invalidates only the confirmation that depended on that field.
export function invalidateCarConfirmations(facts: CarFacts, patch: Partial<CarFacts>): Partial<CarFacts> {
  const changed = (keys: (keyof CarFacts)[]) => keys.some((k) => k in patch && JSON.stringify(facts[k]) !== JSON.stringify(patch[k]));
  return {
    ...(changed(["monthlyIncomeMinor", "livingExpensesMinor"]) ? { cashflowConfirmed: false } : {}),
    ...(changed(["landingFeesMinor", "runningMonthlyMinor", "replacedTransportMinor"]) ? { costsConfirmed: false } : {}),
    ...(changed(["monthlyPremiumMinor", "coverageNotes"]) ? { insuranceConfirmed: false } : {}),
    ...(changed(["reserveFloorMinor"]) ? { constraintsConfirmed: false } : {}),
    ...(changed(["sources", "bonuses"]) ? { sourcesConfirmed: false } : {}),
    ...(changed(["goalReconciliations"]) ? { otherGoalsConfirmed: false } : {}),
  };
}

export function explicitFactPatch(content: string): Partial<CarFacts> {
  const patch: Partial<CarFacts> = {};
  const date = content.match(/(20\d{2})[年/-](\d{1,2})(?:月|(?=\D|$))/);
  if (date && Number(date[2]) >= 1 && Number(date[2]) <= 12) patch.targetMonth = `${date[1]}-${date[2].padStart(2, "0")}`;
  const labels = { budgetMinor: "预算|车价", monthlyIncomeMinor: "月收入|每月收入", livingExpensesMinor: "生活月支出|每月生活支出", monthlyPremiumMinor: "每月保费|月均保费", reserveFloorMinor: "应急储备|应急金", landingFeesMinor: "落地费用|税费上牌", runningMonthlyMinor: "每月养车|养车月费", replacedTransportMinor: "替代交通费" } as const;
  for (const [key, label] of Object.entries(labels)) {
    const match = content.match(new RegExp(`(?:${label})(?:是|为|约|大概|要|需要|[:：\\s])*(\\d+(?:\\.\\d{1,2})?)\\s*(万元|万|元)`));
    if (match) patch[key as keyof typeof labels] = String(Math.round(Number(match[1]) * (match[2] === "元" ? 100 : 1000000)));
  }
  if (/预算(?:还)?(?:不确定|没想好|未知)|不知道预算/.test(content)) patch.budgetMinor = null;
  return patch;
}
