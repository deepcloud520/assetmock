import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";
import { getAgentResults } from "@/server/tasks";

export async function GET(request: Request) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId") || undefined;
    return Response.json(serialize(await getAgentResults(getWorkspaceId(request), goalId)));
  } catch (error) {
    return apiError(error);
  }
}
