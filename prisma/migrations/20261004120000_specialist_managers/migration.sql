-- CreateTable
CREATE TABLE "ManagerState" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "budgetJson" TEXT NOT NULL DEFAULT '{}',
    "insuranceJson" TEXT NOT NULL DEFAULT '{}',
    "investmentJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagerState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dataJson" TEXT NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsurancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HoldingDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dataJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HoldingDetail_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HoldingDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfessionalEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "manager" TEXT NOT NULL,
    "sourceSignature" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfessionalEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTENT',
    "snapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSelection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagerReminder" (
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
    CONSTRAINT "ManagerReminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InsurancePolicy_workspaceId_deletedAt_idx" ON "InsurancePolicy"("workspaceId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingDetail_assetId_key" ON "HoldingDetail"("assetId");

-- CreateIndex
CREATE INDEX "HoldingDetail_workspaceId_idx" ON "HoldingDetail"("workspaceId");

-- CreateIndex
CREATE INDEX "ProfessionalEvaluation_workspaceId_manager_createdAt_idx" ON "ProfessionalEvaluation"("workspaceId", "manager", "createdAt");

-- CreateIndex
CREATE INDEX "ProductSelection_workspaceId_createdAt_idx" ON "ProductSelection"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSelection_workspaceId_evaluationId_productId_key" ON "ProductSelection"("workspaceId", "evaluationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerReminder_sourceKey_key" ON "ManagerReminder"("sourceKey");

-- CreateIndex
CREATE INDEX "ManagerReminder_workspaceId_status_dueDate_idx" ON "ManagerReminder"("workspaceId", "status", "dueDate");

