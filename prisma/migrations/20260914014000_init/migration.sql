CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "age" INTEGER,
    "familyStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "riskLevel" TEXT NOT NULL DEFAULT 'BALANCED',
    "baseCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "stableMonthlyIncomeMinor" BIGINT NOT NULL DEFAULT 0,
    "otherMonthlyIncomeMinor" BIGINT NOT NULL DEFAULT 0,
    "rentExpenseMinor" BIGINT NOT NULL DEFAULT 0,
    "transportExpenseMinor" BIGINT NOT NULL DEFAULT 0,
    "essentialExpenseMinor" BIGINT NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'USER_INPUT',
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentValueMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "liquidityLevel" TEXT NOT NULL,
    "riskLevel" INTEGER NOT NULL,
    "isInvestable" BOOLEAN NOT NULL DEFAULT true,
    "isAdjustable" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'USER_INPUT',
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Liability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outstandingBalanceMinor" BIGINT NOT NULL,
    "monthlyPaymentMinor" BIGINT NOT NULL DEFAULT 0,
    "remainingMonths" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'USER_INPUT',
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liability_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmountMinor" BIGINT NOT NULL,
    "targetAmountSource" TEXT NOT NULL DEFAULT 'USER_INPUT',
    "targetDate" DATETIME NOT NULL,
    "preparedAmountMinor" BIGINT NOT NULL DEFAULT 0,
    "monthlyContributionMinor" BIGINT NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "isFlexible" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'USER_INPUT',
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Profile_workspaceId_key" ON "Profile"("workspaceId");
CREATE INDEX "Asset_workspaceId_deletedAt_idx" ON "Asset"("workspaceId", "deletedAt");
CREATE INDEX "Asset_goalId_idx" ON "Asset"("goalId");
CREATE INDEX "Liability_workspaceId_deletedAt_idx" ON "Liability"("workspaceId", "deletedAt");
CREATE INDEX "Goal_workspaceId_deletedAt_idx" ON "Goal"("workspaceId", "deletedAt");
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
