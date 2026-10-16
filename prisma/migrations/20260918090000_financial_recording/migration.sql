ALTER TABLE "Asset" ADD COLUMN "classificationSource" TEXT NOT NULL DEFAULT 'RULE_FALLBACK';
ALTER TABLE "Asset" ADD COLUMN "classificationVersion" TEXT NOT NULL DEFAULT 'asset-classifier-v0';

ALTER TABLE "Liability" ADD COLUMN "isInstallment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Liability" ADD COLUMN "totalRepaymentMinor" BIGINT;
ALTER TABLE "Liability" ADD COLUMN "principalMinor" BIGINT;
ALTER TABLE "Liability" ADD COLUMN "interestMinor" BIGINT;
ALTER TABLE "Liability" ADD COLUMN "repaymentMethod" TEXT;
