import Decimal from 'decimal.js';
export const roundCents = (value: Decimal.Value): number => new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export const multiply = (cents: number, ratio: Decimal.Value): number => roundCents(new Decimal(cents).mul(ratio));

export function monthlyPayment(principal: number, annualRate: string, months: number): number {
  const rate = new Decimal(annualRate).div(12);
  if (rate.isZero()) return roundCents(new Decimal(principal).div(months));
  const factor = rate.plus(1).pow(months);
  return roundCents(new Decimal(principal).mul(rate).mul(factor).div(factor.minus(1)));
}
export function repayment(balance: number, annualRate: string, payment: number, last: boolean) {
  if (balance === 0) return { interest: 0, principal: 0, total: 0 };
  const interest = roundCents(new Decimal(balance).mul(annualRate).div(12));
  const principal = last ? balance : Math.min(balance, Math.max(0, payment - interest));
  return { interest, principal, total: interest + principal };
}
export const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
