import { randomUUID } from "node:crypto";
import { calculatePartialCod, type PersonalisedLine } from "./partial-cod";
import { inrPaise } from "./partial-cod-payment";

type Money = Parameters<typeof inrPaise>[0];
export type FrozenCodLine = PersonalisedLine & {
  quoteLineId: string; unitPaise: number; taxable: boolean; requiresShipping: boolean;
};
export type FrozenCodAccounting = {
  version: 1; orderPaise: number; taxesIncluded: boolean; taxPaise: number;
  taxLines: Array<{ title: string; rate: number; paise: number; channelLiable: boolean | null }>;
  lines: FrozenCodLine[];
};
export type CalculatedCodAccounting = {
  currencyCode: string; presentmentCurrencyCode: string; taxesIncluded: boolean;
  totalPriceSet: Money; totalShippingPriceSet: Money; totalDiscountsSet: Money; totalTaxSet: Money;
  taxLines: Array<{ title: string; rate: number | null; priceSet: Money; channelLiable: boolean | null }>;
  lineItems: Array<{
    uuid: string; variant: { id: string } | null; quantity: number; taxable: boolean;
    requiresShipping: boolean; isGiftCard: boolean; custom: boolean; components: unknown[];
    originalUnitPriceSet: Money; originalTotalSet: Money; discountedTotalSet: Money; totalDiscountSet: Money;
    customAttributes: Array<{ key: string; value: string }>;
  }>;
};
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function fail(): never { throw new Error("This cart cannot use Advance COD. Use prepaid checkout."); }
const hasControl = (value: string) => [...value].some(c => c.charCodeAt(0) < 32);
function safeMoney(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100_000_000) fail();
  return Number(value);
}
function propertyKey(properties: ReadonlyArray<{ name: string; value: string }>) {
  return JSON.stringify([...properties].sort((a, b) => a.name.localeCompare(b.name)));
}

/** Retain exact server prices/taxes. Unsupported discounts/bundles stop before payment. */
export function freezeCodAccounting(calculated: CalculatedCodAccounting,
  source: ReadonlyArray<PersonalisedLine>, lineIds: ReadonlyArray<string>, allowMerchandiseDiscount = false): FrozenCodAccounting {
  if (calculated.currencyCode !== "INR" || calculated.presentmentCurrencyCode !== "INR" ||
      inrPaise(calculated.totalShippingPriceSet) !== 0 || (!allowMerchandiseDiscount && inrPaise(calculated.totalDiscountsSet) !== 0) ||
      !Array.isArray(calculated.lineItems) || calculated.lineItems.length !== source.length ||
      source.length !== lineIds.length || new Set(lineIds).size !== lineIds.length) fail();
  const byId = new Map(calculated.lineItems.map(line => [line.uuid, line]));
  if (byId.size !== source.length) fail();
  let allocatedDiscount = 0;
  const lines = source.flatMap((line, index) => {
    const priced = byId.get(lineIds[index]);
    if (!priced || priced.variant?.id !== line.variantId || priced.quantity !== line.quantity ||
        priced.custom || priced.isGiftCard || !Array.isArray(priced.components) || priced.components.length ||
        propertyKey(priced.customAttributes.map(p => ({ name: p.key, value: p.value }))) !== propertyKey(line.properties)) fail();
    const unitPaise = inrPaise(priced.originalUnitPriceSet);
    const original = inrPaise(priced.originalTotalSet), discounted = inrPaise(priced.discountedTotalSet);
    const discount = inrPaise(priced.totalDiscountSet);
    if (unitPaise * line.quantity !== original || original - discounted !== discount ||
        (!allowMerchandiseDiscount && discount !== 0)) fail();
    allocatedDiscount += discount;
    const low = Math.floor(discounted / line.quantity), extra = discounted % line.quantity;
    const net = { ...line, quoteLineId: lineIds[index], unitPaise: low,
      taxable: priced.taxable, requiresShipping: priced.requiresShipping };
    return extra ? [{ ...net, quantity: line.quantity - extra },
      { ...net, quoteLineId: randomUUID(), unitPaise: low + 1, quantity: extra }] : [net];
  });
  if (allocatedDiscount !== inrPaise(calculated.totalDiscountsSet)) fail();
  return readCodAccounting({ version: 1, orderPaise: inrPaise(calculated.totalPriceSet),
    taxesIncluded: calculated.taxesIncluded, taxPaise: inrPaise(calculated.totalTaxSet),
    taxLines: calculated.taxLines.map(t => ({ title: t.title, rate: t.rate, paise: inrPaise(t.priceSet),
      channelLiable: t.channelLiable })), lines });
}

/** Revalidate persisted JSON; old quotes without a complete snapshot cannot enter payment/order creation. */
export function readCodAccounting(value: unknown, expectedPaise?: number): FrozenCodAccounting {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const row = value as FrozenCodAccounting;
  if (row.version !== 1 || typeof row.taxesIncluded !== "boolean" || !Array.isArray(row.lines) ||
      row.lines.length < 1 || row.lines.length > 100 || !Array.isArray(row.taxLines) || row.taxLines.length > 20) fail();
  const orderPaise = safeMoney(row.orderPaise), taxPaise = safeMoney(row.taxPaise);
  if (!orderPaise || (expectedPaise !== undefined && orderPaise !== expectedPaise)) fail();
  const ids = new Set<string>();
  const lines = row.lines.map(line => {
    if (!line || !uuid.test(line.quoteLineId) || ids.has(line.quoteLineId) ||
        !/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/.test(line.variantId) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000 ||
        typeof line.taxable !== "boolean" || typeof line.requiresShipping !== "boolean" ||
        !Array.isArray(line.properties) || line.properties.length > 100) fail();
    ids.add(line.quoteLineId);
    const names = new Set<string>();
    const properties = line.properties.map(p => {
      if (!p || typeof p.name !== "string" || !p.name || p.name.length > 255 ||
          typeof p.value !== "string" || p.value.length > 4096 || names.has(p.name) ||
          hasControl(p.name + p.value) || p.name.startsWith("_cartwala_cod_") ||
          p.name === "_cartwala_order_kind") fail();
      names.add(p.name); return { name: p.name, value: p.value };
    });
    return { variantId: line.variantId, quoteLineId: line.quoteLineId, quantity: line.quantity,
      unitPaise: safeMoney(line.unitPaise), taxable: line.taxable, requiresShipping: line.requiresShipping, properties };
  });
  if (!lines.some(line => line.requiresShipping)) fail();
  const taxLines = row.taxLines.map(t => {
    if (!t || typeof t.title !== "string" || !t.title || t.title.length > 255 ||
        hasControl(t.title) || !Number.isFinite(t.rate) || t.rate < 0 || t.rate > 1 ||
        (t.channelLiable !== null && typeof t.channelLiable !== "boolean")) fail();
    return { title: t.title, rate: t.rate, paise: safeMoney(t.paise), channelLiable: t.channelLiable };
  });
  const merchandise = lines.reduce((sum, line) => sum + line.quantity * line.unitPaise, 0);
  if (!Number.isSafeInteger(merchandise) || taxLines.reduce((sum, t) => sum + t.paise, 0) !== taxPaise ||
      (taxPaise > 0 && !lines.some(line => line.taxable)) ||
      merchandise + (row.taxesIncluded ? 0 : taxPaise) !== orderPaise) fail();
  // Also enforces the same order limits as payment/courier amounts.
  calculatePartialCod(orderPaise);
  return { version: 1, orderPaise, taxesIncluded: row.taxesIncluded, taxPaise, taxLines, lines };
}
