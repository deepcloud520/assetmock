-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "priorityConfirmedAt" DATETIME;
ALTER TABLE "Goal" ADD COLUMN "priorityNote" TEXT;

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "validTo" TEXT,
    "revision" INTEGER NOT NULL,
    "incomeMinor" BIGINT NOT NULL,
    "livingMinor" BIGINT NOT NULL,
    "debtIncluded" BOOLEAN NOT NULL,
    "premiumsIncluded" BOOLEAN NOT NULL,
    "dataJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "allocation" TEXT NOT NULL,
    "dueDay" INTEGER,
    "dueOn" TEXT,
    "includedInLiving" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "InsuranceNeed" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "insured" TEXT NOT NULL DEFAULT '本人',
    "category" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InvestmentNeed" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT,
    "decisionId" TEXT,
    "category" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BalanceObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "observedOn" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "reviewId" TEXT,
    "observationKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RecordRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BusinessDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceSignature" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CarEvaluationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionVersion" INTEGER NOT NULL,
    "sourceSignature" TEXT NOT NULL,
    "calculatedOn" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DecisionReason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "userText" TEXT,
    "assetId" TEXT,
    "sourceId" TEXT,
    "evidenceSource" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DecisionConstraint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'DECISION',
    "recordKind" TEXT NOT NULL DEFAULT 'CURRENT',
    "planVersionId" TEXT,
    "type" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "thresholdValue" BIGINT,
    "unit" TEXT,
    "currency" TEXT,
    "assetId" TEXT,
    "goalId" TEXT,
    "userText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "checkScope" TEXT NOT NULL DEFAULT 'BOTH',
    "confirmedAt" DATETIME,
    "sourceId" TEXT,
    "memoryId" TEXT,
    "supersededById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlanAssumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "expectedValue" BIGINT,
    "currency" TEXT,
    "dueOn" TEXT,
    "referenceId" TEXT,
    "sourceId" TEXT,
    "sourceJson" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssumptionVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "assumptionId" TEXT NOT NULL,
    "reviewId" TEXT,
    "period" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "actualValue" BIGINT,
    "evidence" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" DATETIME,
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RedLineCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "constraintId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "professionalEvaluationId" TEXT,
    "candidateKey" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT 'redline-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dataJson" TEXT NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "riskLevel" INTEGER,
    "termMonths" INTEGER,
    "redemptionDays" INTEGER,
    "minimumMinor" BIGINT,
    "reviewedOn" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ProductSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productVersionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicationText" TEXT NOT NULL,
    "reviewedOn" TEXT NOT NULL,
    "note" TEXT,
    "contentHash" TEXT
);

-- CreateTable
CREATE TABLE "ProductSelectionVersion" (
    "selectionId" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SourceEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "extractedAt" DATETIME,
    "reviewedAt" DATETIME,
    "note" TEXT,
    "pageHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rowIdsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER
);

-- CreateTable
CREATE TABLE "DeletionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "phase" TEXT NOT NULL DEFAULT 'DATABASE',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "MigrationIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HoldingDetail" (
    "productVersionId" TEXT,
    "availableOn" TEXT,
    "feeMinor" BIGINT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dataJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HoldingDetail_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HoldingDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HoldingDetail" ("assetId", "dataJson", "id", "updatedAt", "version", "workspaceId") SELECT "assetId", "dataJson", "id", "updatedAt", "version", "workspaceId" FROM "HoldingDetail";
