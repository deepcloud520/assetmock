DROP TRIGGER IF EXISTS "BudgetVersion_workspace_INSERT";
DROP TRIGGER IF EXISTS "BudgetVersion_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BudgetVersion_workspace_delete";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_INSERT";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_delete";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_INSERT";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_UPDATE";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_delete";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_delete";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_delete";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_INSERT";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_UPDATE";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_delete";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_INSERT";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_delete";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_INSERT";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_UPDATE";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_delete";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_delete";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_delete";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_delete";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_delete";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_delete";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_delete";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_INSERT";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_UPDATE";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_delete";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_INSERT";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_UPDATE";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_delete";
DROP TRIGGER IF EXISTS "DataDependency_workspace_INSERT";
DROP TRIGGER IF EXISTS "DataDependency_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DataDependency_workspace_delete";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_INSERT";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_delete";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_INSERT";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_UPDATE";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_delete";
DROP TRIGGER IF EXISTS "CarFundingReservation_assetId_INSERT";
DROP TRIGGER IF EXISTS "CarFundingReservation_assetId_UPDATE";
DROP TRIGGER IF EXISTS "CarFundingReservation_decisionId_INSERT";
DROP TRIGGER IF EXISTS "CarFundingReservation_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "ManagerReminder_actionId_INSERT";
DROP TRIGGER IF EXISTS "ManagerReminder_actionId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelection_evaluationId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelection_evaluationId_UPDATE";
DROP TRIGGER IF EXISTS "HoldingDetail_assetId_INSERT";
DROP TRIGGER IF EXISTS "HoldingDetail_assetId_UPDATE";
DROP TRIGGER IF EXISTS "Asset_goalId_INSERT";
DROP TRIGGER IF EXISTS "Asset_goalId_UPDATE";
DROP TRIGGER IF EXISTS "InsurancePolicy_cashValueAssetId_INSERT";
DROP TRIGGER IF EXISTS "InsurancePolicy_cashValueAssetId_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_assetId_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_assetId_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_decisionId_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "BudgetItem_budgetVersionId_INSERT";
DROP TRIGGER IF EXISTS "BudgetItem_budgetVersionId_UPDATE";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_decisionId_INSERT";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_decisionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_assetId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_assetId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_goalId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_goalId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_sourceId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_assetId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_assetId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_sourceId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_sourceId_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_assumptionId_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_assumptionId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_constraintId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_constraintId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_evaluationId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_evaluationId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_professionalEvaluationId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_professionalEvaluationId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_selectionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_selectionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_reviewId_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_reviewId_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_reviewId_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_reviewId_UPDATE";
DROP TRIGGER IF EXISTS "ProductVersion_productId_INSERT";
DROP TRIGGER IF EXISTS "ProductVersion_productId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSource_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSource_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "InsurancePolicy_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "InsurancePolicy_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "HoldingDetail_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "HoldingDetail_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_one_evaluation_INSERT";
DROP TRIGGER IF EXISTS "Goal_priority_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_reference_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_one_evaluation_UPDATE";
DROP TRIGGER IF EXISTS "Goal_priority_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_reference_UPDATE";
DROP TRIGGER IF EXISTS "ProductVersion_immutable";
DROP TRIGGER IF EXISTS "BudgetVersion_no_overlap_INSERT";
DROP TRIGGER IF EXISTS "BudgetVersion_no_overlap_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_definition_immutable";
DROP TRIGGER IF EXISTS "PlanAssumption_definition_immutable";
DROP TRIGGER IF EXISTS "DecisionReason_immutable";
DROP TRIGGER IF EXISTS "BudgetVersion_contents_immutable";
DROP TRIGGER IF EXISTS "DecisionConstraint_rule_INSERT";
DROP TRIGGER IF EXISTS "ManagerState_business_INSERT";
DROP TRIGGER IF EXISTS "ManagerState_business_UPDATE";
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssumptionVerification" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssumptionVerification_workspaceId_assumptionId_fkey" FOREIGN KEY ("workspaceId", "assumptionId") REFERENCES "PlanAssumption" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssumptionVerification_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CarMonthlyReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssumptionVerification" ("actualValue", "assumptionId", "createdAt", "evidence", "historyJson", "id", "period", "reviewId", "revision", "status", "verifiedAt", "verifiedBy", "workspaceId") SELECT "actualValue", "assumptionId", "createdAt", "evidence", "historyJson", "id", "period", "reviewId", "revision", "status", "verifiedAt", "verifiedBy", "workspaceId" FROM "AssumptionVerification";
DROP TABLE "AssumptionVerification";
ALTER TABLE "new_AssumptionVerification" RENAME TO "AssumptionVerification";
CREATE INDEX "AssumptionVerification_workspaceId_status_period_idx" ON "AssumptionVerification"("workspaceId", "status", "period");
CREATE UNIQUE INDEX "AssumptionVerification_assumptionId_period_key" ON "AssumptionVerification"("assumptionId", "period");
CREATE TABLE "new_BudgetItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "budgetVersionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "allocation" TEXT NOT NULL,
    "dueDay" INTEGER,
    "dueOn" TEXT,
    "includedInLiving" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "BudgetItem_workspaceId_budgetVersionId_fkey" FOREIGN KEY ("workspaceId", "budgetVersionId") REFERENCES "BudgetVersion" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BudgetItem" ("allocation", "amountMinor", "budgetVersionId", "dueDay", "dueOn", "id", "includedInLiving", "kind", "sourceRef", "workspaceId") SELECT "allocation", "amountMinor", "budgetVersionId", "dueDay", "dueOn", "id", "includedInLiving", "kind", "sourceRef", "workspaceId" FROM "BudgetItem";
