import { codOrderBreakdown } from "./cod-order-breakdown";

export const COD_BREAKDOWN_TEST_REFERENCE = "CARTWALA-COD-400-50-20261106-V1";
const bag = (paise: number) => ({ shopMoney: { amount: (paise / 100).toFixed(2), currencyCode: "INR" } });

/** Operator-only TEST import. No customer endpoint, provider call, stock or real payment.
 * Search the fixed tag before posting. Never retry an uncertain orderCreate.
 */
export function codBreakdownTestPayload() {
  const { amounts, attributes } = codOrderBreakdown(40000, 20, 5000);
  return {
    order: {
      test: true, currency: "INR", presentmentCurrency: "INR",
      sourceIdentifier: COD_BREAKDOWN_TEST_REFERENCE,
      tags: [COD_BREAKDOWN_TEST_REFERENCE, "CARTWALA TEST - DO NOT SHIP"],
      note: "ACCOUNTING TEST ONLY. ₹130 is a simulated TEST transaction; no real customer payment. Not a native checkout test. Do not fulfill or ship.",
      taxesIncluded: false, taxLines: [],
      customAttributes: [...attributes, { key: "Test only", value: "No real payment — do not ship" }],
      lineItems: [{ title: "Cartwala ₹400 goods — TEST ONLY", quantity: 1,
        priceSet: bag(amounts.orderPaise), taxable: false, requiresShipping: false }],
      shippingLines: [{ title: "Shipping / COD charge — TEST ONLY", code: "cartwala_cod_test_charge",
        priceSet: bag(amounts.feePaise), taxLines: [] }],
      transactions: [{ test: true, kind: "SALE", status: "SUCCESS",
        gateway: "Cartwala TEST accounting (no real payment)", amountSet: bag(amounts.payableNowPaise),
        receiptJson: { accountingTestOnly: true, noRealPayment: true,
          advancePaise: amounts.advancePaise, chargePaise: amounts.feePaise } }],
    },
    options: { inventoryBehaviour: "BYPASS", sendReceipt: false, sendFulfillmentReceipt: false },
  };
}
