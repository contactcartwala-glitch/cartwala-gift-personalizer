CREATE TABLE "CodAccountingDiagnostic" (
  "id" TEXT PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'processing' CHECK ("state" IN ('processing','uncertain','rejected','mismatch','confirmed')),
  "claimToken" TEXT NOT NULL,
  "orderId" TEXT UNIQUE,
  "observed" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("state" NOT IN ('confirmed','mismatch') OR "orderId" IS NOT NULL)
);
