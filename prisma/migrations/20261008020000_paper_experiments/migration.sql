-- CreateTable
CREATE TABLE "MarketSourceHealth" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "lastSuccessAt" DATETIME,
    "lastFailureAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaperOperationalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "detailJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperOperationalEvent_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountVersion" INTEGER NOT NULL,
    "issuesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperReconciliation_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperMarketDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "PaperMarketDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperBenchmarkPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'sh000300',
    "closeMinor" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaperStrategyExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "stopReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    CONSTRAINT "PaperStrategyExperiment_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperStrategyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "originalText" TEXT NOT NULL,
    "strategyJson" TEXT NOT NULL,
    "missingJson" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "PaperStrategyVersion_workspaceId_experimentId_fkey" FOREIGN KEY ("workspaceId", "experimentId") REFERENCES "PaperStrategyExperiment" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperStockPoolVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "instrumentIdsJson" TEXT NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperStockPoolVersion_workspaceId_experimentId_fkey" FOREIGN KEY ("workspaceId", "experimentId") REFERENCES "PaperStrategyExperiment" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperStrategyAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "stockPoolId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "limitsJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "PaperStrategyAuthorization_workspaceId_experimentId_fkey" FOREIGN KEY ("workspaceId", "experimentId") REFERENCES "PaperStrategyExperiment" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyAuthorization_workspaceId_strategyId_fkey" FOREIGN KEY ("workspaceId", "strategyId") REFERENCES "PaperStrategyVersion" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyAuthorization_workspaceId_stockPoolId_fkey" FOREIGN KEY ("workspaceId", "stockPoolId") REFERENCES "PaperStockPoolVersion" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperStrategyRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "stockPoolId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "experimentVersion" INTEGER NOT NULL,
    "accountVersion" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inputJson" TEXT NOT NULL,
    "decisionJson" TEXT NOT NULL DEFAULT '{}',
    "riskJson" TEXT NOT NULL DEFAULT '{}',
    "orderId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PaperStrategyRun_workspaceId_experimentId_fkey" FOREIGN KEY ("workspaceId", "experimentId") REFERENCES "PaperStrategyExperiment" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyRun_workspaceId_authorizationId_fkey" FOREIGN KEY ("workspaceId", "authorizationId") REFERENCES "PaperStrategyAuthorization" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyRun_workspaceId_strategyId_fkey" FOREIGN KEY ("workspaceId", "strategyId") REFERENCES "PaperStrategyVersion" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyRun_workspaceId_stockPoolId_fkey" FOREIGN KEY ("workspaceId", "stockPoolId") REFERENCES "PaperStockPoolVersion" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperStrategyRun_workspaceId_orderId_fkey" FOREIGN KEY ("workspaceId", "orderId") REFERENCES "PaperOrder" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperReplayDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFetchedAt" DATETIME NOT NULL,
    "hash" TEXT NOT NULL,
    "sourceReviewJson" TEXT NOT NULL,
    "calendarJson" TEXT NOT NULL,
    "fallbackReason" TEXT NOT NULL DEFAULT '',
    "modelVersion" TEXT NOT NULL DEFAULT 'kline-v1-participation-1pct',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperReplayDataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperReplayBar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "closeAt" DATETIME NOT NULL,
    "openMinor" BIGINT NOT NULL,
    "highMinor" BIGINT NOT NULL,
    "lowMinor" BIGINT NOT NULL,
    "closeMinor" BIGINT NOT NULL,
    "previousMinor" BIGINT NOT NULL,
    "lowerMinor" BIGINT NOT NULL,
    "upperMinor" BIGINT NOT NULL,
    "volumeShares" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "eventCoverage" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT NOT NULL,
    CONSTRAINT "PaperReplayBar_workspaceId_datasetId_fkey" FOREIGN KEY ("workspaceId", "datasetId") REFERENCES "PaperReplayDataset" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperReplayBar_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperReplaySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "clock" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAUSED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "warning" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperReplaySession_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperReplaySession_workspaceId_datasetId_fkey" FOREIGN KEY ("workspaceId", "datasetId") REFERENCES "PaperReplayDataset" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaperCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "triggerMinor" BIGINT NOT NULL,
    "limitMinor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "frozenMinor" BIGINT NOT NULL DEFAULT 0,
    "day" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "key" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "childOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredAt" DATETIME,
    "closedAt" DATETIME,
    CONSTRAINT "PaperCondition_workspaceId_accountId_fkey" FOREIGN KEY ("workspaceId", "accountId") REFERENCES "PaperAccount" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperCondition_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketInstrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaperCondition_workspaceId_childOrderId_fkey" FOREIGN KEY ("workspaceId", "childOrderId") REFERENCES "PaperOrder" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Additive account migration preserves ledger triggers and balances.
ALTER TABLE "PaperAccount" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "PaperAccount" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'LIVE';
ALTER TABLE "PaperAccount" ADD COLUMN "name" TEXT NOT NULL DEFAULT '手动模拟账户';
DROP INDEX IF EXISTS "PaperAccount_one_active";
CREATE UNIQUE INDEX "PaperAccount_one_manual_live" ON "PaperAccount"("workspaceId") WHERE status='ACTIVE' AND purpose='MANUAL' AND mode='LIVE';

