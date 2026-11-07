import { buildCodShipment, type CodIntent } from "./partial-cod";
import type { CodAddress } from "./partial-cod-quote";

export type NimbusParcel = { weightKg: number; lengthCm: number; widthCm: number; heightCm: number };
export type NimbusItem = { name: string; sku: string; quantity: number; unitPricePaise: number };

/** These values must come from a verified order, never the storefront request. */
export function buildNimbusCodOrder(intent: CodIntent, fulfillment: {
  warehouseId: string; address: CodAddress; parcel: NimbusParcel; items: NimbusItem[];
  shopifySyncExcluded: boolean;
}) {
  if (!fulfillment.shopifySyncExcluded) throw new Error("Exclude this order from automatic Shopify shipping sync first");
  const shipment = buildCodShipment(intent, { excludesDepositOrders: true, supportsExplicitCodAmount: true });
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(intent.id) ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(fulfillment.warehouseId)) throw new Error("Invalid shipping reference");
  if (!fulfillment.items.length || fulfillment.items.length > 100) throw new Error("Invalid shipping items");
  const items = fulfillment.items.map(item => {
    if (!item.name.trim() || item.name.length > 255 || item.sku.length > 255 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000 ||
        !Number.isSafeInteger(item.unitPricePaise) || item.unitPricePaise < 0 || item.unitPricePaise > 100_000_000)
      throw new Error("Invalid shipping item");
    return { name: item.name, sku: item.sku, qty: item.quantity, price: item.unitPricePaise / 100 };
  });
  // Tax/discount allocation must be reconciled before dispatch. Never silently change goods value.
  if (fulfillment.items.reduce((sum, item) => sum + item.quantity * item.unitPricePaise, 0) !== shipment.declaredOrderPaise)
    throw new Error("Shipping item values do not match the verified merchandise total");
  const p = fulfillment.parcel;
  if (![p.weightKg, p.lengthCm, p.widthCm, p.heightCm].every(n => Number.isFinite(n) && n > 0) ||
      p.weightKg > 100 || Math.max(p.lengthCm, p.widthCm, p.heightCm) > 300)
    throw new Error("Invalid package measurements");
  const a = fulfillment.address;
  if (a.countryCode !== "IN" || !/^\+91[6-9]\d{9}$/.test(a.phone) || !/^[1-9]\d{5}$/.test(a.zip) ||
      !/^[A-Z]{2}$/.test(a.provinceCode) || !a.firstName.trim() || !a.address1.trim() || !a.city.trim())
    throw new Error("Invalid shipping address");
  return {
    order_number: `CW-COD-${intent.id}`, order_type: "b2c", payment_mode: "cod",
    order_collectable_amount: shipment.collectPaise / 100,
    warehouse_id: fulfillment.warehouseId,
    shipping_address: {
      name: `${a.firstName} ${a.lastName}`.trim(), address: a.address1, address_opt: a.address2,
      city: a.city, state: a.provinceCode, country: "India", pincode: Number(a.zip), phone: Number(a.phone.slice(3)),
    },
    items, package: { weight: p.weightKg, length: p.lengthCm, width: p.widthCm, height: p.heightCm },
  };
}

export type NimbusCodOrder = ReturnType<typeof buildNimbusCodOrder>;

/** Fail closed unless a provider order re-read acknowledges the exact remaining amount. */
export function verifyNimbusCodOrder(expected: NimbusCodOrder, provider: unknown) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) throw new Error("Invalid NimbusPost order response");
  const value = provider as Record<string, unknown>;
  const raw = value.order_collectable_amount;
  if ((typeof raw !== "string" && typeof raw !== "number") ||
      !/^\d+(\.\d{1,2})?$/.test(String(raw)) ||
      value.order_number !== expected.order_number || value.payment_mode !== "cod" ||
      Math.round(Number(raw) * 100) !== Math.round(expected.order_collectable_amount * 100))
    throw new Error("NimbusPost has not acknowledged the exact COD balance");
  return { orderNumber: expected.order_number, collectPaise: Math.round(expected.order_collectable_amount * 100) };
}
