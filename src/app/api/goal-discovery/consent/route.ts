import { acknowledgeMultiGoalConsent } from "@/server/goal-discovery";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function POST(request: Request) {
  try {
    return Response.json(serialize(await acknowledgeMultiGoalConsent(getWorkspaceId(request))));
  } catch (error) {
    return apiError(error);
  }
}