-- CreateIndex
CREATE INDEX "PaperOperationalEvent_accountId_createdAt_idx" ON "PaperOperationalEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "PaperReconciliation_accountId_createdAt_idx" ON "PaperReconciliation"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperBenchmarkPoint_symbol_day_key" ON "PaperBenchmarkPoint"("symbol", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyExperiment_accountId_key" ON "PaperStrategyExperiment"("accountId");

-- CreateIndex
CREATE INDEX "PaperStrategyExperiment_workspaceId_status_idx" ON "PaperStrategyExperiment"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyExperiment_workspaceId_id_key" ON "PaperStrategyExperiment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyExperiment_workspaceId_accountId_key" ON "PaperStrategyExperiment"("workspaceId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyVersion_workspaceId_id_key" ON "PaperStrategyVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyVersion_experimentId_version_key" ON "PaperStrategyVersion"("experimentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStockPoolVersion_workspaceId_id_key" ON "PaperStockPoolVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStockPoolVersion_experimentId_version_key" ON "PaperStockPoolVersion"("experimentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyAuthorization_workspaceId_id_key" ON "PaperStrategyAuthorization"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyRun_orderId_key" ON "PaperStrategyRun"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyRun_experimentId_slot_key" ON "PaperStrategyRun"("experimentId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyRun_workspaceId_id_key" ON "PaperStrategyRun"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperStrategyRun_workspaceId_orderId_key" ON "PaperStrategyRun"("workspaceId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplayDataset_workspaceId_id_key" ON "PaperReplayDataset"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplayDataset_workspaceId_hash_key" ON "PaperReplayDataset"("workspaceId", "hash");

-- CreateIndex
CREATE INDEX "PaperReplayBar_datasetId_closeAt_idx" ON "PaperReplayBar"("datasetId", "closeAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplayBar_datasetId_instrumentId_closeAt_key" ON "PaperReplayBar"("datasetId", "instrumentId", "closeAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplaySession_accountId_key" ON "PaperReplaySession"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplaySession_workspaceId_id_key" ON "PaperReplaySession"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperReplaySession_workspaceId_accountId_key" ON "PaperReplaySession"("workspaceId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCondition_childOrderId_key" ON "PaperCondition"("childOrderId");

-- CreateIndex
CREATE INDEX "PaperCondition_accountId_status_idx" ON "PaperCondition"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCondition_workspaceId_id_key" ON "PaperCondition"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCondition_workspaceId_key_key" ON "PaperCondition"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PaperCondition_workspaceId_childOrderId_key" ON "PaperCondition"("workspaceId", "childOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_workspaceId_id_key" ON "PaperOrder"("workspaceId", "id");


CREATE UNIQUE INDEX PaperStrategyExperiment_one_running ON PaperStrategyExperiment(workspaceId) WHERE status='RUNNING';
CREATE TRIGGER PaperAccount_modes_insert BEFORE INSERT ON PaperAccount WHEN NEW.purpose NOT IN ('MANUAL','AI') OR NEW.mode NOT IN ('LIVE','REPLAY') BEGIN SELECT RAISE(ABORT,'invalid paper account mode'); END;
CREATE TRIGGER PaperAccount_modes_update BEFORE UPDATE ON PaperAccount WHEN NEW.purpose != OLD.purpose OR NEW.mode != OLD.mode OR NEW.initialMinor != OLD.initialMinor BEGIN SELECT RAISE(ABORT,'immutable account origin'); END;
CREATE TRIGGER PaperReplayDataset_immutable BEFORE UPDATE ON PaperReplayDataset BEGIN SELECT RAISE(ABORT,'immutable historical dataset'); END;
CREATE TRIGGER PaperReplayBar_immutable BEFORE UPDATE ON PaperReplayBar BEGIN SELECT RAISE(ABORT,'immutable historical bar'); END;
CREATE TRIGGER PaperStockPoolVersion_immutable BEFORE UPDATE ON PaperStockPoolVersion BEGIN SELECT RAISE(ABORT,'immutable stock pool'); END;
CREATE TRIGGER PaperStrategyAuthorization_links BEFORE INSERT ON PaperStrategyAuthorization WHEN (SELECT experimentId FROM PaperStrategyVersion WHERE id=NEW.strategyId) != NEW.experimentId OR (SELECT experimentId FROM PaperStockPoolVersion WHERE id=NEW.stockPoolId) != NEW.experimentId BEGIN SELECT RAISE(ABORT,'strategy authorization scope mismatch'); END;
CREATE TRIGGER PaperStrategyRun_links BEFORE INSERT ON PaperStrategyRun WHEN (SELECT experimentId FROM PaperStrategyAuthorization WHERE id=NEW.authorizationId) != NEW.experimentId OR (SELECT strategyId FROM PaperStrategyAuthorization WHERE id=NEW.authorizationId) != NEW.strategyId OR (SELECT stockPoolId FROM PaperStrategyAuthorization WHERE id=NEW.authorizationId) != NEW.stockPoolId BEGIN SELECT RAISE(ABORT,'strategy run scope mismatch'); END;
CREATE TRIGGER PaperStrategyRun_order BEFORE UPDATE ON PaperStrategyRun WHEN NEW.orderId IS NOT NULL AND (SELECT accountId FROM PaperOrder WHERE id=NEW.orderId) != (SELECT accountId FROM PaperStrategyExperiment WHERE id=NEW.experimentId) BEGIN SELECT RAISE(ABORT,'strategy order account mismatch'); END;
CREATE TRIGGER PaperCondition_order BEFORE UPDATE ON PaperCondition WHEN NEW.childOrderId IS NOT NULL AND (SELECT accountId FROM PaperOrder WHERE id=NEW.childOrderId) != NEW.accountId BEGIN SELECT RAISE(ABORT,'condition order account mismatch'); END;
CREATE TRIGGER PaperCondition_values BEFORE INSERT ON PaperCondition WHEN NEW.quantity<=0 OR NEW.triggerMinor<=0 OR NEW.limitMinor<=0 OR NEW.frozenMinor<0 OR NEW.kind NOT IN ('TAKE_PROFIT','STOP_LOSS') BEGIN SELECT RAISE(ABORT,'invalid condition'); END;
