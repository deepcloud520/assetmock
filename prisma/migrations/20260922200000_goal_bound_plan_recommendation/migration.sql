ALTER TABLE "PlanSet" ADD COLUMN "goalId" TEXT REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanSet" ADD COLUMN "recommendedPlanKey" TEXT;

CREATE INDEX "PlanSet_goalId_createdAt_idx" ON "PlanSet"("goalId", "createdAt");
