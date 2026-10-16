import { db } from "@/lib/db";
import { ApiError, apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = getWorkspaceId(request);
    const { id } = await context.params;
    const task = await db.agentTask.findFirst({ where: { id, workspaceId } });
    if (!task) throw new ApiError("任务不存在", 404);
    return Response.json(serialize(task));
  } catch (error) {
    return apiError(error);
  }
}
