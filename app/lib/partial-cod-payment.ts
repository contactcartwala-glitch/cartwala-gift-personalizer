import { calculatePartialCod } from "./partial-cod";

type Money = { shopMoney: { amount: string; currencyCode: string } };
export type DepositSnapshot = {
  id: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  test: boolean;
  customAttributes: { key: string; value: string }[];
  totalPriceSet: Money;
  totalReceivedSet: Money;
  totalRefundedSet: Money;
  transactions: { id: string; kind: string; status: string; test: boolean; amountSet: Money }[];
};

export function inrPaise(value: Money): number {
  const { amount, currencyCode } = value.shopMoney;
  if (currencyCode !== "INR" || !/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("Invalid INR amount");
  const [whole, fraction = ""] = amount.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise > 100_008_000) throw new Error("Amount exceeds policy");
  return paise;
}

export function verifyDepositSnapshot(expected: {
  intentId: string; orderPaise: number; advancePercent?: number; linkedDraftOrderId: string | null;
}, order: DepositSnapshot) {
  const attrs = order.customAttributes;
  const kind = attrs.filter(a => a.key === "_cartwala_order_kind");
  const intent = attrs.filter(a => a.key === "_cartwala_cod_intent");
  if (kind.length !== 1 || kind[0].value !== "partial_cod_deposit" ||
      intent.length !== 1 || intent[0].value !== expected.intentId ||
      expected.linkedDraftOrderId !== order.id || order.cancelledAt || order.test ||
      order.displayFinancialStatus !== "PAID") throw new Error("Deposit identity or payment state is invalid");
  const now = calculatePartialCod(expected.orderPaise, expected.advancePercent ?? 20).payableNowPaise;
  if (inrPaise(order.totalPriceSet) !== now || inrPaise(order.totalReceivedSet) !== now ||
      inrPaise(order.totalRefundedSet) !== 0) throw new Error("Deposit totals do not match");
  if (order.transactions.some(t => t.test || ["REFUND", "VOID"].includes(t.kind) && t.status === "SUCCESS")) {
    throw new Error("Deposit is test, voided or refunded");
  }
  const payments = order.transactions.filter(t => ["SALE", "CAPTURE"].includes(t.kind) && t.status === "SUCCESS");
  const ids = payments.map(t => t.id);
  if (!ids.length || ids.some(id => !id) || new Set(ids).size !== ids.length ||
      payments.reduce((sum, t) => sum + inrPaise(t.amountSet), 0) !== now) throw new Error("Successful captures do not match");
  return { orderId: order.id, fingerprint: ids.sort().join("|"), transactionIds: ids };
}
