import { apiError, getWorkspaceId } from "@/server/portfolio";
import { resumeCarDecision } from "@/server/car-decision-state";
export async function POST(request: Request) {
  try { return Response.json(await resumeCarDecision(getWorkspaceId(request), await request.json())); } catch (e) { return apiError(e); }
}
