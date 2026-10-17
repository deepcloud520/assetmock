import { getGoalDiscoverySession, startGoalDiscovery } from "@/server/goal-discovery";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    return Response.json(serialize(await getGoalDiscoverySession(getWorkspaceId(request))));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { content?: unknown };
    return Response.json(serialize(await startGoalDiscovery(getWorkspaceId(request), body.content)), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
