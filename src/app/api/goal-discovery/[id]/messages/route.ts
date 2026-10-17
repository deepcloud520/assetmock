import { continueGoalDiscovery } from "@/server/goal-discovery";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { content?: unknown };
    return Response.json(serialize(await continueGoalDiscovery(getWorkspaceId(request), id, body.content)));
  } catch (error) {
    return apiError(error);
  }
}
