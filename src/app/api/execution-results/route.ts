import { getExecutionResults } from "@/server/execution-results";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    return Response.json(await getExecutionResults(getWorkspaceId(request)));
  } catch (error) {
    return apiError(error);
  }
}
