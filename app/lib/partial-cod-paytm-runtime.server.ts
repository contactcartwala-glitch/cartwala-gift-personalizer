import prisma from "../db.server";
import { canEnableAdvanceCod } from "./partial-cod-settings";
import { createPaytmClient, type PaytmConfig } from "./partial-cod-paytm.server";
import type { PaytmDatabase } from "./partial-cod-paytm-store.server";
import { unauthenticated } from "../shopify.server";
import { createCodOrderFromPaidIntent } from "./partial-cod-order-store.server";

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
  if (connection.config.environment === "production" && !canEnableAdvanceCod())
    throw new Error("Live Advance COD integration is not ready");
  const { admin } = await unauthenticated.admin(connection.shop);
  return createCodOrderFromPaidIntent(paytmDatabase, admin, connection.gateway, intentId, connection.shop,
    connection.config, { allowLiveOrders: canEnableAdvanceCod(),
      shippingSyncExcluded: process.env.ADVANCE_COD_SHOPIFY_SYNC_EXCLUDED === "true" });
}