DROP TABLE "BudgetItem";
ALTER TABLE "new_BudgetItem" RENAME TO "BudgetItem";
CREATE UNIQUE INDEX "BudgetItem_budgetVersionId_sourceRef_key" ON "BudgetItem"("budgetVersionId", "sourceRef");
CREATE TABLE "new_CarEvaluationRecord" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CarEvaluationRecord_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "CarDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CarEvaluationRecord" ("calculatedOn", "createdAt", "decisionId", "decisionVersion", "formulaVersion", "id", "inputJson", "resultJson", "sourceSignature", "status", "workspaceId") SELECT "calculatedOn", "createdAt", "decisionId", "decisionVersion", "formulaVersion", "id", "inputJson", "resultJson", "sourceSignature", "status", "workspaceId" FROM "CarEvaluationRecord";
DROP TABLE "CarEvaluationRecord";
ALTER TABLE "new_CarEvaluationRecord" RENAME TO "CarEvaluationRecord";
CREATE INDEX "CarEvaluationRecord_workspaceId_decisionId_createdAt_idx" ON "CarEvaluationRecord"("workspaceId", "decisionId", "createdAt");
CREATE UNIQUE INDEX "CarEvaluationRecord_workspaceId_id_key" ON "CarEvaluationRecord"("workspaceId", "id");
CREATE TABLE "new_CarFundingReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    CONSTRAINT "CarFundingReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CarFundingReservation_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "CarDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CarFundingReservation_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CarFundingReservation" ("amountMinor", "assetId", "decisionId", "id", "workspaceId") SELECT "amountMinor", "assetId", "decisionId", "id", "workspaceId" FROM "CarFundingReservation";
DROP TABLE "CarFundingReservation";
ALTER TABLE "new_CarFundingReservation" RENAME TO "CarFundingReservation";
CREATE INDEX "CarFundingReservation_workspaceId_assetId_idx" ON "CarFundingReservation"("workspaceId", "assetId");
CREATE UNIQUE INDEX "CarFundingReservation_decisionId_assetId_key" ON "CarFundingReservation"("decisionId", "assetId");
CREATE TABLE "new_DecisionConstraint" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionConstraint_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CarPlanVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DecisionConstraint_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "CarDecision" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DecisionConstraint_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "DecisionConstraint_workspaceId_goalId_fkey" FOREIGN KEY ("workspaceId", "goalId") REFERENCES "Goal" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "DecisionConstraint_workspaceId_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "DecisionConstraint" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "DecisionConstraint_workspaceId_supersededById_fkey" FOREIGN KEY ("workspaceId", "supersededById") REFERENCES "DecisionConstraint" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_DecisionConstraint" ("assetId", "checkScope", "confirmedAt", "createdAt", "currency", "decisionId", "goalId", "id", "memoryId", "operator", "planVersionId", "recordKind", "scope", "sourceId", "status", "supersededById", "thresholdValue", "type", "unit", "userText", "workspaceId") SELECT "assetId", "checkScope", "confirmedAt", "createdAt", "currency", "decisionId", "goalId", "id", "memoryId", "operator", "planVersionId", "recordKind", "scope", "sourceId", "status", "supersededById", "thresholdValue", "type", "unit", "userText", "workspaceId" FROM "DecisionConstraint";
DROP TABLE "DecisionConstraint";
ALTER TABLE "new_DecisionConstraint" RENAME TO "DecisionConstraint";
CREATE INDEX "DecisionConstraint_workspaceId_recordKind_scope_decisionId_status_idx" ON "DecisionConstraint"("workspaceId", "recordKind", "scope", "decisionId", "status");
CREATE UNIQUE INDEX "DecisionConstraint_workspaceId_id_key" ON "DecisionConstraint"("workspaceId", "id");
CREATE TABLE "new_DecisionReason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "userText" TEXT,
    "assetId" TEXT,
    "sourceId" TEXT,
    "evidenceSource" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DecisionReason_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CarPlanVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DecisionReason_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "Asset" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "DecisionReason_workspaceId_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "DecisionReason" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_DecisionReason" ("assetId", "category", "createdAt", "evidenceSource", "id", "planVersionId", "sourceId", "userText", "workspaceId") SELECT "assetId", "category", "createdAt", "evidenceSource", "id", "planVersionId", "sourceId", "userText", "workspaceId" FROM "DecisionReason";
