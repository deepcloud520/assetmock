import { initializeData } from "@/server/data-management";
import { dailyBackup } from "@/server/database-backup";
import { db } from "@/lib/db";
import { ledgerHeadersSchema } from "@/domain/ledger-headers";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    await initializeData(getWorkspaceId(request));
    await dailyBackup();
    const workspace = await db.workspace.findUnique({
      where: { id: getWorkspaceId(request) },
      include: {
        profile: true,
        assets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        liabilities: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        goals: { where: { deletedAt: null }, orderBy: [{ priority: "asc" }, { targetDate: "asc" }] },
      },
    });
    if (!workspace) return Response.json({ error: "工作区不存在" }, { status: 404 });
    return Response.json(serialize({ ...workspace, ledgerHeaders: ledgerHeadersSchema.parse(JSON.parse(workspace.ledgerHeadersJson)) }));
  } catch (error) {
    return apiError(error);
  }
}
