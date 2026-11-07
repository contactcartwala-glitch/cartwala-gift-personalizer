import { calculatePartialCod } from "./partial-cod";

const rupees = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

/** Operator-only feasibility fixture. Never used by a customer checkout route.
 * This is an unpaid draft showing the advance as a charge, not a discount.
 * It intentionally has no real product, contact, address, tax or inventory.
 */
export function buildNativeCodPreview(orderPaise: number, percent: number, feePaise: number) {
  const amounts = calculatePartialCod(orderPaise, percent, feePaise);
  const advance = amounts.payableNowPaise - feePaise;
  return {
    amounts,
    input: {
      presentmentCurrencyCode: "INR", acceptAutomaticDiscounts: false, allowDiscountCodesInCheckout: false,
      lineItems: [
        { title: `TEST ONLY — ${percent}% advance for ₹${rupees(orderPaise)} goods`, quantity: 1,
          requiresShipping: false, taxable: false,
          originalUnitPriceWithCurrency: { amount: rupees(advance), currencyCode: "INR" },
          customAttributes: [
            { key: "Full goods amount", value: `₹${rupees(orderPaise)}` },
            { key: "Balance payable on delivery", value: `₹${rupees(amounts.collectOnDeliveryPaise)}` },
            { key: "Preview", value: "DO NOT PAY — order and courier reconciliation are not connected" },
          ] },
        ...(feePaise ? [{ title: "Extra COD charge — collected upfront", quantity: 1,
          requiresShipping: false, taxable: false,
          originalUnitPriceWithCurrency: { amount: rupees(feePaise), currencyCode: "INR" } }] : []),
      ],
      tags: ["Cartwala COD native feasibility Nov6", "TEST ONLY - DO NOT FULFILL"],
      note: "UNPAID CHECKOUT PREVIEW ONLY. Do not pay or complete. Gateway-independent advance checkout feasibility; order and courier reconciliation are not connected.",
    },
  };
}
