ALTER TABLE "FuturePlanningReport" ADD COLUMN "planSetId" TEXT REFERENCES "PlanSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuturePlanningReport" ADD COLUMN "planKey" TEXT;
ALTER TABLE "FuturePlanningReport" ADD COLUMN "resultJson" TEXT;

CREATE INDEX "FuturePlanningReport_planSetId_createdAt_idx" ON "FuturePlanningReport"("planSetId", "createdAt");
