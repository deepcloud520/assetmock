import { resumeAgentRun } from "@/server/five-agent-runtime";
import { agentEventStream } from "@/server/agent-stream";
import { apiError,getWorkspaceId } from "@/server/portfolio";
export const runtime="nodejs";
export const maxDuration=130;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{const workspace=getWorkspaceId(request),id=(await context.params).id;await resumeAgentRun(workspace,id);return agentEventStream(workspace,id,request.signal);}catch(e){return apiError(e);}}
