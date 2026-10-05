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

export function calculatePartialCod(orderPaise: number): CodAmounts {
  money(orderPaise, "order amount");
  if (orderPaise === 0) throw new Error("An empty order cannot use partial COD");
  const advancePaise = Math.floor((orderPaise + 2) / 5);
  const feePaise = 8000;
  const collectOnDeliveryPaise = orderPaise - advancePaise;
  return {
    orderPaise, advancePaise, feePaise,
    payableNowPaise: advancePaise + feePaise,
    collectOnDeliveryPaise,
    totalPaise: orderPaise + feePaise,
  };
}

export type PersonalisedLine = {
  variantId: string;
  quantity: number;
  properties: ReadonlyArray<{ name: string; value: string }>;
};

export type CodIntent = {
  id: string;
  shop: string;
  currency: "INR";
  amounts: CodAmounts;
  lines: ReadonlyArray<PersonalisedLine>;
  depositOrderId: string;
  state: "awaiting_payment" | "paid" | "cod_order_created" | "cancelled" | "refunded";
  paidTransactionId?: string;
  codOrderId?: string;
};

/** Obtain this proof from an authenticated Shopify webhook AND an Admin API re-read. */
export type VerifiedDeposit = {
  shop: string;
  orderId: string;
  transactionId: string;
  intentId: string;
  currency: string;
  paidPaise: number;
  status: "paid" | "pending" | "failed" | "refunded";
};

export function acceptDeposit(intent: CodIntent, proof: VerifiedDeposit): CodIntent {
  if (proof.shop !== intent.shop || proof.orderId !== intent.depositOrderId ||
      proof.intentId !== intent.id || proof.currency !== intent.currency ||
      !proof.transactionId || proof.status !== "paid" ||
      proof.paidPaise !== intent.amounts.payableNowPaise) {
    throw new Error("Deposit does not match this order");
  }
  if (["cancelled", "refunded"].includes(intent.state)) throw new Error("Order is closed");
  if (intent.paidTransactionId) {
    if (intent.paidTransactionId !== proof.transactionId) throw new Error("Different deposit already recorded");
    return intent;
  }
  if (intent.state !== "awaiting_payment") throw new Error("Invalid payment state");
  return { ...intent, state: "paid", paidTransactionId: proof.transactionId };
}

export type ShippingCapabilities = {
  excludesDepositOrders: boolean;
  supportsExplicitCodAmount: boolean;
};

/** Neutral adapter contract. Provider-specific mapping and acknowledgment are mandatory. */
export function buildCodShipment(intent: CodIntent, capabilities: ShippingCapabilities) {
  if (!capabilities.excludesDepositOrders || !capabilities.supportsExplicitCodAmount) {
    throw new Error("Shipping integration has not been verified for partial COD");
  }
  if (intent.state !== "cod_order_created" || !intent.codOrderId || !intent.paidTransactionId) {
    throw new Error("A verified deposit and a linked COD order are required");
  }
  const amounts = calculatePartialCod(intent.amounts.orderPaise);
  if ((Object.keys(amounts) as Array<keyof CodAmounts>).some(key => amounts[key] !== intent.amounts[key])) {
    throw new Error("Stored order amounts do not match policy");
  }
  return {
    idempotencyKey: `partial-cod:${intent.shop}:${intent.id}`,
    orderId: intent.codOrderId,
    paymentType: "COD" as const,
    currency: intent.currency,
    collectPaise: amounts.collectOnDeliveryPaise,
    declaredOrderPaise: amounts.orderPaise,
    prepaidPaise: amounts.payableNowPaise,
    lines: intent.lines.map(line => ({
      variantId: line.variantId,
      quantity: line.quantity,
      properties: line.properties.map(property => ({ ...property })),
    })),
  };
}

/** Deposit checkout must contain no physical product and no shipping charge. */
export function buildDepositLine(intent: CodIntent) {
  if (intent.state !== "awaiting_payment") throw new Error("Deposit checkout is closed");
  return {
    title: "Cartwala advance payment and COD charge",
    quantity: 1,
    requiresShipping: false,
    amountPaise: intent.amounts.payableNowPaise,
    currency: intent.currency,
    customAttributes: [
      { key: "_cartwala_order_kind", value: "partial_cod_deposit" },
      { key: "_cartwala_cod_intent", value: intent.id },
    ],
  };
}
