CREATE TABLE "ActionFeedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actionId" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionFeedback_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ActionFeedback_actionId_createdAt_idx" ON "ActionFeedback"("actionId", "createdAt");
