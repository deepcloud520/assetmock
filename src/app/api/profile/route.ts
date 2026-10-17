import { profileInputSchema } from "@/domain/portfolio";
import { db } from "@/lib/db";
import { apiError, assertWorkspace, getWorkspaceId, serialize } from "@/server/portfolio";

export async function PUT(request: Request) {
  try {
    const workspaceId = getWorkspaceId(request);
    await assertWorkspace(workspaceId);
    const data = profileInputSchema.parse(await request.json());
    const profile = await db.$transaction(async (tx) => {
      const item = await tx.profile.upsert({
        where: { workspaceId },
        update: { ...data, asOf: new Date() },
        create: { ...data, workspaceId },
      });
      const workspace = await tx.workspace.update({
        where: { id: workspaceId },
        data: { portfolioRevision: { increment: 1 } },
        select: { portfolioRevision: true },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          entityType: "PROFILE",
          entityId: item.id,
          action: "UPDATED",
          revision: workspace.portfolioRevision,
        },
      });
      return item;
    });
    return Response.json(serialize(profile));
  } catch (error) {
    return apiError(error);
  }
}
