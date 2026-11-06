import { calculatePartialCod } from "./partial-cod-amounts";

const inr = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2,
}).format(paise / 100);

/** Display projection only. Amounts come from the frozen server quote.
 * These fields do not constitute payment proof or change Shopify financial status.
 * Only attach them after authenticated payment verification (or in an explicit TEST fixture).
 */
export function codOrderBreakdown(orderPaise: number, advancePercent: number, codFeePaise: number) {
  const amounts = calculatePartialCod(orderPaise, advancePercent, codFeePaise);
  return {
    amounts,
    attributes: [
      { key: "Goods value", value: inr(amounts.orderPaise) },
      { key: "Advance COD", value: `${inr(amounts.advancePaise)} (${advancePercent}%)` },
      { key: "Shipping / COD charge", value: inr(amounts.feePaise) },
      { key: "Total order value", value: inr(amounts.totalPaise) },
      { key: "Online amount received", value: inr(amounts.payableNowPaise) },
      { key: "Remaining COD balance", value: inr(amounts.collectOnDeliveryPaise) },
    ],
  };
}
