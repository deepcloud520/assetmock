ALTER TABLE "CarDecision" ADD COLUMN "resumeKey" TEXT;
ALTER TABLE "CarDecision" ADD COLUMN "goalSessionId" TEXT;
ALTER TABLE "CarDecision" ADD COLUMN "viewStage" TEXT NOT NULL DEFAULT 'facts';
ALTER TABLE "CarDecision" ADD COLUMN "dependenciesJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "CarDecision" ADD COLUMN "fieldEvidenceJson" TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "CarDecision_resumeKey_key" ON "CarDecision"("resumeKey");
CREATE UNIQUE INDEX "CarDecision_goalSessionId_key" ON "CarDecision"("goalSessionId");
CREATE TABLE "PlanningMemory" (
 "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "decisionId" TEXT,
 "content" TEXT NOT NULL, "evidenceType" TEXT NOT NULL, "sourceRef" TEXT NOT NULL, "quote" TEXT NOT NULL,
 "scope" TEXT NOT NULL DEFAULT 'DECISION', "nature" TEXT NOT NULL DEFAULT 'SOFT', "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "ruleJson" TEXT NOT NULL DEFAULT '{}', "dependencyJson" TEXT NOT NULL DEFAULT '{}', "reviewWhen" TEXT NOT NULL,
 "model" TEXT, "promptVersion" TEXT, "version" INTEGER NOT NULL DEFAULT 1, "supersedesId" TEXT, "confirmedAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "PlanningMemory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlanningMemory_workspaceId_decisionId_status_idx" ON "PlanningMemory"("workspaceId", "decisionId", "status");
