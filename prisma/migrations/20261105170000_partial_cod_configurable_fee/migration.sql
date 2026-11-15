-- Preserve the original fee on every existing settings row and frozen intent.
ALTER TABLE "PartialCodSettings" ADD COLUMN "codFeePaise" INTEGER NOT NULL DEFAULT 8000;
ALTER TABLE "PartialCodIntent" ADD COLUMN "codFeePaise" INTEGER NOT NULL DEFAULT 8000;
ALTER TABLE "PartialCodSettings" ALTER COLUMN "codFeePaise" SET DEFAULT 5000;
ALTER TABLE "PartialCodIntent" ALTER COLUMN "codFeePaise" SET DEFAULT 5000;
ALTER TABLE "PartialCodSettings" ADD CONSTRAINT "PartialCodSettings_fee_check"
  CHECK ("codFeePaise" BETWEEN 0 AND 1000000);
ALTER TABLE "PartialCodIntent" DROP CONSTRAINT "PartialCodIntent_amounts_check";
ALTER TABLE "PartialCodIntent" ADD CONSTRAINT "PartialCodIntent_amounts_check" CHECK (
  "orderPaise" > 0 AND "orderPaise" <= 100000000 AND "currency" = 'INR'
  AND "advancePercent" BETWEEN 10 AND 50 AND "codFeePaise" BETWEEN 0 AND 1000000
  AND "payableNowPaise" = (("orderPaise"::bigint * "advancePercent" + 50) / 100) + "codFeePaise"
  AND "collectPaise" = "orderPaise" - (("orderPaise"::bigint * "advancePercent" + 50) / 100)
);
