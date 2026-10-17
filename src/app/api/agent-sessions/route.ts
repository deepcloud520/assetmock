import { createAgentSession, listAgentSessions } from "@/server/five-agent-runtime";
import { apiError, getWorkspaceId } from "@/server/portfolio";
export async function GET(request:Request){try{return Response.json(await listAgentSessions(getWorkspaceId(request),new URL(request.url).searchParams.get("agentKey")));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{return Response.json(await createAgentSession(getWorkspaceId(request),await request.json()));}catch(e){return apiError(e);}}
