CREATE TABLE "FuturePlanningReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "sourceRevision" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "informationCompleteness" TEXT NOT NULL,
    "resultText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FuturePlanningReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuturePlanningReport_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FuturePlanningReport_workspaceId_createdAt_idx" ON "FuturePlanningReport"("workspaceId", "createdAt");
CREATE INDEX "FuturePlanningReport_goalId_createdAt_idx" ON "FuturePlanningReport"("goalId", "createdAt");