DROP TABLE "DecisionReason";
ALTER TABLE "new_DecisionReason" RENAME TO "DecisionReason";
CREATE INDEX "DecisionReason_workspaceId_planVersionId_idx" ON "DecisionReason"("workspaceId", "planVersionId");
CREATE UNIQUE INDEX "DecisionReason_workspaceId_id_key" ON "DecisionReason"("workspaceId", "id");
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
    CONSTRAINT "HoldingDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HoldingDetail_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HoldingDetail" ("assetId", "availableOn", "confirmed", "dataJson", "feeMinor", "id", "productVersionId", "updatedAt", "version", "workspaceId") SELECT "assetId", "availableOn", "confirmed", "dataJson", "feeMinor", "id", "productVersionId", "updatedAt", "version", "workspaceId" FROM "HoldingDetail";
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
    CONSTRAINT "InsurancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InsurancePolicy_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InsurancePolicy" ("cashValueAssetId", "category", "confirmed", "coverageMinor", "createdAt", "dataJson", "deletedAt", "endsOn", "id", "insured", "paymentMonths", "premiumMinor", "productVersionId", "startsOn", "updatedAt", "version", "workspaceId") SELECT "cashValueAssetId", "category", "confirmed", "coverageMinor", "createdAt", "dataJson", "deletedAt", "endsOn", "id", "insured", "paymentMonths", "premiumMinor", "productVersionId", "startsOn", "updatedAt", "version", "workspaceId" FROM "InsurancePolicy";
