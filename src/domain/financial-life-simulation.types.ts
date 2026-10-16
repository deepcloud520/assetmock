/** 财务人生推演 v1 的数据契约；本文件不执行模拟，也不修改真实底账。 */

export type MoneyMinor = string;
export type CalendarMonth = string; // YYYY-MM
export type SimulationMode = "OBSERVE" | "SPECIFIED_SCENARIO";
export type SimulationStrategy = "GOAL_FIRST" | "BALANCED" | "SAFETY_FIRST";
export type RunStatus = "READY" | "RUNNING" | "PAUSED_AT_TURN" | "ENDED" | "STALE";
export type AssumptionSource = "LEDGER" | "PLAN" | "USER_CONFIRMED" | "CATALOG_HYPOTHESIS";

export type SimulationSource =
  | {
      kind: "REAL";
      workspaceId: string;
      portfolioRevision: number;
      planSetId: string;
      planKey: "A" | "B" | "C";
      goalId: string;
      capturedAt: string;
    }
  | { kind: "DEMO"; sampleId: "financial-life-demo-v1"; capturedAt: string };

export type GoalFundingBasis =
  | { kind: "LINKED_ASSETS_ONLY"; linkedAssetsMinor: MoneyMinor; declaredPreparedMinor: MoneyMinor }
  | { kind: "DECLARED_ONLY"; linkedAssetsMinor: MoneyMinor; declaredPreparedMinor: MoneyMinor }
  | { kind: "CONFIRMED_DISJOINT"; linkedAssetsMinor: MoneyMinor; declaredPreparedMinor: MoneyMinor };

export type SimulationOpening = {
  source: SimulationSource;
  startMonth: CalendarMonth;
  endMonth: CalendarMonth;
  currency: "CNY";
  strategy: SimulationStrategy;
  ageAtStart: number | null;
  familyStatus: string | null;
  unrestrictedLiquidMinor: MoneyMinor;
  goalFunding: GoalFundingBasis;
  initialGoalFundedMinor: MoneyMinor;
  otherAssetValueMinor: MoneyMinor;
  liabilities: Array<{ id: string; balanceMinor: MoneyMinor; scheduledPaymentMinor: MoneyMinor }>;
  stableIncomeMinor: MoneyMinor;
  otherIncomeMinor: MoneyMinor;
  essentialExpenseMinor: MoneyMinor;
  flexibleExpenseMinor: MoneyMinor;
  goal: {
    id: string;
    name: string;
    type: string;
    targetMinor: MoneyMinor;
    targetMonth: CalendarMonth;
    plannedContributionMinor: MoneyMinor;
    flexible: boolean;
  };
  assumptions: Array<{
    field: string;
    source: AssumptionSource;
    note: string;
  }>;
};

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type FrozenSimulationOpening = DeepReadonly<SimulationOpening>;

export type EventCategory = "WORK" | "FAMILY" | "HOUSING" | "HEALTH_COST" | "GOAL" | "MARKET";
export type EventOrigin = "SCHEDULED" | "USER_CONFIRMED" | "CONDITIONAL" | "EXPLORATORY";
export type EventCondition =
  | { field: "age" | "reserveMonths"; op: "LT" | "LTE" | "GT" | "GTE" | "EQ"; value: number }
  | { field: "familyStatus" | "incomeStatus" | "goalType" | "eventTag"; op: "EQ" | "NEQ"; value: string }
  | { field: "hasLiability"; op: "EQ"; value: boolean };

export type EventEffect =
  | { kind: "ONE_TIME_EXPENSE"; amountMinor: MoneyMinor }
  | { kind: "MONTHLY_EXPENSE_DELTA"; amountMinor: MoneyMinor; durationMonths: number }
  | { kind: "MONTHLY_INCOME_OVERRIDE"; amountMinor: MoneyMinor; durationMonths: number }
  | { kind: "GOAL_TARGET_DELTA"; amountMinor: MoneyMinor }
  | { kind: "OTHER_ASSET_VALUE_DELTA"; amountMinor: MoneyMinor }
  | { kind: "STATE_TAG"; tag: string; durationMonths: number | null };

export type EventDefinition = {
  id: string;
  version: number;
  title: string;
  category: EventCategory;
  origin: EventOrigin;
  earliestMonth: CalendarMonth | null;
  latestMonth: CalendarMonth | null;
  conditions: EventCondition[];
  exclusions: EventCondition[];
  priority: number;
  weight: number; // 仅用于本局虚构事件抽取，不代表现实发生概率
  cooldownMonths: number;
  exclusiveGroup: string | null;
  maxOccurrences: number;
  effects: EventEffect[];
  followUpTags: string[];
  narrativeKey: string;
};

