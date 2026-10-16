CREATE TABLE "ScenarioResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "planSetId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Action" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "generationTaskId" TEXT NOT NULL,
    "planSetId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
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

CREATE INDEX "ScenarioResult_workspaceId_createdAt_idx" ON "ScenarioResult"("workspaceId", "createdAt");
CREATE INDEX "Action_workspaceId_generationTaskId_idx" ON "Action"("workspaceId", "generationTaskId");
CREATE INDEX "Action_workspaceId_createdAt_idx" ON "Action"("workspaceId", "createdAt");
