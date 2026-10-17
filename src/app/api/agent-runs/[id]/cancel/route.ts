import { cancelAgentRun } from "@/server/five-agent-runtime";
import { apiError,getWorkspaceId } from "@/server/portfolio";
export const runtime="nodejs";
export const maxDuration=130;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const workspace=getWorkspaceId(request),id=(await context.params).id;return Response.json(await cancelAgentRun(workspace,id));}catch(e){return apiError(e);}}
