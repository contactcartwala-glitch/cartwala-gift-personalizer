CREATE TABLE "PartialCodPaytmAttempt" (
  "intentId" TEXT NOT NULL PRIMARY KEY REFERENCES "PartialCodIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderId" TEXT NOT NULL UNIQUE,
  "environment" TEXT NOT NULL CHECK ("environment" IN ('staging', 'production')),
  "merchantId" TEXT NOT NULL,
  "payableNowPaise" INTEGER NOT NULL CHECK ("payableNowPaise" >= 8000),
  "state" TEXT NOT NULL DEFAULT 'created' CHECK ("state" IN ('created', 'initiating', 'ready', 'uncertain', 'failed', 'paid')),
  "claimToken" TEXT,
  "transactionId" TEXT,
  "paymentFingerprint" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3),
  CONSTRAINT "paytm_paid_proof" CHECK (
    ("state" = 'paid' AND "transactionId" IS NOT NULL AND "paymentFingerprint" IS NOT NULL)
    OR ("state" <> 'paid' AND "transactionId" IS NULL AND "paymentFingerprint" IS NULL)
  )
);

