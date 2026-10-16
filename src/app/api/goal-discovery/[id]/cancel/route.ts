import { cancelGoalDiscovery } from "@/server/goal-discovery";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json(serialize(await cancelGoalDiscovery(getWorkspaceId(request), id)));
  } catch (error) {
    return apiError(error);
  }
}
