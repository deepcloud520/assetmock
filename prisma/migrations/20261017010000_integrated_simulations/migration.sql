CREATE TABLE "SimulationOpening" ("id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "SimulationOpening_workspaceId_sessionId_idx" ON "SimulationOpening"("workspaceId","sessionId");
CREATE TABLE "SimulationReport" ("runId" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "goalId" TEXT, "version" INTEGER NOT NULL DEFAULT -1, "sourceJson" TEXT NOT NULL, "reportJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
CREATE INDEX "SimulationReport_workspaceId_sessionId_idx" ON "SimulationReport"("workspaceId","sessionId");
