import type { Profile, RuleSet } from './types';

export const profiles: Profile[] = [
  ['GAME-U01', '林舟', '收支均衡', 260000, 40000, 18000, 9000, 0, 0, 20000],
  ['GAME-U02', '陈夏', '购车后余量较小', 210000, 20000, 15000, 11000, 0, 0, 10000],
  ['GAME-U03', '周越', '收入高，已有分期', 240000, 120000, 30000, 16000, 12000, 1000, 30000],
  ['GAME-U04', '许宁', '投资资产较多', 220000, 180000, 18000, 12000, 0, 0, 30000],
  ['GAME-U05', '沈安', '现金多，月度结余小', 320000, 0, 12000, 10000, 0, 0, 0],
].map(([id, name, description, cash, fund, salary, living, debt, debtPayment, bonus]) => ({
  id: String(id), name: String(name), description: String(description), version: '0.1.0',
  cash: Number(cash) * 100, fund: Number(fund) * 100, salary: Number(salary) * 100,
  living: Number(living) * 100, debt: Number(debt) * 100,
  debtPayment: Number(debtPayment) * 100, bonus: Number(bonus) * 100, bonusMonth: 4,
}));

export const rules: RuleSet = {
  version: '0.1.2', months: 18, startMonth: '2026-11',
  probabilities: { medical: 10000, jobLoss: 20000, bonusDelay: 200000, marketDrop: 50000 },
  medicalCost: 5000000, medicalDuration: 3, unemploymentDuration: 3, reemploymentSalaryRatio: '0.8',
  bonusDelayMonths: 3, marketDropRate: '0.2',
};
export const defaultInput = {
  profileId: 'GAME-U01', price: 20000000, offerId: 'loan-a', downPaymentPercent: 30, termMonths: 36,
};
