ALTER TABLE "Action" ADD COLUMN "goalId" TEXT REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuturePlanningReport" ADD COLUMN "adoptedAt" DATETIME;

CREATE INDEX "Action_goalId_createdAt_idx" ON "Action"("goalId", "createdAt");
