-- CreateTable
CREATE TABLE "CarDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceRevision" INTEGER NOT NULL DEFAULT 0,
    "factsJson" TEXT NOT NULL,
    "conversationJson" TEXT NOT NULL DEFAULT '[]',
    "evaluationJson" TEXT,
    "activePlanId" TEXT,
    "purchaseJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarPlanVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "decisionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "transactionRevision" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "factsJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adoptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CarPlanVersion_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CarDecision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarFundingReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    CONSTRAINT "CarFundingReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CarFundingReservation_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CarDecision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarMonthlyReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "decisionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "activePlanId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "transactionRevision" INTEGER NOT NULL,
    "factsJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "adoptedPlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CarMonthlyReview_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CarDecision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CarDecision_workspaceId_updatedAt_idx" ON "CarDecision"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarPlanVersion_decisionId_version_key" ON "CarPlanVersion"("decisionId", "version");

-- CreateIndex
CREATE INDEX "CarFundingReservation_workspaceId_assetId_idx" ON "CarFundingReservation"("workspaceId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CarFundingReservation_decisionId_assetId_key" ON "CarFundingReservation"("decisionId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CarMonthlyReview_decisionId_month_key" ON "CarMonthlyReview"("decisionId", "month");

