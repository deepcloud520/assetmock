import { apiError, getWorkspaceId } from "@/server/portfolio";
import { guideCarDecision } from "@/server/car-planning";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json(await guideCarDecision(getWorkspaceId(request), id, await request.json())); }
  catch (error) { return apiError(error); }
}
