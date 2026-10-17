ALTER TABLE "Action" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "Action_sourceKey_key" ON "Action"("sourceKey");