DROP TABLE "InsurancePolicy";
ALTER TABLE "new_InsurancePolicy" RENAME TO "InsurancePolicy";
CREATE INDEX "InsurancePolicy_workspaceId_deletedAt_idx" ON "InsurancePolicy"("workspaceId", "deletedAt");
CREATE TABLE "new_ManagerReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "manager" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "snoozedUntil" DATETIME,
    "actionId" TEXT,
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagerReminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ManagerReminder_workspaceId_actionId_fkey" FOREIGN KEY ("workspaceId", "actionId") REFERENCES "Action" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ManagerReminder" ("actionId", "createdAt", "detailsJson", "dueDate", "id", "manager", "snoozedUntil", "sourceKey", "status", "title", "updatedAt", "workspaceId") SELECT "actionId", "createdAt", "detailsJson", "dueDate", "id", "manager", "snoozedUntil", "sourceKey", "status", "title", "updatedAt", "workspaceId" FROM "ManagerReminder";
DROP TABLE "ManagerReminder";
ALTER TABLE "new_ManagerReminder" RENAME TO "ManagerReminder";
CREATE UNIQUE INDEX "ManagerReminder_sourceKey_key" ON "ManagerReminder"("sourceKey");
CREATE INDEX "ManagerReminder_workspaceId_status_dueDate_idx" ON "ManagerReminder"("workspaceId", "status", "dueDate");
CREATE TABLE "new_PlanAssumption" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanAssumption_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "CarPlanVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanAssumption_workspaceId_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "PlanAssumption" ("workspaceId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_PlanAssumption" ("category", "checkType", "content", "createdAt", "currency", "dueOn", "expectedValue", "id", "lifecycle", "planVersionId", "referenceId", "rule", "sourceId", "sourceJson", "workspaceId") SELECT "category", "checkType", "content", "createdAt", "currency", "dueOn", "expectedValue", "id", "lifecycle", "planVersionId", "referenceId", "rule", "sourceId", "sourceJson", "workspaceId" FROM "PlanAssumption";
DROP TABLE "PlanAssumption";
ALTER TABLE "new_PlanAssumption" RENAME TO "PlanAssumption";
CREATE INDEX "PlanAssumption_workspaceId_planVersionId_lifecycle_idx" ON "PlanAssumption"("workspaceId", "planVersionId", "lifecycle");
CREATE UNIQUE INDEX "PlanAssumption_workspaceId_id_key" ON "PlanAssumption"("workspaceId", "id");
CREATE TABLE "new_ProductSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTENT',
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSelection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSelection_workspaceId_evaluationId_fkey" FOREIGN KEY ("workspaceId", "evaluationId") REFERENCES "ProfessionalEvaluation" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductSelection" ("createdAt", "evaluationId", "id", "productId", "snapshotJson", "status", "workspaceId") SELECT "createdAt", "evaluationId", "id", "productId", "snapshotJson", "status", "workspaceId" FROM "ProductSelection";
DROP TABLE "ProductSelection";
ALTER TABLE "new_ProductSelection" RENAME TO "ProductSelection";
CREATE INDEX "ProductSelection_workspaceId_createdAt_idx" ON "ProductSelection"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "ProductSelection_workspaceId_evaluationId_productId_key" ON "ProductSelection"("workspaceId", "evaluationId", "productId");
CREATE UNIQUE INDEX "ProductSelection_workspaceId_id_key" ON "ProductSelection"("workspaceId", "id");
CREATE TABLE "new_ProductSelectionVersion" (
    "selectionId" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    CONSTRAINT "ProductSelectionVersion_workspaceId_selectionId_fkey" FOREIGN KEY ("workspaceId", "selectionId") REFERENCES "ProductSelection" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSelectionVersion_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductSelectionVersion" ("productVersionId", "selectionId", "workspaceId") SELECT "productVersionId", "selectionId", "workspaceId" FROM "ProductSelectionVersion";
DROP TABLE "ProductSelectionVersion";
ALTER TABLE "new_ProductSelectionVersion" RENAME TO "ProductSelectionVersion";
CREATE UNIQUE INDEX "ProductSelectionVersion_workspaceId_selectionId_key" ON "ProductSelectionVersion"("workspaceId", "selectionId");
CREATE TABLE "new_ProductSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productVersionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicationText" TEXT NOT NULL,
    "reviewedOn" TEXT NOT NULL,
    "note" TEXT,
    "contentHash" TEXT,
    CONSTRAINT "ProductSource_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductSource" ("contentHash", "id", "note", "productVersionId", "publicationText", "reviewedOn", "url") SELECT "contentHash", "id", "note", "productVersionId", "publicationText", "reviewedOn", "url" FROM "ProductSource";
DROP TABLE "ProductSource";
ALTER TABLE "new_ProductSource" RENAME TO "ProductSource";
CREATE TABLE "new_ProductVersion" (
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
    "publishedAt" DATETIME,
    CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductVersion" ("ageMax", "ageMin", "createdAt", "dataJson", "id", "minimumMinor", "productId", "publishedAt", "redemptionDays", "reviewedOn", "riskLevel", "status", "termMonths", "version") SELECT "ageMax", "ageMin", "createdAt", "dataJson", "id", "minimumMinor", "productId", "publishedAt", "redemptionDays", "reviewedOn", "riskLevel", "status", "termMonths", "version" FROM "ProductVersion";
DROP TABLE "ProductVersion";
ALTER TABLE "new_ProductVersion" RENAME TO "ProductVersion";
CREATE INDEX "ProductVersion_productId_status_createdAt_idx" ON "ProductVersion"("productId", "status", "createdAt");
CREATE UNIQUE INDEX "ProductVersion_productId_version_key" ON "ProductVersion"("productId", "version");
CREATE TABLE "new_RedLineCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "constraintId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "professionalEvaluationId" TEXT,
    "candidateKey" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT 'redline-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedLineCheck_workspaceId_constraintId_fkey" FOREIGN KEY ("workspaceId", "constraintId") REFERENCES "DecisionConstraint" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RedLineCheck_workspaceId_evaluationId_fkey" FOREIGN KEY ("workspaceId", "evaluationId") REFERENCES "CarEvaluationRecord" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RedLineCheck_workspaceId_professionalEvaluationId_fkey" FOREIGN KEY ("workspaceId", "professionalEvaluationId") REFERENCES "ProfessionalEvaluation" ("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RedLineCheck" ("candidateKey", "constraintId", "createdAt", "detailJson", "evaluationId", "id", "professionalEvaluationId", "result", "ruleVersion", "workspaceId") SELECT "candidateKey", "constraintId", "createdAt", "detailJson", "evaluationId", "id", "professionalEvaluationId", "result", "ruleVersion", "workspaceId" FROM "RedLineCheck";
DROP TABLE "RedLineCheck";
ALTER TABLE "new_RedLineCheck" RENAME TO "RedLineCheck";
CREATE INDEX "RedLineCheck_workspaceId_createdAt_idx" ON "RedLineCheck"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "RedLineCheck_evaluationId_candidateKey_constraintId_key" ON "RedLineCheck"("evaluationId", "candidateKey", "constraintId");
CREATE UNIQUE INDEX "RedLineCheck_professionalEvaluationId_candidateKey_constraintId_key" ON "RedLineCheck"("professionalEvaluationId", "candidateKey", "constraintId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Action_workspaceId_id_key" ON "Action"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_workspaceId_id_key" ON "Asset"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_workspaceId_id_key" ON "BudgetVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CarDecision_workspaceId_id_key" ON "CarDecision"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_workspaceId_id_key" ON "Goal"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalEvaluation_workspaceId_id_key" ON "ProfessionalEvaluation"("workspaceId", "id");


-- SQLite table rebuilds drop triggers. Restore all existing application guards.
DROP TRIGGER IF EXISTS "BudgetVersion_workspace_INSERT";
DROP TRIGGER IF EXISTS "BudgetVersion_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BudgetVersion_workspace_delete";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_INSERT";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BudgetItem_workspace_delete";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_INSERT";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_UPDATE";
DROP TRIGGER IF EXISTS "InsuranceNeed_workspace_delete";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_workspace_delete";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_workspace_delete";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_INSERT";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_UPDATE";
DROP TRIGGER IF EXISTS "RecordRevision_workspace_delete";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_INSERT";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_UPDATE";
DROP TRIGGER IF EXISTS "BusinessDraft_workspace_delete";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_INSERT";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_UPDATE";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_workspace_delete";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_workspace_delete";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_workspace_delete";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_workspace_delete";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_workspace_delete";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_workspace_delete";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_workspace_delete";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_INSERT";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_UPDATE";
DROP TRIGGER IF EXISTS "SourceEvidence_workspace_delete";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_INSERT";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_UPDATE";
DROP TRIGGER IF EXISTS "ImportBatch_workspace_delete";
DROP TRIGGER IF EXISTS "DataDependency_workspace_INSERT";
DROP TRIGGER IF EXISTS "DataDependency_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DataDependency_workspace_delete";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_INSERT";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_UPDATE";
DROP TRIGGER IF EXISTS "DeletionJob_workspace_delete";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_INSERT";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_UPDATE";
DROP TRIGGER IF EXISTS "MigrationIssue_workspace_delete";
DROP TRIGGER IF EXISTS "CarFundingReservation_assetId_INSERT";
DROP TRIGGER IF EXISTS "CarFundingReservation_assetId_UPDATE";
DROP TRIGGER IF EXISTS "CarFundingReservation_decisionId_INSERT";
DROP TRIGGER IF EXISTS "CarFundingReservation_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "ManagerReminder_actionId_INSERT";
DROP TRIGGER IF EXISTS "ManagerReminder_actionId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelection_evaluationId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelection_evaluationId_UPDATE";
DROP TRIGGER IF EXISTS "HoldingDetail_assetId_INSERT";
DROP TRIGGER IF EXISTS "HoldingDetail_assetId_UPDATE";
DROP TRIGGER IF EXISTS "Asset_goalId_INSERT";
DROP TRIGGER IF EXISTS "Asset_goalId_UPDATE";
DROP TRIGGER IF EXISTS "InsurancePolicy_cashValueAssetId_INSERT";
DROP TRIGGER IF EXISTS "InsurancePolicy_cashValueAssetId_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_assetId_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_assetId_UPDATE";
DROP TRIGGER IF EXISTS "InvestmentNeed_decisionId_INSERT";
DROP TRIGGER IF EXISTS "InvestmentNeed_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "BudgetItem_budgetVersionId_INSERT";
DROP TRIGGER IF EXISTS "BudgetItem_budgetVersionId_UPDATE";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_decisionId_INSERT";
DROP TRIGGER IF EXISTS "CarEvaluationRecord_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_decisionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_decisionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_assetId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_assetId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_goalId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_goalId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_sourceId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_assetId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_assetId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_sourceId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_sourceId_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_sourceId_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_assumptionId_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_assumptionId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_constraintId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_constraintId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_evaluationId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_evaluationId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_professionalEvaluationId_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_professionalEvaluationId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_selectionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_selectionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionReason_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionReason_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "DecisionConstraint_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "PlanAssumption_planVersionId_INSERT";
DROP TRIGGER IF EXISTS "PlanAssumption_planVersionId_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_reviewId_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_reviewId_UPDATE";
DROP TRIGGER IF EXISTS "AssumptionVerification_reviewId_INSERT";
DROP TRIGGER IF EXISTS "AssumptionVerification_reviewId_UPDATE";
DROP TRIGGER IF EXISTS "ProductVersion_productId_INSERT";
DROP TRIGGER IF EXISTS "ProductVersion_productId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSource_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSource_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "ProductSelectionVersion_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "InsurancePolicy_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "InsurancePolicy_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "HoldingDetail_productVersionId_INSERT";
DROP TRIGGER IF EXISTS "HoldingDetail_productVersionId_UPDATE";
DROP TRIGGER IF EXISTS "RedLineCheck_one_evaluation_INSERT";
DROP TRIGGER IF EXISTS "Goal_priority_INSERT";
DROP TRIGGER IF EXISTS "BalanceObservation_reference_INSERT";
DROP TRIGGER IF EXISTS "RedLineCheck_one_evaluation_UPDATE";
DROP TRIGGER IF EXISTS "Goal_priority_UPDATE";
DROP TRIGGER IF EXISTS "BalanceObservation_reference_UPDATE";
DROP TRIGGER IF EXISTS "ProductVersion_immutable";
DROP TRIGGER IF EXISTS "BudgetVersion_no_overlap_INSERT";
DROP TRIGGER IF EXISTS "BudgetVersion_no_overlap_UPDATE";
DROP TRIGGER IF EXISTS "DecisionConstraint_definition_immutable";
DROP TRIGGER IF EXISTS "PlanAssumption_definition_immutable";
DROP TRIGGER IF EXISTS "DecisionReason_immutable";
DROP TRIGGER IF EXISTS "BudgetVersion_contents_immutable";
DROP TRIGGER IF EXISTS "DecisionConstraint_rule_INSERT";
DROP TRIGGER IF EXISTS "ManagerState_business_INSERT";
DROP TRIGGER IF EXISTS "ManagerState_business_UPDATE";
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
CREATE TRIGGER "RedLineCheck_one_evaluation_INSERT" BEFORE INSERT ON "RedLineCheck" WHEN (NEW.evaluationId IS NULL)=(NEW.professionalEvaluationId IS NULL) BEGIN SELECT RAISE(ABORT,'exactly one evaluation required'); END;
CREATE TRIGGER "Goal_priority_INSERT" BEFORE INSERT ON "Goal" WHEN NEW.priority<1 OR NEW.priority>5 BEGIN SELECT RAISE(ABORT,'invalid goal priority'); END;
CREATE TRIGGER "BalanceObservation_reference_INSERT" BEFORE INSERT ON "BalanceObservation" WHEN NOT ((NEW.entityType='ASSET' AND EXISTS(SELECT 1 FROM "Asset" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId)) OR (NEW.entityType='LIABILITY' AND EXISTS(SELECT 1 FROM "Liability" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId))) BEGIN SELECT RAISE(ABORT,'invalid balance reference'); END;
CREATE TRIGGER "RedLineCheck_one_evaluation_UPDATE" BEFORE UPDATE ON "RedLineCheck" WHEN (NEW.evaluationId IS NULL)=(NEW.professionalEvaluationId IS NULL) BEGIN SELECT RAISE(ABORT,'exactly one evaluation required'); END;
CREATE TRIGGER "Goal_priority_UPDATE" BEFORE UPDATE ON "Goal" WHEN NEW.priority<1 OR NEW.priority>5 BEGIN SELECT RAISE(ABORT,'invalid goal priority'); END;
CREATE TRIGGER "BalanceObservation_reference_UPDATE" BEFORE UPDATE ON "BalanceObservation" WHEN NOT ((NEW.entityType='ASSET' AND EXISTS(SELECT 1 FROM "Asset" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId)) OR (NEW.entityType='LIABILITY' AND EXISTS(SELECT 1 FROM "Liability" WHERE id=NEW.entityId AND workspaceId=NEW.workspaceId))) BEGIN SELECT RAISE(ABORT,'invalid balance reference'); END;
CREATE TRIGGER ProductVersion_immutable BEFORE UPDATE ON ProductVersion WHEN OLD.status<>'DRAFT' AND (NEW.dataJson<>OLD.dataJson OR NEW.productId<>OLD.productId OR NEW.version<>OLD.version OR NEW.ageMin IS NOT OLD.ageMin OR NEW.ageMax IS NOT OLD.ageMax OR NEW.riskLevel IS NOT OLD.riskLevel OR NEW.minimumMinor IS NOT OLD.minimumMinor OR NEW.termMonths IS NOT OLD.termMonths OR NEW.redemptionDays IS NOT OLD.redemptionDays) BEGIN SELECT RAISE(ABORT,'published product is immutable'); END;
CREATE TRIGGER BudgetVersion_no_overlap_INSERT BEFORE INSERT ON BudgetVersion WHEN NEW.status='ACTIVE' AND ((NEW.validTo IS NOT NULL AND NEW.validTo<=NEW.validFrom) OR EXISTS(SELECT 1 FROM BudgetVersion b WHERE b.workspaceId=NEW.workspaceId AND b.status='ACTIVE' AND b.id<>NEW.id AND b.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND NEW.validFrom<COALESCE(b.validTo,'9999-12-31'))) BEGIN SELECT RAISE(ABORT,'budget intervals overlap'); END;
CREATE TRIGGER BudgetVersion_no_overlap_UPDATE BEFORE UPDATE ON BudgetVersion WHEN NEW.status='ACTIVE' AND ((NEW.validTo IS NOT NULL AND NEW.validTo<=NEW.validFrom) OR EXISTS(SELECT 1 FROM BudgetVersion b WHERE b.workspaceId=NEW.workspaceId AND b.status='ACTIVE' AND b.id<>NEW.id AND b.validFrom<COALESCE(NEW.validTo,'9999-12-31') AND NEW.validFrom<COALESCE(b.validTo,'9999-12-31'))) BEGIN SELECT RAISE(ABORT,'budget intervals overlap'); END;
CREATE TRIGGER DecisionConstraint_definition_immutable BEFORE UPDATE ON DecisionConstraint WHEN NEW.userText<>'已删除' AND (OLD.type<>NEW.type OR OLD.operator<>NEW.operator OR OLD.thresholdValue IS NOT NEW.thresholdValue OR OLD.unit IS NOT NEW.unit OR OLD.assetId IS NOT NEW.assetId OR OLD.goalId IS NOT NEW.goalId OR OLD.userText<>NEW.userText OR OLD.scope<>NEW.scope OR OLD.planVersionId IS NOT NEW.planVersionId) BEGIN SELECT RAISE(ABORT,'constraint definitions are immutable'); END;
CREATE TRIGGER PlanAssumption_definition_immutable BEFORE UPDATE ON PlanAssumption WHEN NEW.lifecycle<>'REDACTED' AND (OLD.content<>NEW.content OR OLD.expectedValue IS NOT NEW.expectedValue OR OLD.rule<>NEW.rule OR OLD.dueOn IS NOT NEW.dueOn OR OLD.planVersionId<>NEW.planVersionId) BEGIN SELECT RAISE(ABORT,'assumption definitions are immutable'); END;
CREATE TRIGGER DecisionReason_immutable BEFORE UPDATE ON DecisionReason WHEN NEW.evidenceSource<>'REDACTED' BEGIN SELECT RAISE(ABORT,'decision reasons are immutable'); END;
CREATE TRIGGER BudgetVersion_contents_immutable BEFORE UPDATE ON BudgetVersion WHEN NEW.status<>'REDACTED' AND (OLD.dataJson<>NEW.dataJson OR OLD.incomeMinor<>NEW.incomeMinor OR OLD.livingMinor<>NEW.livingMinor OR OLD.validFrom<>NEW.validFrom) BEGIN SELECT RAISE(ABORT,'budget definitions are immutable'); END;
CREATE TRIGGER DecisionConstraint_rule_INSERT BEFORE INSERT ON DecisionConstraint WHEN NOT COALESCE((
 (NEW.type IN ('NO_USE_ASSET','NO_USE_GOAL_FUND','NO_NEW_DEBT') AND NEW.operator='NOT_USE' AND NEW.thresholdValue IS NULL AND NEW.unit IS NULL AND NEW.currency IS NULL)
 OR (NEW.type IN ('MIN_LIQUID','NO_USE_EMERGENCY') AND NEW.operator IN ('GT','GTE') AND NEW.thresholdValue>=0 AND NEW.unit='CENTS' AND NEW.currency='CNY')
 OR (NEW.type='MAX_DEBT_RATIO' AND NEW.operator IN ('LT','LTE') AND NEW.thresholdValue BETWEEN 0 AND 10000 AND NEW.unit='BPS' AND NEW.currency IS NULL)
 OR (NEW.type='OTHER' AND NEW.operator='MANUAL' AND NEW.thresholdValue IS NULL AND NEW.unit IS NULL AND NEW.currency IS NULL)
),0) OR (NEW.type='NO_USE_ASSET')<>(NEW.assetId IS NOT NULL) OR (NEW.type='NO_USE_GOAL_FUND')<>(NEW.goalId IS NOT NULL) OR (NEW.scope='DECISION' AND NEW.decisionId IS NULL) OR (NEW.scope='GLOBAL' AND NEW.decisionId IS NOT NULL) OR (NEW.recordKind='SNAPSHOT' AND NEW.planVersionId IS NULL)
BEGIN SELECT RAISE(ABORT,'invalid structured redline'); END;
CREATE TRIGGER ManagerState_business_INSERT BEFORE INSERT ON ManagerState WHEN EXISTS(SELECT 1 FROM Workspace WHERE id=NEW.workspaceId AND businessMigratedAt IS NOT NULL) AND (NEW.budgetJson<>'{}' OR NEW.insuranceJson<>'{}' OR NEW.investmentJson<>'{}') BEGIN SELECT RAISE(ABORT,'business facts must use dedicated tables'); END;
CREATE TRIGGER ManagerState_business_UPDATE BEFORE UPDATE ON ManagerState WHEN EXISTS(SELECT 1 FROM Workspace WHERE id=NEW.workspaceId AND businessMigratedAt IS NOT NULL) AND (NEW.budgetJson<>'{}' OR NEW.insuranceJson<>'{}' OR NEW.investmentJson<>'{}') BEGIN SELECT RAISE(ABORT,'business facts must use dedicated tables'); END;