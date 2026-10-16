export type SimulationEventKind = "LARGE_EXPENSE" | "INCOME_CHANGE" | "FAMILY_CHANGE";
export type SimulationGranularity = "MONTH" | "QUARTER" | "HALF_YEAR";

export type SimulationSnapshot = {
  sourceRevision: number;
  currentDate: string;
  targetDate: string;
  goal: { id: string; name: string; targetAmountMinor: string; preparedAmountMinor: string; monthlyContributionMinor: string };
  initialCashMinor: string;
  initialLiabilityMinor: string;
  monthlyIncomeMinor: string;
  monthlyExpenseMinor: string;
  monthlyDebtPaymentMinor: string;
  missingFields: string[];
};

export type ScenarioEvent = {
  kind: SimulationEventKind;
  label: string;
  startMonth: number;
  durationMonths: number | null;
  oneTimeExpenseMinor: string;
  monthlyExpenseChangeMinor: string;
  incomeDuringEventMinor: string | null;
  incomeAfterEventMinor: string | null;
};

export type MonthlySimulationResult = {
  month: string;
  eventDescription: string | null;
  incomeMinor: string;
  expenseMinor: string;
  debtPaymentMinor: string;
  monthlyBalanceMinor: string;
  cashBalanceMinor: string;
  liabilityBalanceMinor: string;
  goalPreparedMinor: string;
  goalProgress: number;
  riskFlags: string[];
  explanation: string;
};

export type SimulationPeriod = Omit<MonthlySimulationResult, "month"> & { label: string; months: string[] };

