import { budgetSchema, budgetCapacity, monthlyPremium, policySchema } from "@/domain/specialist-managers";
import { goalFactsSchema, type GoalFacts } from "@/domain/agents";
import type { AgentFacts } from "./agent-context";

export function confirmedCapacity(f: AgentFacts, goalId?: string | null) {
 const b = budgetSchema.safeParse(f.budget ? JSON.parse(f.budget.dataJson) : null);
 if (!b.success) return { status: "NEEDS_INFORMATION", missing: ["请确认规划收入、生活预算与费用口径"], capacity: null };
 const policies = f.policies.map(p => policySchema.safeParse(JSON.parse(p.dataJson))).filter(p => p.success).map(p => p.data!);
 const protectionKnown = f.insuranceNeed?.status === "NONE" || f.insuranceNeed?.status === "PROVIDED" && policies.length > 0 && policies.every(p => p.confirmed && p.premiumMinor !== null);
 const capacity = budgetCapacity(b.data, f.liabilities.reduce((s,l) => s+l.monthlyPaymentMinor,0n), monthlyPremium(policies), f.goals.filter(g => g.id !== goalId).reduce((s,g)=>s+g.monthlyContributionMinor,0n));
 return { status: protectionKnown ? "READY" : "NEEDS_INFORMATION", missing: protectionKnown ? [] : ["保费承诺尚未完整核对"], capacity };
}
export function assessGenericGoal(raw: unknown, f: AgentFacts, goalId?: string | null, decisionId?: string) {
 const g = goalFactsSchema.parse(raw); const missing: string[] = [];
 if (g.targetAmountMinor === null) missing.push("目标金额未确认");
 if (!g.targetDate) missing.push("目标时间未确认");
 if (g.reserveMinor === null) missing.push("储备底线未确认");
 if(g.monthlyCostMinor===null)missing.push("目标实现后的持续费用未确认（明确没有时请确认零）");
 if (!g.confirmed) missing.push("目标决策资料待确认");
 if (!f.ledgerConfirmed) missing.push("实际资产余额尚未整体核对");
 const cap = confirmedCapacity(f, goalId); missing.push(...cap.missing);
 for(const other of f.goals.filter(g=>g.id!==goalId&&g.preparedAmountMinor>0n)){
  const linked=f.assets.filter(a=>a.goalId===other.id);
  const covered=linked.reduce((s,a)=>s+a.currentValueMinor,0n)+[...f.reservations,...f.legacyReservations].filter(r=>r.decision.goalId===other.id&&!linked.some(a=>a.id===r.assetId)).reduce((s,r)=>s+r.amountMinor,0n);
  if(covered<other.preparedAmountMinor)missing.push(`“${other.name}”的已准备金额尚未完整关联资金，需核对占用范围`);
 }
 const forbidden = new Set(f.constraints.filter(c => c.type === "NO_USE_ASSET").map(c=>c.assetId));
 const selected = f.assets.filter(a=>g.assetIds.includes(a.id));
 if (selected.length !== g.assetIds.length) missing.push("选择的资产已删除或不属于当前空间");
 const funding = selected.map(a => {
  const held = f.reservations.filter(r=>r.assetId===a.id && r.decisionId!==decisionId).reduce((s,r)=>s+r.amountMinor,0n)+f.legacyReservations.filter(r=>r.assetId===a.id).reduce((s,r)=>s+r.amountMinor,0n);
  const h = f.holdings.find(h=>h.assetId===a.id);
  const protectedAsset = a.currency!=="CNY" || f.constraints.some(c=>c.type==="NO_USE_GOAL_FUND"&&c.goalId===a.goalId) || forbidden.has(a.id) || !a.isAdjustable || !!a.goalId && a.goalId!==goalId;
  const availableOn = h?.confirmed ? h.availableOn : a.liquidityLevel === "T0" ? f.asOf : null;
  if (!availableOn && !protectedAsset) missing.push(`${a.name}可用时间未确认`);
  if (h && !h.confirmed && !protectedAsset) missing.push(`${a.name}持仓资料未确认`);
  if (h && h.feeMinor===null && !protectedAsset) missing.push(`${a.name}动用费用未确认`);
  const fee=h?.confirmed?h.feeMinor??0n:0n;
  const gross=protectedAsset || held>=a.currentValueMinor ? 0n : a.currentValueMinor-held;
  const amount=gross>fee?gross-fee:0n;
  return { assetId:a.id, name:a.name, amountMinor:amount.toString(), feeMinor:fee.toString(), availableOn, protected:protectedAsset };
 });
 if (g.preparedAmountMinor && BigInt(g.preparedAmountMinor)>0n && !selected.length) missing.push("已准备金额需关联实际资金来源，不能重复或凭声明当余额");
 const amount = g.targetAmountMinor===null ? 0n : BigInt(g.targetAmountMinor);
 const reserve = BigInt(g.reserveMinor??"0");
 const start = Number(f.asOf.slice(0,4))*12+Number(f.asOf.slice(5,7));
 const end = g.targetDate ? Number(g.targetDate.slice(0,4))*12+Number(g.targetDate.slice(5,7)) : start;
 const months = end-start;
 if (months<0 || g.targetDate && g.targetDate<f.asOf) missing.push("目标日期已到，请核对实际执行状态");
 if (months>120) return { status:"UNSUPPORTED", capability:"goal-funding", formulaVersion:"generic-funding-v1", missing:["当前月度计算期最长十年"], scenarios:[], funding };
 const monthly = BigInt(cap.capacity?.withCutsMinor??"0");
 const current = funding.filter(a=>a.availableOn && a.availableOn<=f.asOf).reduce((s,a)=>s+BigInt(a.amountMinor),0n);
 const atTarget = funding.filter(a=>a.availableOn && g.targetDate && a.availableOn<=g.targetDate).reduce((s,a)=>s+BigInt(a.amountMinor),0n);
 const budget=f.budget?budgetSchema.safeParse(JSON.parse(f.budget.dataJson)):null;
 const extraMonth=budget?.success?budget.data.oneOffMonth:null;
 const extra=budget?.success?BigInt(budget.data.oneOffMinor):0n;
 const extraDue=extraMonth && extraMonth>=f.asOf.slice(0,7) && extraMonth<=(g.targetDate??f.asOf).slice(0,7)?extra:0n;
 const saved = monthly*BigInt(Math.max(0,months));
 const minimumReserve = f.constraints.filter(c=>["MIN_LIQUID","NO_USE_EMERGENCY"].includes(c.type)).reduce((s,c)=>c.thresholdValue!==null && c.thresholdValue+(c.operator==="GT"?1n:0n)>s?c.thresholdValue+(c.operator==="GT"?1n:0n):s,reserve);
 const usable = atTarget+saved-extraDue>minimumReserve ? atTarget+saved-extraDue-minimumReserve : 0n;
 const unsupportedConstraints = f.constraints.filter(c=>!["NO_USE_ASSET","NO_NEW_DEBT","MIN_LIQUID","NO_USE_EMERGENCY","NO_USE_GOAL_FUND","MAX_DEBT_RATIO"].includes(c.type));
 if (unsupportedConstraints.length) missing.push("部分已确认红线需要进一步规则核对，不能忽略");
 for(const c of f.constraints.filter(c=>c.type==="MAX_DEBT_RATIO")){
  const b= f.budget ? budgetSchema.safeParse(JSON.parse(f.budget.dataJson)) : null;const income=b?.success?BigInt(b.data.incomeMinor):0n;const repayment=f.liabilities.reduce((s,l)=>s+l.monthlyPaymentMinor,0n);
  if(income<=0n||c.thresholdValue===null)missing.push("月还款收入比资料不足");
  else if(c.operator==="LT"?repayment*10000n>=income*c.thresholdValue:repayment*10000n>income*c.thresholdValue)missing.push("全部债务还款超过已确认收入比例红线");
 }
 const rows = Array.from({length:Math.max(0,months)+1},(_,i)=> {
  const date=i===0?f.asOf:new Date(Date.UTC(Number(f.asOf.slice(0,4)),Number(f.asOf.slice(5,7))-1+i,1)).toISOString().slice(0,10);
  const assets=funding.filter(a=>a.availableOn && a.availableOn<=(i===months?g.targetDate??date:date)).reduce((s,a)=>s+BigInt(a.amountMinor),0n);
  const oneOff=extraMonth && extraMonth>=f.asOf.slice(0,7) && extraMonth<=date.slice(0,7)?extra:0n;
  const balance=assets+monthly*BigInt(i)-oneOff-(i===months?amount:0n);
  return { month:date.slice(0,7), balanceMinor:balance.toString(), reserveMinor:minimumReserve.toString(), reserveSatisfied:balance>=minimumReserve };
 });
 const viable = !missing.length && monthly>=BigInt(g.monthlyCostMinor??"0") && rows.every(r=>r.reserveSatisfied);
 return { status:missing.length?"NEEDS_INFORMATION":viable?"FEASIBLE":"INFEASIBLE", capability:"goal-funding", formulaVersion:"generic-funding-v1", missing:[...new Set(missing)],
  funding, monthlyAvailableMinor:monthly.toString(), minimumReserveMinor:minimumReserve.toString(), afterGoalMonthlyMinor:(monthly-BigInt(g.monthlyCostMinor??"0")).toString(), budgetUpperMinor:usable.toString(), gapMinor:(amount>usable?amount-usable:0n).toString(), months, assumptions:["不计入未来投资收益","本月作为余额核对点，未来整月按确认预算积累","准备金额只作核对，不与资金来源再次相加","持续费用按确认的恒定月预算检查，未来收入和费用变化需要复盘"],
  scenarios:[{key:"BASE",adoptable:viable,amountMinor:amount.toString(),targetDate:g.targetDate,monthlyCostMinor:g.monthlyCostMinor,currentAvailableMinor:current.toString(),timeline:rows,funding}] };
}
export const planningCapabilities = [{ id:"goal-funding", version:"generic-funding-v1", description:"一次性目标资金、月度筹资、资产可用日期、储备与持续费用检查", maxMonths:120 }];
export function normalizedGoalFacts(raw:unknown):GoalFacts { return goalFactsSchema.parse(raw); }
