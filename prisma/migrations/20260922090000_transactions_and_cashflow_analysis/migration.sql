ALTER TABLE "Workspace" ADD COLUMN "transactionRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "occurredOn" DATETIME NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "specialKind" TEXT NOT NULL DEFAULT 'NONE',
  "analysisTreatment" TEXT NOT NULL DEFAULT 'COUNT',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "classificationSource" TEXT NOT NULL DEFAULT 'FALLBACK',
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Transaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CashflowAnalysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "periodKind" TEXT NOT NULL,
  "periodStart" DATETIME NOT NULL,
  "periodEnd" DATETIME NOT NULL,
  "transactionRevision" INTEGER NOT NULL,
  "statisticsJson" TEXT NOT NULL,
  "agentReportJson" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashflowAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Transaction_workspaceId_occurredOn_deletedAt_idx" ON "Transaction"("workspaceId", "occurredOn", "deletedAt");
CREATE INDEX "Transaction_workspaceId_direction_category_idx" ON "Transaction"("workspaceId", "direction", "category");
CREATE INDEX "CashflowAnalysis_workspaceId_createdAt_idx" ON "CashflowAnalysis"("workspaceId", "createdAt");
CREATE INDEX "CashflowAnalysis_workspaceId_periodStart_periodEnd_idx" ON "CashflowAnalysis"("workspaceId", "periodStart", "periodEnd");
