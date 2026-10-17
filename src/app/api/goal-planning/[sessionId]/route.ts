import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, getWorkspaceId } from '@/server/portfolio';
import { adoptGoalFunding, coordinateGoalFunding, getGoalFunding, saveGoalFunding } from '@/server/goal-funding';
type Context={params:Promise<{sessionId:string}>};
export async function GET(r:Request,c:Context){try{return Response.json(await getGoalFunding(getWorkspaceId(r),(await c.params).sessionId));}catch(e){return apiError(e);}}
export async function POST(r:Request,c:Context){try{
 const {sessionId}=await c.params;const workspaceId=getWorkspaceId(r);
 const body=z.object({action:z.enum(['SAVE','GENERATE','ADOPT']),data:z.unknown().optional()}).strict().parse(await r.json());
 if(body.action==='SAVE')await db.$transaction(tx=>saveGoalFunding(tx,workspaceId,sessionId,body.data),{timeout:15000});
 if(body.action==='GENERATE')await coordinateGoalFunding(workspaceId,sessionId);
 if(body.action==='ADOPT')await adoptGoalFunding(workspaceId,sessionId,body.data);
 return Response.json(await getGoalFunding(workspaceId,sessionId));
}catch(e){return apiError(e);}}
