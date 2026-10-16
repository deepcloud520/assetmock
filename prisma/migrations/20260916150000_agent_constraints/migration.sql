CREATE TABLE "AgentConstraint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "validUntil" DATETIME,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConstraint_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AgentConstraintRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "constraintId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "validUntil" DATETIME,
    "confirmedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConstraintRevision_constraintId_fkey" FOREIGN KEY ("constraintId") REFERENCES "AgentConstraint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentConstraint_sessionId_createdAt_idx" ON "AgentConstraint"("sessionId", "createdAt");
CREATE UNIQUE INDEX "AgentConstraintRevision_constraintId_version_key" ON "AgentConstraintRevision"("constraintId", "version");
