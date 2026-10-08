CREATE TABLE "GoogleReviewSnapshot" (
  "shop" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleReviewSnapshot_pkey" PRIMARY KEY ("shop")
);
