import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { today } from '@/domain/database-planning';
import { budgetSchema } from '@/domain/specialist-managers';
import { characterFrom, nextMonth, simplifiedSchema, SIMULATION_NOTICE, type OpeningDraft } from '@/domain/simulation-opening';
import { rulesFor } from '@/domain/v2/setup';
import { ServiceError } from '../store';
import { encode } from '../unified-store';
import type { Setup } from '@/domain/v2/types';
export async function openingDraft(workspaceId: string, goalId: string | null): Promise<OpeningDraft> {
 const w = await db.workspace.findUnique({where:{id:workspaceId},include:{profile:true,assets:{where:{deletedAt:null},include:{holdingDetail:true}},liabilities:{where:{deletedAt:null}},goals:{where:{deletedAt:null}}}});
 if (!w) throw new ServiceError(404,'工作区不存在');
 const asOf=today();
 const [budget, car, goals, constraints] = await Promise.all([
  db.budgetVersion.findFirst({where:{workspaceId,status:'ACTIVE',validFrom:{lte:asOf},OR:[{validTo:null},{validTo:{gt:asOf}}]},orderBy:{revision:'desc'},include:{items:true}}),
  db.carFundingReservation.findMany({where:{workspaceId}}), db.goalFundingReservation.findMany({where:{workspaceId}}), db.decisionConstraint.findMany({where:{workspaceId,status:'ACTIVE'}}),
 ]);
 const goal=w.goals.find(g=>g.id===goalId); if(goalId&&!goal) throw new ServiceError(404,'目标不存在');
 const text=goal?`${goal.type} ${goal.name}`:''; const target=/房|HOUSE|HOME|PROPERTY/i.test(text)?'home':/车|CAR|VEHICLE/i.test(text)?'car':null;
 const assets=w.assets.map(a=>{
  const cash=['CASH','MONEY_MARKET','BANK_DEPOSIT'].includes(a.type); const investment=['EQUITY_FUND','EQUITY','BOND','BOND_FUND','FUND'].includes(a.type);
  const reserved=[...car,...goals].filter(r=>r.assetId===a.id).reduce((n,r)=>n+r.amountMinor,0n);
  const blocked=constraints.some(c=>c.assetId===a.id);
  let reason='可纳入简化游戏';
  if(a.currency!=='CNY') reason='非人民币，本版不自动换汇';
  else if(!cash&&!investment) reason='固定资产或未识别资产不纳入';
  else if(!a.isAdjustable||blocked) reason='存在动用约束，默认排除';
  else if(a.goalId) reason='已关联目标，默认排除以避免重复使用';
  else if(a.holdingDetail?.availableOn&&a.holdingDetail.availableOn>asOf) reason='尚未到可用日期';
  else if(a.liquidityLevel!=='T0'&&!(a.holdingDetail?.confirmed&&a.holdingDetail.availableOn&&a.holdingDetail.availableOn<=asOf)) reason='赎回或到期信息待确认';
  const eligible=reason==='可纳入简化游戏'; const included=eligible?(a.currentValueMinor>reserved?a.currentValueMinor-reserved:0n):0n;
  if(eligible&&reserved>0n) reason='已扣除已登记的资金预留';
  return {id:a.id,name:a.name,balance:a.currentValueMinor.toString(),included:included.toString(),bucket:eligible?(cash?'cash':'fund'):'excluded',reason} as OpeningDraft['assets'][number];
 });
 const sum=(bucket:string)=>assets.filter(a=>a.bucket===bucket).reduce((n,a)=>n+BigInt(a.included),0n).toString();
 const debt=w.liabilities.reduce((n,d)=>n+d.outstandingBalanceMinor,0n); const payment=w.liabilities.reduce((n,d)=>n+d.monthlyPaymentMinor,0n);
 const budgetData=budget?JSON.parse(budget.dataJson):{};
 const {policyMonthly, ...budgetInput}=budgetData;
 const b=budgetSchema.safeParse(budgetInput);
 let living:string|null=null;
 const notes=[SIMULATION_NOTICE,'所有纳入的投资按游戏规则允许即时卖出，无赎回费用；未纳入资金不在本局显示。','既有负债按固定月还本金简化，不模拟原贷款利息。','奖金按第4月及以后每12个月重复，默认0；不代表现实奖金已确认。'];
 if(b.success){ const v=b.data; const premiums=budget!.items.filter(i=>i.kind==='PREMIUM'&&!i.includedInLiving).reduce((n,i)=>n+BigInt(policyMonthly?.[i.sourceRef.replace('POLICY:','')]??i.amountMinor),0n);
  const cuts=v.cuts.filter(c=>c.accepted).reduce((n,c)=>n+BigInt(c.amountMinor),0n);
  const n=BigInt(v.livingMinor)-(v.debtIncluded?payment:0n)+BigInt(v.extraFixedMinor)+premiums+(v.proposedPremiumConfirmed?BigInt(v.proposedPremiumMinor):0n)-cuts;
  living=n>=0n?n.toString():null;
  notes.push(v.debtIncluded?'预算内还款已剥离，由游戏单独扣本金。':'既有还款在生活费之外扣除。',v.premiumsIncluded?'现有保费已包含，不再次扣减。':'预算外保费已加入生活费，请核对缴费周期。','一次性费用及其他目标未来投入未展开，请在简化确认时核对。');
 }
 const signature=createHash('sha256').update(encode({w,budget,car,goals,constraints})).digest('hex');
 return {sourceSignature:signature,goalId:goal?.id??null,target,price:goal?.targetAmountMinor.toString()??null,asOf,assets,notes,values:{age:w.profile?.age?.toString()??null,cash:sum('cash'),fund:sum('fund'),salary:b.success?b.data.incomeMinor:null,living,rent:w.ledgerConfirmedAt?w.profile?.rentExpenseMinor.toString()??null:null,debt:debt.toString(),debtPayment:payment.toString(),bonus:'0'}};
}
export async function confirmOpening(workspaceId:string,sessionId:string,raw:unknown){
 const a=simplifiedSchema.parse(raw); const source=await openingDraft(workspaceId,a.goalId);
 if(source.sourceSignature!==a.sourceSignature)throw new ServiceError(409,'底账已更新，请重新载入并确认');
 const id=randomUUID(), profile=characterFrom(a,`ledger-${id}`), rules={...rulesFor(a.target),version:'0.3.0' as const,startMonth:nextMonth(source.asOf)};
 const sourceInfo={kind:'ledger' as const,workspaceId,goalId:a.goalId,signature:source.sourceSignature,confirmedAt:new Date().toISOString(),notes:source.notes,sourceAssets:source.assets,confirmed:a};
 await db.simulationOpening.create({data:{id,workspaceId,sessionId,body:encode({profile,rules,source:sourceInfo})}});
 return {id,profile,source:sourceInfo};
}
export async function frozenOpening(id:string,workspaceId:string,sessionId:string):Promise<Pick<Setup,'profile'|'rules'|'source'>>{
 const r=await db.simulationOpening.findFirst({where:{id,workspaceId,sessionId}});if(!r)throw new ServiceError(404,'底账确认已失效，请重新确认');return JSON.parse(r.body);
}
