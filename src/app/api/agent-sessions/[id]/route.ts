import { getAgentSession } from "@/server/five-agent-runtime";
import { apiError, getWorkspaceId } from "@/server/portfolio";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{return Response.json(await getAgentSession(getWorkspaceId(request),(await context.params).id));}catch(e){return apiError(e);}}
