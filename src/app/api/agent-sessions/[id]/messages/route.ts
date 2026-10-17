import { startAgentMessage } from "@/server/five-agent-runtime";
import { agentEventStream } from "@/server/agent-stream";
import { apiError, getWorkspaceId } from "@/server/portfolio";
export const runtime="nodejs";
export const maxDuration=130;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const workspace=getWorkspaceId(request);const run=await startAgentMessage(workspace,(await context.params).id,await request.json());return agentEventStream(workspace,run.id,request.signal);}catch(e){return apiError(e);}}
