CREATE TABLE "PartialCodIntent" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'awaiting_payment',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "orderPaise" INTEGER NOT NULL,
  "payableNowPaise" INTEGER NOT NULL,
  "collectPaise" INTEGER NOT NULL,
  "lines" JSONB NOT NULL,
  "shippingAddress" JSONB NOT NULL,
  "depositDraftId" TEXT,
  "depositOrderId" TEXT,
  "paymentFingerprint" TEXT,
  "codOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartialCodIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartialCodIntent_amounts_check" CHECK (
    "orderPaise" > 0 AND "orderPaise" <= 100000000 AND "currency" = 'INR'
    AND "payableNowPaise" = (("orderPaise" + 2) / 5) + 8000
    AND "collectPaise" = "orderPaise" - (("orderPaise" + 2) / 5)
  )
);
CREATE UNIQUE INDEX "PartialCodIntent_shop_requestKey_key" ON "PartialCodIntent"("shop", "requestKey");
CREATE UNIQUE INDEX "PartialCodIntent_depositDraftId_key" ON "PartialCodIntent"("depositDraftId");
CREATE UNIQUE INDEX "PartialCodIntent_depositOrderId_key" ON "PartialCodIntent"("depositOrderId");
CREATE UNIQUE INDEX "PartialCodIntent_paymentFingerprint_key" ON "PartialCodIntent"("paymentFingerprint");
CREATE UNIQUE INDEX "PartialCodIntent_codOrderId_key" ON "PartialCodIntent"("codOrderId");
CREATE INDEX "PartialCodIntent_shop_state_createdAt_idx" ON "PartialCodIntent"("shop", "state", "createdAt");
CREATE TABLE "PartialCodOutbox" (
  "id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ready',
  "claimToken" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartialCodOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartialCodOutbox_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PartialCodIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartialCodOutbox_intentId_key" ON "PartialCodOutbox"("intentId");
