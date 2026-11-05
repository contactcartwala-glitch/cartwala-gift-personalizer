import prisma from "../db.server";
import { canEnableAdvanceCod } from "./partial-cod-settings";
import { createPaytmClient, type PaytmConfig } from "./partial-cod-paytm.server";
import type { PaytmDatabase } from "./partial-cod-paytm-store.server";

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
