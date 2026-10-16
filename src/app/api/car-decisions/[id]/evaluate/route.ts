import { apiError, getWorkspaceId } from "@/server/portfolio";
import { evaluateCarDecision } from "@/server/car-planning";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(await evaluateCarDecision(getWorkspaceId(request), id, (await request.json()).expectedVersion));
  } catch (error) { return apiError(error); }
}