export type LifeSimulationResult = {
  createdAt: string;
  sourceRevision: number;
  snapshot: SimulationSnapshot;
  event: ScenarioEvent;
  granularity: SimulationGranularity;
  monthlyResults: MonthlySimulationResult[];
  periods: SimulationPeriod[];
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", timeZone: "UTC" });

function monthStart(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthLabel(date: Date) {
  return dateFormatter.format(date);
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function totalMonths(from: string, to: string) {
  const start = monthStart(from);
  const end = monthStart(to);
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
}

export function simulationGranularity(currentDate: string, targetDate: string): SimulationGranularity {
  const months = totalMonths(currentDate, targetDate);
  return months <= 12 ? "MONTH" : months <= 60 ? "QUARTER" : "HALF_YEAR";
}

export function simulationMissingFields(snapshot: Omit<SimulationSnapshot, "missingFields">) {
  const missing: string[] = [];
  if (BigInt(snapshot.initialCashMinor) <= 0n) missing.push("当前资产");
  if (BigInt(snapshot.monthlyIncomeMinor) <= 0n) missing.push("月收入");
  if (BigInt(snapshot.monthlyExpenseMinor) <= 0n) missing.push("月支出");
  if (!snapshot.targetDate || new Date(snapshot.targetDate) <= new Date(snapshot.currentDate)) missing.push("有效的目标日期");
  return missing;
}

function eventIsActive(event: ScenarioEvent, monthIndex: number) {
  if (monthIndex < event.startMonth) return false;
  return event.durationMonths === null || monthIndex < event.startMonth + event.durationMonths;
}

function eventText(event: ScenarioEvent, active: boolean, monthIndex: number) {
  if (!active) return null;
  if (monthIndex === event.startMonth) return `${event.label}开始`;
  return `${event.label}持续中`;
}

function riskFlags(cash: bigint, liability: bigint, goalProgress: number) {
  const flags: string[] = [];
  if (cash < 0n) flags.push("现金不足");
  if (liability > 0n && cash < liability) flags.push("负债压力");
  if (goalProgress < 50) flags.push("目标准备不足");
  return flags;
}

function explanation(eventDescription: string | null, balance: bigint, flags: string[]) {
  if (eventDescription) return `${eventDescription}，本期现金流${balance >= 0n ? "仍有结余" : "出现缺口"}${flags.length ? `；需关注${flags.join("、")}` : "。"}`;
  if (flags.length) return `本期平稳推进，但仍需关注${flags.join("、")}。`;
  return "本期平稳推进，收入、支出和目标投入按当前方案执行。";
}

function eventIncome(event: ScenarioEvent, index: number, active: boolean, base: bigint) {
  if (event.kind === "FAMILY_CHANGE" && active && event.incomeDuringEventMinor !== null) return base + BigInt(event.incomeDuringEventMinor);
  if (event.kind !== "INCOME_CHANGE") return base;
  if (active && event.incomeDuringEventMinor !== null) return BigInt(event.incomeDuringEventMinor);
  if (!active && index > event.startMonth && event.durationMonths !== null && event.incomeAfterEventMinor !== null) return BigInt(event.incomeAfterEventMinor);
  return base;
}

function aggregatePeriods(results: MonthlySimulationResult[], granularity: SimulationGranularity): SimulationPeriod[] {
  const size = { MONTH: 1, QUARTER: 3, HALF_YEAR: 6 }[granularity];
  const periods: SimulationPeriod[] = [];
  for (let index = 0; index < results.length; index += size) {
    const group = results.slice(index, index + size);
    const end = group[group.length - 1];
    const sum = (field: "incomeMinor" | "expenseMinor" | "debtPaymentMinor" | "monthlyBalanceMinor") => group.reduce((total, item) => total + BigInt(item[field]), 0n).toString();
    const descriptions = [...new Set(group.flatMap((item) => item.eventDescription ? [item.eventDescription] : []))];
    periods.push({ ...end, label: group.length === 1 ? group[0].month : `${group[0].month} - ${end.month}`, months: group.map((item) => item.month), eventDescription: descriptions.join("；") || null, incomeMinor: sum("incomeMinor"), expenseMinor: sum("expenseMinor"), debtPaymentMinor: sum("debtPaymentMinor"), monthlyBalanceMinor: sum("monthlyBalanceMinor") });
  }
  return periods;
}

export function runLifeFinancialSimulation(snapshot: SimulationSnapshot, event: ScenarioEvent): LifeSimulationResult {
  if (snapshot.missingFields.length) throw new Error(`请先补充：${snapshot.missingFields.join("、")}`);
  const start = monthStart(snapshot.currentDate);
  const months = totalMonths(snapshot.currentDate, snapshot.targetDate);
  let cash = BigInt(snapshot.initialCashMinor);
  let liability = BigInt(snapshot.initialLiabilityMinor);
  let prepared = BigInt(snapshot.goal.preparedAmountMinor);
  const incomeBase = BigInt(snapshot.monthlyIncomeMinor);
  const expenseBase = BigInt(snapshot.monthlyExpenseMinor);
  const debtBase = BigInt(snapshot.monthlyDebtPaymentMinor);
  const contribution = BigInt(snapshot.goal.monthlyContributionMinor);
  const target = BigInt(snapshot.goal.targetAmountMinor);
  const results: MonthlySimulationResult[] = [];

  for (let index = 0; index < months; index += 1) {
    const active = eventIsActive(event, index);
    const oneTimeExpense = active && index === event.startMonth ? BigInt(event.oneTimeExpenseMinor) : 0n;
    const extraExpense = active ? BigInt(event.monthlyExpenseChangeMinor) : 0n;
    const income = eventIncome(event, index, active, incomeBase);
    const expense = expenseBase + extraExpense + oneTimeExpense;
    const debtPayment = liability > 0n ? (debtBase > liability ? liability : debtBase) : 0n;
    const balance = income - expense - debtPayment - contribution;
    cash += balance;
    liability -= debtPayment;
    prepared += contribution;
    const progress = target > 0n ? Number((prepared * 10_000n) / target) / 100 : 0;
    const eventDescription = eventText(event, active, index);
    const flags = riskFlags(cash, liability, progress);
    results.push({
      month: monthLabel(addMonths(start, index)), eventDescription, incomeMinor: income.toString(), expenseMinor: expense.toString(),
      debtPaymentMinor: debtPayment.toString(), monthlyBalanceMinor: balance.toString(), cashBalanceMinor: cash.toString(),
      liabilityBalanceMinor: liability.toString(), goalPreparedMinor: prepared.toString(), goalProgress: progress,
      riskFlags: flags, explanation: explanation(eventDescription, balance, flags),
    });
  }

  const granularity = simulationGranularity(snapshot.currentDate, snapshot.targetDate);
  const periods = aggregatePeriods(results, granularity);
  return { createdAt: new Date().toISOString(), sourceRevision: snapshot.sourceRevision, snapshot, event, granularity, monthlyResults: results, periods };
}
