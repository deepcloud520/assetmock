import { apiError, getWorkspaceId } from "@/server/portfolio";
import { explainManager } from "@/server/specialist-managers";
export async function POST(request: Request) {
  try { return Response.json(await explainManager(getWorkspaceId(request), await request.json())); } catch (error) { return apiError(error); }
}
