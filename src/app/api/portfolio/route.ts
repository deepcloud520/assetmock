import { initializeData } from "@/server/data-management";
import { dailyBackup } from "@/server/database-backup";
import { db } from "@/lib/db";
import { ledgerHeadersSchema } from "@/domain/ledger-headers";
import { apiError, getWorkspaceId, serialize } from "@/server/portfolio";

export async function GET(request: Request) {
  try {
    await initializeData(getWorkspaceId(request));
    let backupWarning: string | null = null;
    try { await dailyBackup(); }
    catch (error) {
      console.error("Daily backup failed", error instanceof Error ? error.message : "unknown");
      backupWarning = "自动备份未完成，底账仍可读取。请检查启动终端的错误并重试备份。";
    }
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
    return Response.json(serialize({ ...workspace, backupWarning, ledgerHeaders: ledgerHeadersSchema.parse(JSON.parse(workspace.ledgerHeadersJson)) }));
  } catch (error) {
    return apiError(error);
  }
}
