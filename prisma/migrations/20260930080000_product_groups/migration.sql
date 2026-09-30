CREATE TABLE "ProductGroupSettings" (
    "shopId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductGroupSettings_pkey" PRIMARY KEY ("shopId")
);
