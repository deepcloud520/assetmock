import { apiError, getWorkspaceId } from "@/server/portfolio";
import { listCarDecisions, saveCarDecision } from "@/server/car-planning";
export async function GET(request: Request) {
  try { return Response.json(await listCarDecisions(getWorkspaceId(request))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await saveCarDecision(getWorkspaceId(request), await request.json())); }
  catch (error) { return apiError(error); }
}
