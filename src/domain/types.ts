export type PathKey = 'cash' | 'loan';
export const pathKeys: PathKey[] = ['cash', 'loan'];
export type EventKind = 'medical' | 'jobLoss' | 'bonusDelay' | 'marketDrop';
export type Draws = Record<EventKind, number>;
export type EventTape = Draws[];

export interface Profile {
  id: string; version: string; name: string; description: string;
  cash: number; fund: number; salary: number; living: number;
  debt: number; debtPayment: number; bonus: number; bonusMonth: number;
}
export interface LoanOffer {
  id: string; name: string; defaultDownPaymentPercent: number; defaultTermMonths: number;
  annualRate: string; fee: number; documentId: string; documentVersion: string;
  sourceType: 'preset_fixture' | 'web_reference'; excerpt: string;
  sourceUrl?: string; retrievedAt?: string;
}
export interface SearchDocument {
  id: string; title: string; url: string; site: string; snippet: string; content: string;
  publishedAt?: string; retrievedAt: string;
}
export interface LoanResearch {
  status: 'ok' | 'empty' | 'error'; query: string; notice: string;
  documents: SearchDocument[];
  drafts: { sourceId: string; annualRatePercent: string | null; feeYuan: number | null; rateEvidence: string; feeEvidence: string }[];
}
export interface SetupInput {
  profileId: string; price: number; offerId: string; downPaymentPercent: number; termMonths: number;
}
export interface PurchasePlan { price: number; initialValue: number; depreciation: number; runningCost: number }
export interface LoanPlan extends LoanOffer {
  downPayment: number; principal: number; termMonths: number; payment: number;
  downPaymentPercent: number; customized: boolean;
}
export interface RuleSet {
  version: string; months: number; startMonth: string;
  probabilities: Draws; medicalCost: number; medicalDuration: number;
  unemploymentDuration: number; bonusDelayMonths: number; marketDropRate: string;
}
export interface Setup { profile: Profile; purchase: PurchasePlan; loan: LoanPlan; rules: RuleSet }
export interface PathState {
  cash: number; fund: number; car: number; debt: number; loanBalance: number;
  netWorth: number; status: 'running' | 'completed' | 'failed'; lastSettledMonth: number;
  failure?: { month: number; shortfall: number; reason: string };
}
export interface LifeState { medicalUntil: number; unemployedUntil: number; bonusDueMonth: number; bonusPaid: boolean }
export interface DualPathState { month: number; life: LifeState; paths: Record<PathKey, PathState> }
export interface Ledger {
  salary: number; bonus: number; living: number; carExpense: number; medical: number;
  debtPrincipal: number; loanPrincipal: number; interest: number; fundLoss: number;
  fundSale: number; depreciation: number; netChange: number;
}
export interface GameEvent { kind: EventKind; title: string; description: string }
export interface PathResult { state: PathState; ledger: Ledger | null; settled: boolean }
export interface MonthResult {
  month: number; events: GameEvent[]; life: LifeState;
  paths: Record<PathKey, PathResult>;
}
export interface StoredRun {
  id: string; sessionId: string; createdAt: string; confirmedAt: string;
  setup: Setup; tape: EventTape; initial: DualPathState; state: DualPathState;
  history: MonthResult[]; status: 'running' | 'ended'; parentId?: string;
}
export interface Fact { id: string; text: string }
export interface Explanation {
  source: 'model' | 'rules'; paragraphs: { factIds: string[]; text: string }[];
  facts: Fact[]; notice?: string;
}
export interface PublicPath {
  netWorth: number; initialNetWorth: number; delta: number | null;
  lastSettledMonth: number; status: PathState['status']; failure?: PathState['failure'];
}
export interface PublicRun {
  id: string; month: number; status: StoredRun['status']; profile: Pick<Profile, 'id' | 'name' | 'description'>;
  input: SetupInput; plan: { purchase: PurchasePlan; loan: LoanPlan; confirmedAt: string };
  paths: Record<PathKey, PublicPath>;
  timeline: { month: number; cash: number | null; loan: number | null }[];
  months: { month: number; events: GameEvent[]; treating: boolean; unemployed: boolean; facts: Fact[] }[];
  summary: { comparable: boolean; difference: number | null; facts: Fact[] };
  ruleDescription: string;
}
