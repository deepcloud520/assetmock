PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Action" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "generationTaskId" TEXT NOT NULL,
    "planSetId" TEXT,
    "planKey" TEXT,
    "diagnosisId" TEXT,
    "detailsJson" TEXT,
    "sourceRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "priority" INTEGER NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "verificationType" TEXT NOT NULL,
    "productConditionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Action_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Action" ("id", "workspaceId", "generationTaskId", "planSetId", "planKey", "sourceRevision", "kind", "title", "reason", "amountMinor", "priority", "dueDate", "status", "verificationType", "productConditionsJson", "createdAt", "updatedAt") SELECT "id", "workspaceId", "generationTaskId", "planSetId", "planKey", "sourceRevision", "kind", "title", "reason", "amountMinor", "priority", "dueDate", "status", "verificationType", "productConditionsJson", "createdAt", "updatedAt" FROM "Action";
DROP TABLE "Action";
ALTER TABLE "new_Action" RENAME TO "Action";
CREATE INDEX "Action_workspaceId_generationTaskId_idx" ON "Action"("workspaceId", "generationTaskId");
CREATE INDEX "Action_workspaceId_createdAt_idx" ON "Action"("workspaceId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
