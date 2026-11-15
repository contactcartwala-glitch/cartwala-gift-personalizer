/** Amounts are integer paise. Use a server-calculated Shopify quote, never cart prices. */
export type CodAmounts = {
  orderPaise: number;
  advancePaise: number;
  feePaise: number;
  payableNowPaise: number;
  collectOnDeliveryPaise: number;
  totalPaise: number;
};

function money(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

// Existing intents without an explicit fee retain the historical ₹80 amount.
export function frozenCodFee(value: unknown = 8000): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000)
    throw new Error("Invalid frozen COD charge");
  return Number(value);
}

export function calculatePartialCod(orderPaise: number, advancePercent = 20, codFeePaise = 8000): CodAmounts {
  money(orderPaise, "order amount");
  if (orderPaise === 0) throw new Error("An empty order cannot use partial COD");
  if (!Number.isInteger(advancePercent) || advancePercent < 10 || advancePercent > 50)
    throw new Error("Advance percentage must be an integer between 10 and 50");
  const advancePaise = Math.floor((orderPaise * advancePercent + 50) / 100);
  const feePaise = frozenCodFee(codFeePaise);
  const collectOnDeliveryPaise = orderPaise - advancePaise;
  return {
    orderPaise, advancePaise, feePaise,
    payableNowPaise: advancePaise + feePaise,
    collectOnDeliveryPaise,
    totalPaise: orderPaise + feePaise,
  };
}

