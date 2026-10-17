import { executeTask, taskTypeSchema } from "@/server/tasks";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function POST(request: Request) {
  try {
    const { type, goalId } = zodBody(await request.json());
    return Response.json(serialize(await executeTask(getWorkspaceId(request), type, goalId ?? undefined)), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function zodBody(body: unknown) {
  const value = body as { type?: unknown; goalId?: unknown };
  return taskTypeSchema.transform((type) => ({ type, goalId: typeof value.goalId === "string" && value.goalId ? value.goalId : null })).parse(value.type);
}
