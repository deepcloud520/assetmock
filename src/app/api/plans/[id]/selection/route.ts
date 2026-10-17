import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, apiError, getWorkspaceId } from "@/server/portfolio";

const selectionSchema = z.object({ planKey: z.enum(["A", "B", "C"]) });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = getWorkspaceId(request);
    const { id } = await context.params;
    const { planKey } = selectionSchema.parse(await request.json());
    const [planSet, workspace] = await Promise.all([
      db.planSet.findFirst({ where: { id, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId } }),
    ]);
    if (!planSet || !workspace) throw new ApiError("方案不存在", 404);
    if (planSet.sourceRevision !== workspace.portfolioRevision) throw new ApiError("底账已经变化，请重新生成方案后再选择", 409);
    await db.planSet.update({ where: { id }, data: { selectedPlanKey: planKey } });
    return Response.json({ id, selectedPlanKey: planKey });
  } catch (error) {
    return apiError(error);
  }
}