DROP TABLE "HoldingDetail";
ALTER TABLE "new_HoldingDetail" RENAME TO "HoldingDetail";
CREATE UNIQUE INDEX "HoldingDetail_assetId_key" ON "HoldingDetail"("assetId");
CREATE INDEX "HoldingDetail_workspaceId_idx" ON "HoldingDetail"("workspaceId");
CREATE TABLE "new_InsurancePolicy" (
    "insured" TEXT,
    "category" TEXT,
    "coverageMinor" BIGINT,
    "premiumMinor" BIGINT,
    "paymentMonths" INTEGER,
    "startsOn" TEXT,
    "endsOn" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "cashValueAssetId" TEXT,
    "productVersionId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dataJson" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsurancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InsurancePolicy" ("createdAt", "dataJson", "deletedAt", "id", "updatedAt", "version", "workspaceId") SELECT "createdAt", "dataJson", "deletedAt", "id", "updatedAt", "version", "workspaceId" FROM "InsurancePolicy";
DROP TABLE "InsurancePolicy";
ALTER TABLE "new_InsurancePolicy" RENAME TO "InsurancePolicy";
CREATE INDEX "InsurancePolicy_workspaceId_deletedAt_idx" ON "InsurancePolicy"("workspaceId", "deletedAt");
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "professionalRevision" INTEGER NOT NULL DEFAULT 0,
    "businessMigratedAt" DATETIME,
    "dataEpoch" INTEGER NOT NULL DEFAULT 0,
    "portfolioRevision" INTEGER NOT NULL DEFAULT 0,
    "transactionRevision" INTEGER NOT NULL DEFAULT 0,
    "ledgerConfirmedAt" DATETIME,
    "ledgerHeadersJson" TEXT NOT NULL DEFAULT '{}',
    "promptOverridesJson" TEXT NOT NULL DEFAULT '{}',
    "multiGoalConsentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Workspace" ("createdAt", "id", "ledgerConfirmedAt", "ledgerHeadersJson", "multiGoalConsentAt", "portfolioRevision", "promptOverridesJson", "transactionRevision", "updatedAt") SELECT "createdAt", "id", "ledgerConfirmedAt", "ledgerHeadersJson", "multiGoalConsentAt", "portfolioRevision", "promptOverridesJson", "transactionRevision", "updatedAt" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BudgetVersion_workspaceId_validFrom_validTo_idx" ON "BudgetVersion"("workspaceId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_workspaceId_revision_key" ON "BudgetVersion"("workspaceId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_budgetVersionId_sourceRef_key" ON "BudgetItem"("budgetVersionId", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceObservation_observationKey_key" ON "BalanceObservation"("observationKey");

-- CreateIndex
CREATE INDEX "BalanceObservation_workspaceId_entityType_entityId_observedOn_idx" ON "BalanceObservation"("workspaceId", "entityType", "entityId", "observedOn");

-- CreateIndex
CREATE INDEX "RecordRevision_workspaceId_entityType_entityId_idx" ON "RecordRevision"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDraft_workspaceId_kind_entityId_key" ON "BusinessDraft"("workspaceId", "kind", "entityId");

-- CreateIndex
CREATE INDEX "CarEvaluationRecord_workspaceId_decisionId_createdAt_idx" ON "CarEvaluationRecord"("workspaceId", "decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionReason_workspaceId_planVersionId_idx" ON "DecisionReason"("workspaceId", "planVersionId");

-- CreateIndex
CREATE INDEX "DecisionConstraint_workspaceId_recordKind_scope_decisionId_status_idx" ON "DecisionConstraint"("workspaceId", "recordKind", "scope", "decisionId", "status");

-- CreateIndex
CREATE INDEX "PlanAssumption_workspaceId_planVersionId_lifecycle_idx" ON "PlanAssumption"("workspaceId", "planVersionId", "lifecycle");

-- CreateIndex
CREATE INDEX "AssumptionVerification_workspaceId_status_period_idx" ON "AssumptionVerification"("workspaceId", "status", "period");

-- CreateIndex
CREATE UNIQUE INDEX "AssumptionVerification_assumptionId_period_key" ON "AssumptionVerification"("assumptionId", "period");

-- CreateIndex
CREATE INDEX "RedLineCheck_workspaceId_createdAt_idx" ON "RedLineCheck"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedLineCheck_evaluationId_candidateKey_constraintId_key" ON "RedLineCheck"("evaluationId", "candidateKey", "constraintId");

-- CreateIndex
CREATE UNIQUE INDEX "RedLineCheck_professionalEvaluationId_candidateKey_constraintId_key" ON "RedLineCheck"("professionalEvaluationId", "candidateKey", "constraintId");

-- CreateIndex
CREATE INDEX "ProductVersion_productId_status_createdAt_idx" ON "ProductVersion"("productId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVersion_productId_version_key" ON "ProductVersion"("productId", "version");

-- CreateIndex
CREATE INDEX "SourceEvidence_workspaceId_entityType_entityId_idx" ON "SourceEvidence"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_workspaceId_requestKey_key" ON "ImportBatch"("workspaceId", "requestKey");

-- CreateIndex
CREATE INDEX "DataDependency_workspaceId_sourceType_sourceId_idx" ON "DataDependency"("workspaceId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DataDependency_workspaceId_ownerType_ownerId_sourceType_sourceId_key" ON "DataDependency"("workspaceId", "ownerType", "ownerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "DeletionJob_workspaceId_status_idx" ON "DeletionJob"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationIssue_workspaceId_entityType_entityId_code_key" ON "MigrationIssue"("workspaceId", "entityType", "entityId", "code");


CREATE TRIGGER "BudgetVersion_workspace_INSERT" BEFORE INSERT ON "BudgetVersion" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "BudgetVersion_workspace_UPDATE" BEFORE UPDATE ON "BudgetVersion" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "BudgetVersion_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "BudgetVersion" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "BudgetItem_workspace_INSERT" BEFORE INSERT ON "BudgetItem" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "BudgetItem_workspace_UPDATE" BEFORE UPDATE ON "BudgetItem" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "BudgetItem_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "BudgetItem" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "InsuranceNeed_workspace_INSERT" BEFORE INSERT ON "InsuranceNeed" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "InsuranceNeed_workspace_UPDATE" BEFORE UPDATE ON "InsuranceNeed" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "InsuranceNeed_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "InsuranceNeed" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "InvestmentNeed_workspace_INSERT" BEFORE INSERT ON "InvestmentNeed" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "InvestmentNeed_workspace_UPDATE" BEFORE UPDATE ON "InvestmentNeed" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "InvestmentNeed_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "InvestmentNeed" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "BalanceObservation_workspace_INSERT" BEFORE INSERT ON "BalanceObservation" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "BalanceObservation_workspace_UPDATE" BEFORE UPDATE ON "BalanceObservation" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "BalanceObservation_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "BalanceObservation" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "RecordRevision_workspace_INSERT" BEFORE INSERT ON "RecordRevision" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "RecordRevision_workspace_UPDATE" BEFORE UPDATE ON "RecordRevision" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "RecordRevision_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "RecordRevision" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "BusinessDraft_workspace_INSERT" BEFORE INSERT ON "BusinessDraft" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "BusinessDraft_workspace_UPDATE" BEFORE UPDATE ON "BusinessDraft" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "BusinessDraft_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "BusinessDraft" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "CarEvaluationRecord_workspace_INSERT" BEFORE INSERT ON "CarEvaluationRecord" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "CarEvaluationRecord_workspace_UPDATE" BEFORE UPDATE ON "CarEvaluationRecord" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "CarEvaluationRecord_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "CarEvaluationRecord" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "DecisionReason_workspace_INSERT" BEFORE INSERT ON "DecisionReason" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "DecisionReason_workspace_UPDATE" BEFORE UPDATE ON "DecisionReason" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "DecisionReason_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "DecisionReason" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "DecisionConstraint_workspace_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "DecisionConstraint_workspace_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "DecisionConstraint_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "DecisionConstraint" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "PlanAssumption_workspace_INSERT" BEFORE INSERT ON "PlanAssumption" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "PlanAssumption_workspace_UPDATE" BEFORE UPDATE ON "PlanAssumption" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "PlanAssumption_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "PlanAssumption" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "AssumptionVerification_workspace_INSERT" BEFORE INSERT ON "AssumptionVerification" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "AssumptionVerification_workspace_UPDATE" BEFORE UPDATE ON "AssumptionVerification" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "AssumptionVerification_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "AssumptionVerification" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "RedLineCheck_workspace_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "RedLineCheck_workspace_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "RedLineCheck_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "RedLineCheck" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "ProductSelectionVersion_workspace_INSERT" BEFORE INSERT ON "ProductSelectionVersion" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "ProductSelectionVersion_workspace_UPDATE" BEFORE UPDATE ON "ProductSelectionVersion" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "ProductSelectionVersion_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "ProductSelectionVersion" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "SourceEvidence_workspace_INSERT" BEFORE INSERT ON "SourceEvidence" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "SourceEvidence_workspace_UPDATE" BEFORE UPDATE ON "SourceEvidence" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "SourceEvidence_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "SourceEvidence" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "ImportBatch_workspace_INSERT" BEFORE INSERT ON "ImportBatch" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "ImportBatch_workspace_UPDATE" BEFORE UPDATE ON "ImportBatch" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "ImportBatch_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "ImportBatch" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "DataDependency_workspace_INSERT" BEFORE INSERT ON "DataDependency" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "DataDependency_workspace_UPDATE" BEFORE UPDATE ON "DataDependency" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "DataDependency_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "DataDependency" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "DeletionJob_workspace_INSERT" BEFORE INSERT ON "DeletionJob" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "DeletionJob_workspace_UPDATE" BEFORE UPDATE ON "DeletionJob" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "DeletionJob_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "DeletionJob" WHERE workspaceId=OLD.id; END;

CREATE TRIGGER "MigrationIssue_workspace_INSERT" BEFORE INSERT ON "MigrationIssue" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;

CREATE TRIGGER "MigrationIssue_workspace_UPDATE" BEFORE UPDATE ON "MigrationIssue" WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'workspace ownership mismatch'); END;
CREATE TRIGGER "MigrationIssue_workspace_delete" AFTER DELETE ON "Workspace" BEGIN DELETE FROM "MigrationIssue" WHERE workspaceId=OLD.id; END;
CREATE TRIGGER "CarFundingReservation_assetId_INSERT" BEFORE INSERT ON "CarFundingReservation" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "CarFundingReservation_assetId_UPDATE" BEFORE UPDATE ON "CarFundingReservation" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "CarFundingReservation_decisionId_INSERT" BEFORE INSERT ON "CarFundingReservation" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "CarFundingReservation_decisionId_UPDATE" BEFORE UPDATE ON "CarFundingReservation" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ManagerReminder_actionId_INSERT" BEFORE INSERT ON "ManagerReminder" WHEN NEW."actionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Action" WHERE "id"=NEW."actionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ManagerReminder_actionId_UPDATE" BEFORE UPDATE ON "ManagerReminder" WHEN NEW."actionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Action" WHERE "id"=NEW."actionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ProductSelection_evaluationId_INSERT" BEFORE INSERT ON "ProductSelection" WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProfessionalEvaluation" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ProductSelection_evaluationId_UPDATE" BEFORE UPDATE ON "ProductSelection" WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProfessionalEvaluation" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "HoldingDetail_assetId_INSERT" BEFORE INSERT ON "HoldingDetail" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "HoldingDetail_assetId_UPDATE" BEFORE UPDATE ON "HoldingDetail" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "Asset_goalId_INSERT" BEFORE INSERT ON "Asset" WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "Asset_goalId_UPDATE" BEFORE UPDATE ON "Asset" WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InsurancePolicy_cashValueAssetId_INSERT" BEFORE INSERT ON "InsurancePolicy" WHEN NEW."cashValueAssetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."cashValueAssetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InsurancePolicy_cashValueAssetId_UPDATE" BEFORE UPDATE ON "InsurancePolicy" WHEN NEW."cashValueAssetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."cashValueAssetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InvestmentNeed_assetId_INSERT" BEFORE INSERT ON "InvestmentNeed" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InvestmentNeed_assetId_UPDATE" BEFORE UPDATE ON "InvestmentNeed" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InvestmentNeed_decisionId_INSERT" BEFORE INSERT ON "InvestmentNeed" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "InvestmentNeed_decisionId_UPDATE" BEFORE UPDATE ON "InvestmentNeed" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "BudgetItem_budgetVersionId_INSERT" BEFORE INSERT ON "BudgetItem" WHEN NEW."budgetVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "BudgetVersion" WHERE "id"=NEW."budgetVersionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "BudgetItem_budgetVersionId_UPDATE" BEFORE UPDATE ON "BudgetItem" WHEN NEW."budgetVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "BudgetVersion" WHERE "id"=NEW."budgetVersionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "CarEvaluationRecord_decisionId_INSERT" BEFORE INSERT ON "CarEvaluationRecord" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "CarEvaluationRecord_decisionId_UPDATE" BEFORE UPDATE ON "CarEvaluationRecord" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_decisionId_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_decisionId_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NEW."decisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarDecision" WHERE "id"=NEW."decisionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_assetId_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_assetId_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_goalId_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_goalId_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NEW."goalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Goal" WHERE "id"=NEW."goalId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_sourceId_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionConstraint" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionConstraint_sourceId_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionConstraint" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionReason_assetId_INSERT" BEFORE INSERT ON "DecisionReason" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionReason_assetId_UPDATE" BEFORE UPDATE ON "DecisionReason" WHEN NEW."assetId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Asset" WHERE "id"=NEW."assetId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionReason_sourceId_INSERT" BEFORE INSERT ON "DecisionReason" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionReason" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionReason_sourceId_UPDATE" BEFORE UPDATE ON "DecisionReason" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionReason" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "PlanAssumption_sourceId_INSERT" BEFORE INSERT ON "PlanAssumption" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PlanAssumption" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "PlanAssumption_sourceId_UPDATE" BEFORE UPDATE ON "PlanAssumption" WHEN NEW."sourceId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PlanAssumption" WHERE "id"=NEW."sourceId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "AssumptionVerification_assumptionId_INSERT" BEFORE INSERT ON "AssumptionVerification" WHEN NEW."assumptionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PlanAssumption" WHERE "id"=NEW."assumptionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "AssumptionVerification_assumptionId_UPDATE" BEFORE UPDATE ON "AssumptionVerification" WHEN NEW."assumptionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PlanAssumption" WHERE "id"=NEW."assumptionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_constraintId_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN NEW."constraintId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionConstraint" WHERE "id"=NEW."constraintId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_constraintId_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN NEW."constraintId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "DecisionConstraint" WHERE "id"=NEW."constraintId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_evaluationId_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarEvaluationRecord" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_evaluationId_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN NEW."evaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarEvaluationRecord" WHERE "id"=NEW."evaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_professionalEvaluationId_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN NEW."professionalEvaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProfessionalEvaluation" WHERE "id"=NEW."professionalEvaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "RedLineCheck_professionalEvaluationId_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN NEW."professionalEvaluationId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProfessionalEvaluation" WHERE "id"=NEW."professionalEvaluationId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ProductSelectionVersion_selectionId_INSERT" BEFORE INSERT ON "ProductSelectionVersion" WHEN NEW."selectionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductSelection" WHERE "id"=NEW."selectionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "ProductSelectionVersion_selectionId_UPDATE" BEFORE UPDATE ON "ProductSelectionVersion" WHEN NEW."selectionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductSelection" WHERE "id"=NEW."selectionId" AND "workspaceId"=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace reference'); END;
CREATE TRIGGER "DecisionReason_planVersionId_INSERT" BEFORE INSERT ON "DecisionReason" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "DecisionReason_planVersionId_UPDATE" BEFORE UPDATE ON "DecisionReason" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "DecisionConstraint_planVersionId_INSERT" BEFORE INSERT ON "DecisionConstraint" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "DecisionConstraint_planVersionId_UPDATE" BEFORE UPDATE ON "DecisionConstraint" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "PlanAssumption_planVersionId_INSERT" BEFORE INSERT ON "PlanAssumption" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "PlanAssumption_planVersionId_UPDATE" BEFORE UPDATE ON "PlanAssumption" WHEN NEW."planVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarPlanVersion" p JOIN "CarDecision" d ON p.decisionId=d.id WHERE p.id=NEW."planVersionId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace plan'); END;
CREATE TRIGGER "BalanceObservation_reviewId_INSERT" BEFORE INSERT ON "BalanceObservation" WHEN NEW."reviewId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarMonthlyReview" r JOIN "CarDecision" d ON r.decisionId=d.id WHERE r.id=NEW."reviewId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace review'); END;
CREATE TRIGGER "BalanceObservation_reviewId_UPDATE" BEFORE UPDATE ON "BalanceObservation" WHEN NEW."reviewId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarMonthlyReview" r JOIN "CarDecision" d ON r.decisionId=d.id WHERE r.id=NEW."reviewId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace review'); END;
CREATE TRIGGER "AssumptionVerification_reviewId_INSERT" BEFORE INSERT ON "AssumptionVerification" WHEN NEW."reviewId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarMonthlyReview" r JOIN "CarDecision" d ON r.decisionId=d.id WHERE r.id=NEW."reviewId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace review'); END;
CREATE TRIGGER "AssumptionVerification_reviewId_UPDATE" BEFORE UPDATE ON "AssumptionVerification" WHEN NEW."reviewId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CarMonthlyReview" r JOIN "CarDecision" d ON r.decisionId=d.id WHERE r.id=NEW."reviewId" AND d.workspaceId=NEW.workspaceId) BEGIN SELECT RAISE(ABORT,'cross workspace review'); END;
CREATE TRIGGER "ProductVersion_productId_INSERT" BEFORE INSERT ON "ProductVersion" WHEN NEW."productId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Product" WHERE id=NEW."productId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "ProductVersion_productId_UPDATE" BEFORE UPDATE ON "ProductVersion" WHEN NEW."productId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Product" WHERE id=NEW."productId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "ProductSource_productVersionId_INSERT" BEFORE INSERT ON "ProductSource" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "ProductSource_productVersionId_UPDATE" BEFORE UPDATE ON "ProductSource" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "ProductSelectionVersion_productVersionId_INSERT" BEFORE INSERT ON "ProductSelectionVersion" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "ProductSelectionVersion_productVersionId_UPDATE" BEFORE UPDATE ON "ProductSelectionVersion" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "InsurancePolicy_productVersionId_INSERT" BEFORE INSERT ON "InsurancePolicy" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "InsurancePolicy_productVersionId_UPDATE" BEFORE UPDATE ON "InsurancePolicy" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "HoldingDetail_productVersionId_INSERT" BEFORE INSERT ON "HoldingDetail" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "HoldingDetail_productVersionId_UPDATE" BEFORE UPDATE ON "HoldingDetail" WHEN NEW."productVersionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProductVersion" WHERE id=NEW."productVersionId") BEGIN SELECT RAISE(ABORT,'missing product reference'); END;
CREATE TRIGGER "BudgetVersion_no_overlap_INSERT" BEFORE INSERT ON "BudgetVersion" WHEN (NEW.validTo IS NOT NULL AND NEW.validTo<=NEW.validFrom) OR EXISTS(SELECT 1 FROM "BudgetVersion" b WHERE b.workspaceId=NEW.workspaceId AND b.id<>NEW.id AND b.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND NEW.validFrom<COALESCE(b.validTo,'9999-12-31')) BEGIN SELECT RAISE(ABORT,'budget intervals overlap'); END;
CREATE TRIGGER "RedLineCheck_one_evaluation_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN (NEW.evaluationId IS NULL)=(NEW.professionalEvaluationId IS NULL) BEGIN SELECT RAISE(ABORT,'exactly one evaluation required'); END;
CREATE TRIGGER "Goal_priority_INSERT" BEFORE INSERT ON "Goal" WHEN NEW.priority<1 OR NEW.priority>5 BEGIN SELECT RAISE(ABORT,'invalid goal priority'); END;
CREATE TRIGGER "BalanceObservation_reference_INSERT" BEFORE INSERT ON "BalanceObservation" WHEN NOT ((NEW.entityType='ASSET' AND EXISTS(SELECT 1 FROM "Asset" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId)) OR (NEW.entityType='LIABILITY' AND EXISTS(SELECT 1 FROM "Liability" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId))) BEGIN SELECT RAISE(ABORT,'invalid balance reference'); END;
CREATE TRIGGER "BudgetVersion_no_overlap_UPDATE" BEFORE UPDATE ON "BudgetVersion" WHEN (NEW.validTo IS NOT NULL AND NEW.validTo<=NEW.validFrom) OR EXISTS(SELECT 1 FROM "BudgetVersion" b WHERE b.workspaceId=NEW.workspaceId AND b.id<>NEW.id AND b.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND NEW.validFrom<COALESCE(b.validTo,'9999-12-31')) BEGIN SELECT RAISE(ABORT,'budget intervals overlap'); END;
CREATE TRIGGER "RedLineCheck_one_evaluation_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN (NEW.evaluationId IS NULL)=(NEW.professionalEvaluationId IS NULL) BEGIN SELECT RAISE(ABORT,'exactly one evaluation required'); END;
CREATE TRIGGER "Goal_priority_UPDATE" BEFORE UPDATE ON "Goal" WHEN NEW.priority<1 OR NEW.priority>5 BEGIN SELECT RAISE(ABORT,'invalid goal priority'); END;
CREATE TRIGGER "BalanceObservation_reference_UPDATE" BEFORE UPDATE ON "BalanceObservation" WHEN NOT ((NEW.entityType='ASSET' AND EXISTS(SELECT 1 FROM "Asset" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId)) OR (NEW.entityType='LIABILITY' AND EXISTS(SELECT 1 FROM "Liability" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId))) BEGIN SELECT RAISE(ABORT,'invalid balance reference'); END;
CREATE TRIGGER ProductVersion_immutable BEFORE UPDATE ON ProductVersion WHEN OLD.status<>'DRAFT' AND (NEW.dataJson<>OLD.dataJson OR NEW.productId<>OLD.productId OR NEW.version<>OLD.version OR NEW.ageMin IS NOT OLD.ageMin OR NEW.ageMax IS NOT OLD.ageMax OR NEW.riskLevel IS NOT OLD.riskLevel OR NEW.minimumMinor IS NOT OLD.minimumMinor OR NEW.termMonths IS NOT OLD.termMonths OR NEW.redemptionDays IS NOT OLD.redemptionDays) BEGIN SELECT RAISE(ABORT,'published product is immutable'); END;
