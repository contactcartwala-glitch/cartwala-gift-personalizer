import { authenticate } from "../shopify.server";
import { buildCodQuoteInput, verifyCodQuote } from "./partial-cod-quote";
import { freezeCodAccounting, type CalculatedCodAccounting } from "./partial-cod-accounting";

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
export const CALCULATE_COD_QUOTE = `mutation CalculateCodQuote($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    userErrors { field message }
    calculatedDraftOrder {
      currencyCode presentmentCurrencyCode
      totalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      taxesIncluded
      taxLines { title rate channelLiable priceSet { shopMoney { amount currencyCode } } }
      lineItems {
        uuid variant { id } quantity taxable requiresShipping isGiftCard custom components { uuid }
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        originalTotalSet { shopMoney { amount currencyCode } }
        discountedTotalSet { shopMoney { amount currencyCode } }
        totalDiscountSet { shopMoney { amount currencyCode } }
        customAttributes { key value }
      }
    }
  }
}`;

/** No order or payment is created here. Requires an authenticated app-proxy caller. */
export async function calculateCodQuote<Collect extends boolean = false>(admin: Admin, value: unknown, advancePercent = 20, codFeePaise = 8000, collectAddressAtCheckout: Collect = false as Collect) {
  const prepared = buildCodQuoteInput(value, collectAddressAtCheckout);
  const response = await admin.graphql(CALCULATE_COD_QUOTE, { variables: { input: prepared.input } });
  const json = await response.json() as {
    errors?: unknown[];
    data?: { draftOrderCalculate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
      calculatedDraftOrder: CalculatedCodAccounting | null;
    } | null };
  };
  const result = json.data?.draftOrderCalculate;
  if (!response.ok || json.errors?.length || !result || result.userErrors.length || !result.calculatedDraftOrder)
    throw new Error("Shopify could not calculate this cart. Check the products, address and discount code.");
  const accountingSnapshot = freezeCodAccounting(result.calculatedDraftOrder, prepared.lines,
    prepared.input.lineItems.map(line => line.uuid));
  return { lines: prepared.lines, shippingAddress: prepared.shippingAddress, accountingSnapshot,
    amounts: verifyCodQuote(result.calculatedDraftOrder, advancePercent, codFeePaise), calculated: result.calculatedDraftOrder };
}

