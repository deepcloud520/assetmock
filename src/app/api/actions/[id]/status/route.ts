import { z } from "zod";
import { transitionAction } from "@/server/execution-results";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

const statusSchema = z.object({ status: z.enum(["PROPOSED", "ACCEPTED", "DEFERRED", "USER_MARKED_COMPLETED", "DISMISSED"]), reason: z.string().trim().max(500).optional() });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { status, reason } = statusSchema.parse(await request.json());
    return Response.json(serialize(await transitionAction(getWorkspaceId(request), id, status, reason)));
  } catch (error) {
    return apiError(error);
  }
}
