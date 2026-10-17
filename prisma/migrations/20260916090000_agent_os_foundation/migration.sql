ALTER TABLE "Workspace" ADD COLUMN "ledgerConfirmedAt" DATETIME;

CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "sourceRevision" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AgentStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AgentSession_workspaceId_updatedAt_idx" ON "AgentSession"("workspaceId", "updatedAt");
CREATE INDEX "AgentMessage_sessionId_createdAt_idx" ON "AgentMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX "AgentStep_sessionId_sequence_key" ON "AgentStep"("sessionId", "sequence");
CREATE INDEX "AgentStep_sessionId_createdAt_idx" ON "AgentStep"("sessionId", "createdAt");
