import { db } from "@/lib/db";
import { carFactsSchema, evaluateCarPlan } from "@/domain/car-planning";
import { carContext } from "./car-planning";
import { applyRedLines } from "./decision-database";
import { ApiError } from "./portfolio";

/** Compatibility is isolated here; the public Agent contract stays goal based. */
export async function assessLegacyGoal(workspaceId:string,legacyId:string) {
 return db.$transaction(async tx=>{
  const row=await tx.carDecision.findFirst({where:{workspaceId,id:legacyId}});
  if(!row)throw new ApiError("历史决策不存在",404);
  if(row.status==="PURCHASED")return {status:"MAINTENANCE",missing:[],navigation:{view:"planning"},note:"执行已完成，请在原方案维护实际费用和还款"};
  const facts=carFactsSchema.parse(JSON.parse(row.factsJson));
  const context=await carContext(tx,workspaceId,facts,row.id);
  // New generic reservations must also constrain the legacy calculator.
  const reservations=await tx.goalFundingReservation.findMany({where:{workspaceId}});
  for(const source of context.sources){const occupied=reservations.filter(r=>r.assetId===source.assetId).reduce((s,r)=>s+r.amountMinor,0n);const asset=await tx.asset.findUnique({where:{id:source.assetId!}});if(occupied>0n&&asset&&BigInt(source.amountMinor)>asset.currentValueMinor-occupied)context.missing.push(`${source.name}已有其他目标资金预留，请重新分配`);}
  if(row.sourceRevision!==context.portfolioRevision)context.missing.push("底账已变化，请在原方案页面核对资料");
  const result=await applyRedLines(tx,workspaceId,row.id,facts,context,evaluateCarPlan(facts,context),true);
  return {...result,status:result.missing.length?"NEEDS_INFORMATION":result.scenarios.some(s=>s.adoptable)?"FEASIBLE":"INFEASIBLE",navigation:{view:"planning"},note:"沿用历史计算与确认流程；采纳、实际执行和复盘在原方案卡片完成"};
 });
}
