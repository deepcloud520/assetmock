import { confirmAgentProposal } from "@/server/agent-proposals";
import {apiError,getWorkspaceId} from "@/server/portfolio";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{return Response.json(await confirmAgentProposal(getWorkspaceId(request),(await context.params).id,await request.json()));}catch(e){return apiError(e);}}
