import { apiError, getWorkspaceId } from "@/server/portfolio";
import { listPlanningMemories } from "@/server/planning-memory";
export async function GET(request: Request) {
  try { return Response.json(await listPlanningMemories(getWorkspaceId(request))); } catch (e) { return apiError(e); }
}
