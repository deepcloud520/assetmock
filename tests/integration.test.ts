import { describe,it,expect } from 'vitest';
import { db } from '../src/lib/db';
import { openingDraft,confirmOpening,frozenOpening } from '../src/server/simulations/opening';
import { saveReport,listReports } from '../src/server/simulations/access';
import { createBudget } from '../src/server/unified-store';
import { budgetSchema } from '../src/domain/specialist-managers';
import { simplifiedSchema,nextMonth } from '../src/domain/simulation-opening';
import { calculate, defaultInput } from '../src/domain/v2/setup';
import { catalog } from '../src/server/v2/catalog';
import { makeRun,V2Store } from '../src/server/v2/store';
import { advance,quietDraws } from '../src/domain/v2/engine';
async function seed(){
 const w=await db.workspace.create({data:{ledgerConfirmedAt:new Date(),profile:{create:{age:30,rentExpenseMinor:350000n}},assets:{create:[{name:'可用现金',type:'CASH',currentValueMinor:26000000n,liquidityLevel:'T0',riskLevel:1},{name:'保护资金',type:'CASH',currentValueMinor:6000000n,liquidityLevel:'T0',riskLevel:1,isAdjustable:false},{name:'定期',type:'BANK_DEPOSIT',currentValueMinor:8000000n,liquidityLevel:'Y1',riskLevel:1}]},liabilities:{create:{name:'分期',type:'OTHER',outstandingBalanceMinor:1200000n,monthlyPaymentMinor:100000n}}}});
 await db.$transaction(tx=>createBudget(tx,w.id,budgetSchema.parse({incomeMinor:'1800000',livingMinor:'1000000',premiumsIncluded:true,debtIncluded:true,extraFixedMinor:'0',confirmed:true})));
 return w;
}
describe('integrated simulation boundary',()=>{
 it('deduplicates debt, excludes restricted assets, and preserves source when confirming and saving',async()=>{
  const w=await seed(),before=await db.asset.findMany({where:{workspaceId:w.id}}),d=await openingDraft(w.id,null);
  expect(d.values.cash).toBe('26000000');expect(d.values.living).toBe('900000');expect(d.values.salary).toBe('1800000');
  const confirmed=await confirmOpening(w.id,'session-a',{...d.values,age:30,sourceSignature:d.sourceSignature,goalId:null,target:'car',confirmed:true,acknowledgeRestrictions:true});
  const frozen=await frozenOpening(confirmed.id,w.id,'session-a');
  const input={...defaultInput('car'),profileId:confirmed.profile.id};const {setup,errors}=calculate(input,catalog('car'),frozen);expect(errors).toEqual([]);expect(setup.rules.startMonth).toBe(nextMonth(d.asOf));
  const run=makeRun(`integrated:${w.id}:session-a`,setup,{tape:Array.from({length:60},quietDraws)});advance(run);
  const c={workspaceId:w.id,sessionId:'session-a'};await saveReport(run,c);await saveReport(run,c);
  expect(await db.simulationReport.count({where:{runId:run.id}})).toBe(1);expect((await listReports(c))[0].stale).toBe(false);
  expect(await listReports({...c,sessionId:'session-b'})).toEqual([]);
  await expect(frozenOpening(confirmed.id,w.id,'session-b')).rejects.toThrow();
  expect(await db.asset.findMany({where:{workspaceId:w.id}})).toEqual(before);
  await db.asset.update({where:{id:before[0].id},data:{currentValueMinor:{increment:1n}}});expect((await listReports(c))[0].stale).toBe(true);
  await expect(confirmOpening(w.id,'session-a',{...d.values,age:30,sourceSignature:d.sourceSignature,goalId:null,target:'car',confirmed:true,acknowledgeRestrictions:true})).rejects.toThrow('底账已更新');
 });
 it('rejects missing amounts, unsafe integers and invalid debt assumptions',()=>{
  const valid={target:'car',goalId:null,sourceSignature:'x',age:30,cash:'26000000',fund:'0',salary:'0',living:'0',rent:'0',debt:'0',debtPayment:'0',bonus:'0',confirmed:true,acknowledgeRestrictions:true};
  expect(simplifiedSchema.safeParse(valid).success).toBe(true);
  for(const patch of [{cash:''},{cash:'9007199254740993'},{debt:'100',debtPayment:'0'},{rent:'100'}])expect(simplifiedSchema.safeParse({...valid,...patch}).success).toBe(false);
 });
 it('isolates stored games by workspace and retains frozen version on replay calculation',()=>{
  const store=new V2Store(':memory:');const setup=calculate(defaultInput('home'),catalog('home')).setup;const run=store.create('workspace-a:session',setup);
  expect(()=>store.get(run.id,'workspace-b:session')).toThrow();expect(calculate(run.setup.input,catalog('home'),run.setup).setup.rules).toEqual(run.setup.rules);store.close();
 });
});
