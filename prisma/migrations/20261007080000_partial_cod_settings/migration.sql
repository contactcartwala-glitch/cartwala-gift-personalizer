CREATE TABLE "PartialCodSettings" (
  "shop" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "advancePercent" INTEGER NOT NULL DEFAULT 20,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartialCodSettings_percent_check" CHECK ("advancePercent" BETWEEN 10 AND 50),
  CONSTRAINT "PartialCodSettings_revision_check" CHECK ("revision" > 0)
);
ALTER TABLE "PartialCodIntent" ADD COLUMN "advancePercent" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "PartialCodIntent" DROP CONSTRAINT "PartialCodIntent_amounts_check";
ALTER TABLE "PartialCodIntent" ADD CONSTRAINT "PartialCodIntent_amounts_check" CHECK (
  "orderPaise" > 0 AND "orderPaise" <= 100000000 AND "currency" = 'INR'
  AND "advancePercent" BETWEEN 10 AND 50
  AND "payableNowPaise" = (("orderPaise"::bigint * "advancePercent" + 50) / 100) + 8000
  AND "collectPaise" = "orderPaise" - (("orderPaise"::bigint * "advancePercent" + 50) / 100)
);
