import { rejectAgentProposal } from "@/server/agent-proposals";
import {apiError,getWorkspaceId} from "@/server/portfolio";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{return Response.json(await rejectAgentProposal(getWorkspaceId(request),(await context.params).id));}catch(e){return apiError(e);}}
