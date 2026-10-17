import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { budgetSchema,holdingSchema,policySchema } from '@/domain/specialist-managers';
import { createBudget,encode,policyColumns } from './unified-store';
import { demoMarketDataset } from './demo-fixture';
import { importReplayDataset,createReplaySession } from './paper-trading/replay';
export async function createDemoWorkspace(){
 const id=`demo-${randomUUID()}`;
 await db.$transaction(async tx=>{
  await tx.workspace.create({data:{id,ledgerConfirmedAt:new Date(),businessMigratedAt:new Date(),portfolioRevision:1,professionalRevision:1,profile:{create:{age:30,source:'DEMO',stableMonthlyIncomeMinor:1300000n,rentExpenseMinor:400000n,transportExpenseMinor:80000n,essentialExpenseMinor:820000n}},goals:{create:[{type:'CAR_PURCHASE',name:'演示：购置20万元汽车',targetAmountMinor:20000000n,targetDate:new Date('2027-04-30'),source:'DEMO'},{type:'HOME_PURCHASE',name:'演示：购置100万元住房',targetAmountMinor:100000000n,targetDate:new Date('2027-04-30'),source:'DEMO'}]}}});
  await tx.asset.create({data:{workspaceId:id,name:'演示活期资金',type:'CASH',currentValueMinor:24000000n,liquidityLevel:'T0',riskLevel:1,source:'DEMO'}});
  await tx.asset.create({data:{workspaceId:id,name:'演示保护资金',type:'CASH',currentValueMinor:6000000n,liquidityLevel:'T0',riskLevel:1,isAdjustable:false,source:'DEMO'}});
  const fund=await tx.asset.create({data:{workspaceId:id,name:'演示基金账户',type:'EQUITY_FUND',currentValueMinor:0n,liquidityLevel:'D7',riskLevel:3,source:'DEMO'}});
  const holding=holdingSchema.parse({assetId:fund.id,productName:'演示基金',availableOn:'2026-01-01',feeMinor:'0',feeBasis:'游戏假设无手续费',confirmed:true});
  await tx.holdingDetail.create({data:{workspaceId:id,assetId:fund.id,availableOn:holding.availableOn,feeMinor:0n,confirmed:true,dataJson:encode(holding)}});
  const policy=policySchema.parse({name:'演示医疗保障A',insured:'本人',category:'MEDICAL',coverageMinor:'100000000',premiumMinor:'50000',paymentMonths:1,startsOn:null,endsOn:'2027-10-31',nextPaymentOn:null,renewalOn:null,cashValueAssetId:null,confirmed:true,note:'虚构保单；续保、免赔、除外责任未知，不是真实产品推荐'});
  await tx.insurancePolicy.create({data:{workspaceId:id,dataJson:encode(policy),...policyColumns(policy)}});
  await createBudget(tx,id,budgetSchema.parse({incomeMinor:'1300000',livingMinor:'1300000',premiumsIncluded:true,debtIncluded:false,extraFixedMinor:'0',confirmed:true,note:'虚构演示预算：收入 1.3 万、支出 1.3 万，几乎没有结余（故意做成压力场景）'}));
 });
 // Synthetic data stays in dedicated REPLAY accounts. Real market rules and calendars are untouched.
 await db.marketInstrument.upsert({where:{id:'sh600000'},create:{id:'sh600000',name:'浦发银行',source:'演示证券资料，仅合成回放使用',board:'MAIN'},update:{}});
 const dataset=await importReplayDataset(db,id,demoMarketDataset());
 const manual=await createReplaySession(db,id,{datasetId:dataset.id,name:'演示数据 · 手动回放账户'});
 const ai=await createReplaySession(db,id,{datasetId:dataset.id,name:'演示数据 · AI策略实验'},'AI');
 await db.paperStrategyExperiment.create({data:{workspaceId:id,accountId:ai.accountId,name:'演示数据 · AI策略实验'}});
 return {id,manualAccountId:manual.accountId,aiAccountId:ai.accountId,notice:'独立演示空间已建立；底账与行情均为虚构，未改动原工作区。'};
}
