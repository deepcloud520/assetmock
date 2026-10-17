-- AlterTable
ALTER TABLE "AgentStep" ADD COLUMN "runId" TEXT;

-- CreateTable
CREATE TABLE "GoalDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "legacyDecisionId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "factsJson" TEXT NOT NULL DEFAULT '{}',
    "activePlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoalDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalEvaluationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionVersion" INTEGER NOT NULL,
    "sourceSignature" TEXT NOT NULL,
    "calculatedOn" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalEvaluationRecord_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "GoalDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalPlanVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "legacyPlanId" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "snapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalPlanVersion_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "GoalDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalFundingReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalFundingReservation_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "GoalDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "factsJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalReview_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "GoalDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "parentRunId" TEXT,
    "agentKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'USER_DIALOGUE',
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sourceSignature" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "leaseUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "AgentRun_workspaceId_sessionId_fkey" FOREIGN KEY ("workspaceId", "sessionId") REFERENCES "AgentSession" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceSignature" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "AgentProposal_workspaceId_runId_fkey" FOREIGN KEY ("workspaceId", "runId") REFERENCES "AgentRun" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'WEALTH_TASK',
    "agentKey" TEXT,
    "decisionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "goalDraftJson" TEXT NOT NULL DEFAULT '{}',
    "goalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentSession_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentSession" ("createdAt", "goalDraftJson", "goalId", "id", "kind", "objective", "sourceRevision", "status", "title", "updatedAt", "workspaceId") SELECT "createdAt", "goalDraftJson", "goalId", "id", "kind", "objective", "sourceRevision", "status", "title", "updatedAt", "workspaceId" FROM "AgentSession";
DROP TABLE "AgentSession";
ALTER TABLE "new_AgentSession" RENAME TO "AgentSession";
CREATE INDEX "AgentSession_workspaceId_updatedAt_idx" ON "AgentSession"("workspaceId", "updatedAt");
CREATE UNIQUE INDEX "AgentSession_workspaceId_id_key" ON "AgentSession"("workspaceId", "id");
CREATE TABLE "new_AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "runId" TEXT,
    "displayJson" TEXT NOT NULL DEFAULT '{}',
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AgentMessage" ("content", "createdAt", "id", "role", "sessionId", "sourceRevision") SELECT "content", "createdAt", "id", "role", "sessionId", "sourceRevision" FROM "AgentMessage";
DROP TABLE "AgentMessage";
ALTER TABLE "new_AgentMessage" RENAME TO "AgentMessage";
CREATE INDEX "AgentMessage_sessionId_createdAt_idx" ON "AgentMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX "AgentMessage_sessionId_clientMessageId_key" ON "AgentMessage"("sessionId", "clientMessageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GoalDecision_legacyDecisionId_key" ON "GoalDecision"("legacyDecisionId");

-- CreateIndex
CREATE INDEX "GoalDecision_workspaceId_updatedAt_idx" ON "GoalDecision"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoalDecision_workspaceId_id_key" ON "GoalDecision"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "GoalEvaluationRecord_workspaceId_decisionId_idx" ON "GoalEvaluationRecord"("workspaceId", "decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalEvaluationRecord_workspaceId_id_key" ON "GoalEvaluationRecord"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GoalPlanVersion_legacyPlanId_key" ON "GoalPlanVersion"("legacyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalPlanVersion_decisionId_version_key" ON "GoalPlanVersion"("decisionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GoalPlanVersion_workspaceId_id_key" ON "GoalPlanVersion"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "GoalFundingReservation_workspaceId_assetId_idx" ON "GoalFundingReservation"("workspaceId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalFundingReservation_decisionId_assetId_key" ON "GoalFundingReservation"("decisionId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalReview_decisionId_period_key" ON "GoalReview"("decisionId", "period");

-- CreateIndex
CREATE INDEX "AgentRun_workspaceId_status_idx" ON "AgentRun"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_sessionId_requestId_key" ON "AgentRun"("sessionId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_workspaceId_id_key" ON "AgentRun"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "AgentProposal_workspaceId_status_idx" ON "AgentProposal"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProposal_workspaceId_id_key" ON "AgentProposal"("workspaceId", "id");


CREATE TRIGGER "five_AgentSession_goalId_INSERT" BEFORE INSERT ON "AgentSession"
WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_AgentSession_decisionId_INSERT" BEFORE INSERT ON "AgentSession"
WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "GoalDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_AgentSession_goalId_UPDATE" BEFORE UPDATE ON "AgentSession"
WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_AgentSession_decisionId_UPDATE" BEFORE UPDATE ON "AgentSession"
WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "GoalDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalDecision_goalId_INSERT" BEFORE INSERT ON "GoalDecision"
WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalDecision_legacyDecisionId_INSERT" BEFORE INSERT ON "GoalDecision"
WHEN NEW."legacyDecisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."legacyDecisionId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalDecision_goalId_UPDATE" BEFORE UPDATE ON "GoalDecision"
WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalDecision_legacyDecisionId_UPDATE" BEFORE UPDATE ON "GoalDecision"
WHEN NEW."legacyDecisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."legacyDecisionId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalFundingReservation_assetId_INSERT" BEFORE INSERT ON "GoalFundingReservation"
WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalFundingReservation_assetId_UPDATE" BEFORE UPDATE ON "GoalFundingReservation"
WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalPlanVersion_evaluationId_INSERT" BEFORE INSERT ON "GoalPlanVersion"
WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "GoalEvaluationRecord" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_GoalPlanVersion_evaluationId_UPDATE" BEFORE UPDATE ON "GoalPlanVersion"
WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "GoalEvaluationRecord" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_AgentRun_parentRunId_INSERT" BEFORE INSERT ON "AgentRun"
WHEN NEW."parentRunId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."parentRunId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_AgentRun_parentRunId_UPDATE" BEFORE UPDATE ON "AgentRun"
WHEN NEW."parentRunId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."parentRunId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT, 'Cross-workspace agent reference'); END;

CREATE TRIGGER "five_step_run_INSERT" BEFORE INSERT ON "AgentStep"
WHEN NEW."runId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."runId" AND "sessionId"=NEW."sessionId")
BEGIN SELECT RAISE(ABORT, 'Invalid agent step run'); END;

CREATE TRIGGER "five_message_run_INSERT" BEFORE INSERT ON "AgentMessage"
WHEN NEW."runId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."runId" AND "sessionId"=NEW."sessionId")
BEGIN SELECT RAISE(ABORT, 'Invalid agent message run'); END;

CREATE TRIGGER "five_reservation_amount_INSERT" BEFORE INSERT ON "GoalFundingReservation"
WHEN NEW."amountMinor" < 0
BEGIN SELECT RAISE(ABORT, 'Invalid reservation amount'); END;

CREATE TRIGGER "five_step_run_UPDATE" BEFORE UPDATE ON "AgentStep"
WHEN NEW."runId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."runId" AND "sessionId"=NEW."sessionId")
BEGIN SELECT RAISE(ABORT, 'Invalid agent step run'); END;

CREATE TRIGGER "five_message_run_UPDATE" BEFORE UPDATE ON "AgentMessage"
WHEN NEW."runId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "AgentRun" WHERE "id"=NEW."runId" AND "sessionId"=NEW."sessionId")
BEGIN SELECT RAISE(ABORT, 'Invalid agent message run'); END;

CREATE TRIGGER "five_reservation_amount_UPDATE" BEFORE UPDATE ON "GoalFundingReservation"
WHEN NEW."amountMinor" < 0
BEGIN SELECT RAISE(ABORT, 'Invalid reservation amount'); END;
