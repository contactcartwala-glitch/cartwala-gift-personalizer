CREATE TABLE "PhotoOriginalArchive" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "fileId" TEXT,
  "url" TEXT,
  "byteSize" INTEGER NOT NULL,
  "photoCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PhotoOriginalArchive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhotoOriginalArchive_shop_hash_key" ON "PhotoOriginalArchive"("shop", "hash");
CREATE INDEX "PhotoOriginalArchive_shop_deletedAt_createdAt_idx" ON "PhotoOriginalArchive"("shop", "deletedAt", "createdAt");
CREATE TABLE "PhotoOriginalArchiveOrder" (
  "archiveId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PhotoOriginalArchiveOrder_pkey" PRIMARY KEY ("archiveId", "orderId")
);
CREATE INDEX "PhotoOriginalArchiveOrder_orderId_idx" ON "PhotoOriginalArchiveOrder"("orderId");
ALTER TABLE "PhotoOriginalArchiveOrder" ADD CONSTRAINT "PhotoOriginalArchiveOrder_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "PhotoOriginalArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
