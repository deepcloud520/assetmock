import { apiError, getWorkspaceId } from "@/server/portfolio";
import { updatePlanningMemory } from "@/server/planning-memory";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json(await updatePlanningMemory(getWorkspaceId(request), id, await request.json())); } catch (e) { return apiError(e); }
}
