import { describe,it,expect } from 'vitest';
import { carFactsSchema,evaluateCarPlan, type CarContext } from './car-planning';
import { buildFundingReport } from './goal-funding-report';
const context:CarContext={asOfMonth:'2026-10',portfolioRevision:1,transactionRevision:0,sources:[{id:'ASSET:cash',assetId:'cash',name:'存款',amountMinor:'20000000',month:'2026-10',priority:2}],protectedSources:[],monthlyDebtMinor:'0',otherGoalMonthlyMinor:'0',otherGoalReserveMinor:'0',missing:[],accountAssets:[{id:'cash',name:'存款',type:'CASH',goalId:null,currentValueMinor:'20000000',reservedMinor:'0',currency:'CNY'}]};
const facts=()=>carFactsSchema.parse({unifiedPlanning:true,purpose:'买车',budgetMinor:'20000000',targetMonth:'2027-10',landingFeesMinor:'1000000',runningMonthlyMinor:'100000',replacedTransportMinor:'0',monthlyIncomeMinor:'1000000',livingExpensesMinor:'500000',monthlyPremiumMinor:'0',reserveFloorMinor:'6000000',cashflowConfirmed:true,insuranceConfirmed:true,constraintsConfirmed:true,costsConfirmed:true,sourcesConfirmed:true,otherGoalsConfirmed:true});
const offer=(termMonths:number,quoted=true)=>({id:`loan${termMonths}`,label:`${termMonths}个月`,quoted,annualRatePercent:'4',rateBasis:'NOMINAL_ANNUAL' as const,termMonths,downPaymentPercent:20,maxPrincipalMinor:'16000000',feeMinor:'10000',method:'EQUAL_PAYMENT' as const});
describe('unified funding',()=>{
 it('uses future savings before unallocated cash and reconciles account rows',()=>{
  const f=facts();const e=evaluateCarPlan(f,context);const s=e.scenarios[0];expect(s.adoptable).toBe(false); // 26万可用，21万付款后不足6万储备
  f.budgetMinor='18000000';const eval2=evaluateCarPlan(f,context);const v=eval2.scenarios[0];expect(v.adoptable).toBe(true);
  expect(v.funding[0].assetId).toBeNull();expect(v.funding.reduce((n,s)=>n+BigInt(s.usedMinor),0n)).toBe(BigInt(v.upfrontMinor));
  const r=buildFundingReport(f,context,eval2).scenarios[0];expect(r.accounts.reduce((n,a)=>n+BigInt(a.usedMinor),0n)).toBe(BigInt(v.upfrontMinor));
  for(const a of r.accounts)expect(BigInt(a.currentMinor)+BigInt(a.accumulatedMinor)-BigInt(a.usedMinor)).toBe(BigInt(a.afterMinor));
 });
 it('compares minimal necessary principal per quoted term on identical horizons',()=>{
  const f={...facts(),loanOffers:[offer(24),offer(36),offer(60)]};const e=evaluateCarPlan(f,context);const loans=e.scenarios.filter(s=>s.method==='LOAN');expect(loans).toHaveLength(3);expect(new Set(e.scenarios.map(s=>s.timeline.length)).size).toBe(1);
  for(const s of loans){expect(s.loanPrincipalMinor).toBe('1010000');expect(s.loanPayments.reduce((v,p)=>v+BigInt(p.principalMinor),0n)).toBe(1010000n);expect(s.adoptable).toBe(true);}
  expect(e.scenarios.find(s=>s.key===e.recommendedKey)?.loanPayments.length).toBe(24);
 });
 it('does not adopt assumptions, exceed monthly limits, or invent other terms',()=>{
  const e=evaluateCarPlan({...facts(),loanOffers:[offer(36,false)],maxMonthlyPaymentMinor:'1'},context);expect(e.scenarios.filter(s=>s.method==='LOAN')).toHaveLength(1);expect(e.scenarios.every(s=>!s.adoptable)).toBe(true);expect(e.scenarios.find(s=>s.method==='LOAN')?.reasons).toContain('月供超过已确认上限');
 });
 it('keeps missing values unknown and returns no invented amounts',()=>{const e=evaluateCarPlan({...facts(),monthlyPremiumMinor:null},context);expect(e.missing).toContain('月均保费与年度费用预留');expect(e.scenarios).toEqual([]);});
 it('supports user-specified principal but blocks amounts over quoted maximum',()=>{const e=evaluateCarPlan({...facts(),loanOffers:[{...offer(36),requestedPrincipalMinor:'19000000'}]},context);expect(e.scenarios.find(s=>s.key.endsWith('REQUESTED'))?.adoptable).toBe(false);});
 it('does not use assets arriving after purchase',()=>{const late={...context,sources:context.sources.map(s=>({...s,month:'2028-01'}))};const e=evaluateCarPlan(facts(),late);expect(e.scenarios[0].adoptable).toBe(false);expect(e.scenarios[0].funding.some(s=>s.assetId==='cash')).toBe(false);});
 it('reports preparation spending and excluded balances without double counting',()=>{
  const c={...context,additionalExpenses:[{month:'2026-10',amountMinor:'1000000'}],accountAssets:[...context.accountAssets!,{id:'protected',name:'保留资产',type:'FUND',goalId:null,currentValueMinor:'5000000',reservedMinor:'2000000',currency:'CNY'}]};
  const f={...facts(),budgetMinor:'16000000'};const e=evaluateCarPlan(f,c);const r=buildFundingReport(f,c,e).scenarios[0];
  for(const a of r.accounts)expect(BigInt(a.currentMinor)+BigInt(a.accumulatedMinor)-BigInt(a.usedMinor)).toBe(BigInt(a.afterMinor));
  expect(r.accounts.find(a=>a.account==='growth')?.availableAfterMinor).toBe('0');
  expect(r.accounts.reduce((v,a)=>v+BigInt(a.availableAfterMinor),0n)).toBe(BigInt(e.scenarios[0].balanceBeforePurchaseMinor)-BigInt(e.scenarios[0].upfrontMinor));
 });
 it('counts confirmed bonuses only when received by the purchase month',()=>{
  const bonus={id:'annual',name:'年终奖',amountMinor:'2000000',month:'2027-01',confirmed:false};
  expect(evaluateCarPlan({...facts(),bonuses:[bonus]},context).scenarios[0].adoptable).toBe(false);
  const confirmed=evaluateCarPlan({...facts(),bonuses:[{...bonus,confirmed:true}]},context).scenarios[0];expect(confirmed.adoptable).toBe(true);expect(confirmed.funding.some(s=>s.id==='BONUS:annual')).toBe(true);
  expect(evaluateCarPlan({...facts(),bonuses:[{...bonus,confirmed:true,month:'2028-01'}]},context).scenarios[0].adoptable).toBe(false);
 });
});
