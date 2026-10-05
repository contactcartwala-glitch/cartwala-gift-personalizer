import { authenticate } from "../shopify.server";
import { buildCodQuoteInput, verifyCodQuote } from "./partial-cod-quote";

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
export const CALCULATE_COD_QUOTE = `mutation CalculateCodQuote($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    userErrors { field message }
    calculatedDraftOrder {
      currencyCode presentmentCurrencyCode
      totalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
    }
  }
}`;

/** No order or payment is created here. Requires an authenticated app-proxy caller. */
export async function calculateCodQuote(admin: Admin, value: unknown) {
  const prepared = buildCodQuoteInput(value);
  const response = await admin.graphql(CALCULATE_COD_QUOTE, { variables: { input: prepared.input } });
  const json = await response.json() as {
    errors?: unknown[];
    data?: { draftOrderCalculate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
      calculatedDraftOrder: Parameters<typeof verifyCodQuote>[0] | null;
    } | null };
  };
  const result = json.data?.draftOrderCalculate;
  if (!response.ok || json.errors?.length || !result || result.userErrors.length || !result.calculatedDraftOrder)
    throw new Error("Shopify could not calculate this cart. Check the products, address and discount code.");
  return { lines: prepared.lines, shippingAddress: prepared.shippingAddress,
    amounts: verifyCodQuote(result.calculatedDraftOrder), calculated: result.calculatedDraftOrder };
}
