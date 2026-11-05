CREATE TABLE "PartialCodOrderAttempt" (
  "intentId" TEXT PRIMARY KEY REFERENCES "PartialCodIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderReference" TEXT NOT NULL UNIQUE,
  "paymentFingerprint" TEXT NOT NULL UNIQUE,
  "payloadHash" TEXT NOT NULL CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  "state" TEXT NOT NULL DEFAULT 'processing' CHECK ("state" IN ('processing', 'uncertain', 'rejected', 'completed')),
  "claimToken" TEXT NOT NULL,
  "candidateOrderId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartialCodOrderAttempt_completed_ack" CHECK ("state" <> 'completed' OR "candidateOrderId" IS NOT NULL)
);
