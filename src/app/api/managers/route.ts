import { apiError, getWorkspaceId } from "@/server/portfolio";
import { getManagers, managerCommand } from "@/server/specialist-managers";
export async function GET(request: Request) {
  try { return Response.json(await getManagers(getWorkspaceId(request))); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await managerCommand(getWorkspaceId(request), await request.json())); } catch (error) { return apiError(error); }
}
