import { getWealthCalculation } from "@/server/calculation";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    return Response.json(await getWealthCalculation(getWorkspaceId(request)));
  } catch (error) {
    return apiError(error);
  }
}
