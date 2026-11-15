CREATE TABLE "NativeCodCheckout" (
 "id" TEXT PRIMARY KEY,
 "shop" TEXT NOT NULL,
 "quote" JSONB NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'creating' CHECK ("state" IN ('creating','ready','editing','completed','needs_review')),
 "draftId" TEXT UNIQUE,
 "orderId" TEXT UNIQUE,
 "editClaim" TEXT,
 "calculatedId" TEXT,
 "fingerprint" TEXT UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NativeCodCheckout_shop_state_idx" ON "NativeCodCheckout" ("shop","state");