export type EventOccurrence = {
  occurrenceId: string;
  eventId: string;
  eventVersion: number;
  month: CalendarMonth;
  origin: EventOrigin;
  resolvedEffects: EventEffect[];
  triggeredByOccurrenceId: string | null;
  assumptionSource: AssumptionSource;
};

export type GoalStatus = "ON_TRACK" | "AT_RISK" | "MET_ON_TIME" | "SHORT_AT_DEADLINE";
export type RiskFlag = "LOW_RESERVE" | "CONTRIBUTION_PAUSED" | "UNFUNDED_GAP" | "GOAL_AT_RISK";

export type SimulationState = {
  month: CalendarMonth;
  age: number | null;
  familyStatus: string | null;
  incomeStatus: string;
  availableCashMinor: MoneyMinor;
  goalFundedMinor: MoneyMinor;
  otherAssetValueMinor: MoneyMinor;
  liabilities: Array<{ id: string; balanceMinor: MoneyMinor; scheduledPaymentMinor: MoneyMinor }>;
  stableIncomeMinor: MoneyMinor;
  otherIncomeMinor: MoneyMinor;
  essentialExpenseMinor: MoneyMinor;
  flexibleExpenseMinor: MoneyMinor;
  goalTargetMinor: MoneyMinor;
  goalStatus: GoalStatus;
  activeEffects: Array<{ occurrenceId: string; effect: EventEffect; remainingMonths: number | null }>;
  tags: string[];
  lastOccurrences: Array<{ eventId: string; month: CalendarMonth }>;
};

export type MonthlyLedger = {
  month: CalendarMonth;
  openingCashMinor: MoneyMinor;
  incomeMinor: MoneyMinor;
  dueEssentialExpenseMinor: MoneyMinor;
  dueEventExpenseMinor: MoneyMinor;
  dueDebtPaymentMinor: MoneyMinor;
  essentialExpenseMinor: MoneyMinor;
  flexibleExpenseMinor: MoneyMinor;
  eventExpenseMinor: MoneyMinor;
  debtPaymentMinor: MoneyMinor;
  plannedContributionMinor: MoneyMinor;
  actualContributionMinor: MoneyMinor;
  closingCashMinor: MoneyMinor;
  closingGoalFundedMinor: MoneyMinor;
  closingLiabilityMinor: MoneyMinor;
  unfundedGapMinor: MoneyMinor;
  eventOccurrenceIds: string[];
  riskFlags: RiskFlag[];
};

export type SimulationTurn = {
  turnIndex: number;
  fromMonth: CalendarMonth;
  toMonth: CalendarMonth;
  openingState: SimulationState;
  closingState: SimulationState;
  months: MonthlyLedger[];
  occurrences: EventOccurrence[];
  narrative: Array<{ key: string; occurrenceId: string | null; referencedFields: string[] }>;
  stopReason: "YEAR_END" | "KEY_EVENT" | "UNFUNDED_GAP" | "GOAL_DEADLINE";
};

export type SimulationEnding = {
  kind: "GOAL_MET" | "GOAL_SHORTFALL" | "CASH_GAP" | "HORIZON_REACHED";
  month: CalendarMonth;
  goalTargetMinor: MoneyMinor;
  goalFundedMinor: MoneyMinor;
  goalGapMinor: MoneyMinor;
  lowestCashMinor: MoneyMinor;
  unfundedGapMinor: MoneyMinor;
  pivotalOccurrenceIds: string[];
};

export type ScenarioScript = {
  id: string;
  seed: string;
  catalogVersion: string;
  events: Array<{
    month: CalendarMonth;
    eventId: string;
    eventVersion: number;
    resolvedEffects: EventEffect[];
  }>;
};

export type SimulationComparison = {
  id: string;
  openingPortfolioRevision: number;
  goalId: string;
  scenarioScript: ScenarioScript;
  runIdsByPlanKey: Partial<Record<"A" | "B" | "C", string>>;
};

export type SimulationRun = {
  id: string;
  schemaVersion: 1;
  engineVersion: string;
  catalogVersion: string;
  mode: SimulationMode;
  seed: string;
  status: RunStatus;
  opening: SimulationOpening;
  state: SimulationState;
  turns: SimulationTurn[];
  ending: SimulationEnding | null;
  createdAt: string;
  updatedAt: string;
};
