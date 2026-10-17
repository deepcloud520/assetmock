import { db } from '@/lib/db';
import { apiError, ApiError, getWorkspaceId } from '@/server/portfolio';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{
 const workspaceId=getWorkspaceId(r);const {id}=await c.params;
 const row=await db.carDecision.findFirst({where:{workspaceId,id},include:{plans:{orderBy:{version:'desc'}},evaluations:{where:{status:{not:'REDACTED'}},orderBy:{createdAt:'desc'},take:1}}});
 if(!row)throw new ApiError('规划报告不存在',404);
 return Response.json({decisionId:row.id,goalId:row.goalId,activePlanId:row.activePlanId,latest:row.evaluations[0]?{id:row.evaluations[0].id,sourceSignature:row.evaluations[0].sourceSignature,calculatedOn:row.evaluations[0].calculatedOn,result:JSON.parse(row.evaluations[0].resultJson)}:null,versions:row.plans.filter(p=>JSON.parse(p.snapshotJson).status!=='REDACTED').map(p=>({id:p.id,version:p.version,adoptedAt:p.adoptedAt,snapshot:JSON.parse(p.snapshotJson)}))});
}catch(e){return apiError(e);}}
