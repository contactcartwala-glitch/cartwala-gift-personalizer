import prisma from "../db.server";
import { canEnableAdvanceCod } from "./partial-cod-settings";
import { createPaytmClient, type PaytmConfig } from "./partial-cod-paytm.server";
import type { PaytmDatabase } from "./partial-cod-paytm-store.server";
import { unauthenticated } from "../shopify.server";
import { createCodOrderFromPaidIntent, reconcilePaidCodOrder } from "./partial-cod-order-store.server";
import { progressCodCheckout, startCodCheckout } from "./partial-cod-checkout.server";
import type { AdvanceCodSettings } from "./partial-cod-settings";

export const paytmDatabase: PaytmDatabase = {
  query: <T>(sql: string, parameters: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...parameters),
};

/** One merchant account is explicitly bound to one shop. Never select credentials from request data. */
export function configuredPaytm() {
  const shop = process.env.PAYTM_SHOP || "";
  const environment = process.env.PAYTM_ENVIRONMENT;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
      (environment !== "production" && environment !== "staging"))
    throw new Error("Paytm shop/environment binding is not configured");
  const config: PaytmConfig = {
    mid: process.env.PAYTM_MID || "", merchantKey: process.env.PAYTM_MERCHANT_KEY || "",
    environment, appOrigin: process.env.SHOPIFY_APP_URL || "", allowLiveInitiation: canEnableAdvanceCod(),
  };
  return { shop, config, gateway: createPaytmClient(config) };
}

/** Internal worker entry point only; shop/account are never taken from a public request. */
export async function createConfiguredPaidCodOrder(intentId: string) {
  const connection = configuredPaytm();
  if (process.env.ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED !== "true")
    throw new Error("Automatic shipping sync exclusion is not confirmed");
  if (connection.config.environment === "production" && !canEnableAdvanceCod())
    throw new Error("Live Advance COD integration is not ready");
  const { admin } = await unauthenticated.admin(connection.shop);
  // An abandoned in-flight attempt is never re-posted. Only its saved candidate can be read back.
  await paytmDatabase.query(`UPDATE "PartialCodOrderAttempt" SET "state"='uncertain',"updatedAt"=CURRENT_TIMESTAMP
    WHERE "intentId"=$1 AND "state"='processing' AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '90 seconds' RETURNING "intentId"`, [intentId]);
  const attempts = await paytmDatabase.query<{ state: string; candidateOrderId: string | null }>(
    `SELECT "state","candidateOrderId" FROM "PartialCodOrderAttempt" WHERE "intentId"=$1`, [intentId]);
  if (attempts[0]?.state === "uncertain") {
    if (!attempts[0].candidateOrderId) throw new Error("Find the original Shopify order before recovery");
    return reconcilePaidCodOrder(paytmDatabase, admin, connection.gateway, intentId, connection.shop, connection.config);
  }
  return createCodOrderFromPaidIntent(paytmDatabase, admin, connection.gateway, intentId, connection.shop,
    connection.config, { allowLiveOrders: canEnableAdvanceCod(),
      shippingSyncExcluded: process.env.ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED === "true" });
}

export function codCheckoutAvailable(shop: string, settings: AdvanceCodSettings) {
  if (!settings.enabled) return false;
  try {
    const connection = configuredPaytm();
    if (shop !== connection.shop || process.env.ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED !== "true" ||
        Buffer.byteLength(process.env.SHOPIFY_API_SECRET || "") < 32) return false;
    return connection.config.environment === "staging"
      ? process.env.ADVANCE_COD_STAGING_ENABLED === "true"
      : settings.enabled && canEnableAdvanceCod();
  } catch { return false; }
}

export async function startConfiguredCodCheckout(shop: string, id: string, settings: AdvanceCodSettings) {
  if (!codCheckoutAvailable(shop, settings)) throw new Error("Advance checkout is unavailable");
  const connection = configuredPaytm();
  return startCodCheckout(paytmDatabase, connection.gateway, shop, id, connection.config);
}

/** Recovery remains available after disabling new checkouts. */
export async function progressConfiguredCodCheckout(shop: string, id: string) {
  const connection = configuredPaytm();
  if (shop !== connection.shop) throw new Error("Unknown checkout shop");
  return progressCodCheckout(paytmDatabase, connection.gateway, shop, id, connection.config, createConfiguredPaidCodOrder);
}

/** A scheduler can recover dropped callbacks. The payment lease and order claim remain shared across workers. */
export async function recoverConfiguredCodBatch() {
  const connection = configuredPaytm();
  const rows = await paytmDatabase.query<{ id: string }>(`SELECT i."id" FROM "PartialCodIntent" i
    JOIN "PartialCodPaytmAttempt" a ON a."intentId"=i."id"
    WHERE i."shop"=$1 AND a."merchantId"=$2 AND a."environment"=$3
      AND i."state" IN ('awaiting_payment','paid') AND a."state" IN ('initiating','ready','uncertain','paid')
      AND (a."lastCheckedAt" IS NULL OR a."lastCheckedAt" < CURRENT_TIMESTAMP - INTERVAL '60 seconds')
    ORDER BY a."lastCheckedAt" ASC NULLS FIRST,i."createdAt" ASC LIMIT 10`,
  [connection.shop, connection.config.mid, connection.config.environment]);
  const counts = { checked: 0, confirmed: 0, pending: 0, review: 0 };
  // Two workers bound memory, provider traffic and run duration. Each provider call already has a timeout.
  const run = async (items: typeof rows) => {
    for (const row of items) {
      counts.checked++;
      try {
        const result = await progressConfiguredCodCheckout(connection.shop, row.id);
        if (result.state === "order_confirmed") counts.confirmed++;
        else if (["payment_pending", "paid_order_pending"].includes(result.state)) counts.pending++;
        else counts.review++;
      } catch { counts.review++; }
    }
  };
  await Promise.all([run(rows.filter((_, i) => i % 2 === 0)), run(rows.filter((_, i) => i % 2 === 1))]);
  return counts;
}
