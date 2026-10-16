import { z } from 'zod';
import type { LoanOffer, Profile, Setup, SetupInput, RuleSet } from './types';
import { multiply, monthlyPayment } from './money';

export const setupSchema = z.object({
  profileId: z.string().regex(/^GAME-U0[1-5]$/), price: z.number().int().min(5000000).max(30000000),
  offerId: z.string().regex(/^(loan-[ab]|web-[0-9a-f-]{36})$/), downPaymentPercent: z.number().int().min(20).max(80),
  termMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
}).strict();

export function validateSetup(profile: Profile, setup: Setup): string[] {
  const errors: string[] = [];
  if (profile.cash < setup.purchase.price) errors.push('开局现金不足以全款购车，请降低车价或更换角色。');
  if (profile.cash < setup.loan.downPayment + setup.loan.fee) errors.push('开局现金不足以支付首付与费用。');
  return errors;
}

export function calculateSetup(input: SetupInput, profile: Profile, offer: LoanOffer, ruleSet: RuleSet): Setup {
  setupSchema.parse(input);
  if (input.profileId !== profile.id || input.offerId !== offer.id) throw new Error('输入与资料不匹配');
  const downPayment = multiply(input.price, String(input.downPaymentPercent / 100));
  const principal = input.price - downPayment;
  return structuredClone({
    profile, rules: ruleSet,
    purchase: { price: input.price, initialValue: input.price, depreciation: multiply(input.price, '0.01'), runningCost: 150000 },
    loan: { ...offer, downPayment, principal, downPaymentPercent: input.downPaymentPercent,
      termMonths: input.termMonths, payment: monthlyPayment(principal, offer.annualRate, input.termMonths),
      customized: input.downPaymentPercent !== offer.defaultDownPaymentPercent || input.termMonths !== offer.defaultTermMonths },
  });
}
