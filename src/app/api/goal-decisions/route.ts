import { db } from "@/lib/db";
import { agentFacts } from "@/server/agent-context";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";
export async function GET(request:Request){try{const workspaceId=getWorkspaceId(request);await agentFacts(workspaceId);return Response.json(serialize(await db.goalDecision.findMany({where:{workspaceId,status:{not:"REDACTED"}},include:{evaluations:{orderBy:{createdAt:"desc"},take:1},plans:{orderBy:{version:"desc"},take:5},reviews:{orderBy:{period:"desc"},take:3}},orderBy:{updatedAt:"desc"},take:30})));}catch(e){return apiError(e);}}
