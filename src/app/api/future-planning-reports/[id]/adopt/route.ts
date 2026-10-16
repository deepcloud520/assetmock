import { adoptFuturePlanningReport } from "@/server/future-planning";
import { apiError, getWorkspaceId } from "@/server/portfolio";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { expectedRevision?: unknown };
    return Response.json(await adoptFuturePlanningReport(getWorkspaceId(request), id, body.expectedRevision));
  } catch (error) {
    return apiError(error);
  }
}
