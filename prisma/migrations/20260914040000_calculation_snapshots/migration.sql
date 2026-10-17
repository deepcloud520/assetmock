CREATE TABLE "CalculationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalculationSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CalculationSnapshot_workspaceId_sourceRevision_formulaVersion_key"
ON "CalculationSnapshot"("workspaceId", "sourceRevision", "formulaVersion");

CREATE INDEX "CalculationSnapshot_workspaceId_createdAt_idx"
ON "CalculationSnapshot"("workspaceId", "createdAt");
