import { calculatePartialCod, type PersonalisedLine } from "./partial-cod";
import { inrPaise } from "./partial-cod-payment";

export type CodAddress = {
  firstName: string; lastName: string; address1: string; address2: string;
  city: string; provinceCode: string; zip: string; phone: string; countryCode: "IN";
};
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || [...value].some(character => character.charCodeAt(0) < 32))
    throw new Error("Invalid checkout details");
  const result = value.trim();
  if (required && !result) throw new Error("Missing checkout details");
  return result;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid checkout details");
  return value as Record<string, unknown>;
}

/** Copies only supported fields. Client prices, taxes and discounts are never used. */
export function buildCodQuoteInput(value: unknown) {
  const data = object(value), address = object(data.address);
  if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 100)
    throw new Error("Choose between one and 100 cart lines");
  const lines: PersonalisedLine[] = data.lines.map(value => {
    const line = object(value);
    if (typeof line.variantId !== "string" || !/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/.test(line.variantId) ||
        !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 1000 ||
        !Array.isArray(line.properties) || line.properties.length > 100) throw new Error("Invalid cart line");
    const names = new Set<string>();
    return {
      variantId: line.variantId, quantity: Number(line.quantity),
      properties: line.properties.map(value => {
        const property = object(value), name = text(property.name, 255);
        if (names.has(name) || name.startsWith("_cartwala_cod_") || name === "_cartwala_order_kind")
          throw new Error("Invalid or duplicate cart property");
        names.add(name);
        return { name, value: text(property.value, 4096, false) };
      }),
    };
  });
  const shippingAddress: CodAddress = {
    firstName: text(address.firstName, 100), lastName: text(address.lastName ?? "", 100, false),
    address1: text(address.address1, 255), address2: text(address.address2 ?? "", 255, false),
    city: text(address.city, 100), provinceCode: text(address.provinceCode, 2),
    zip: text(address.zip, 6), phone: text(address.phone, 13), countryCode: "IN",
  };
  if (address.countryCode !== "IN" || !/^[1-9]\d{5}$/.test(shippingAddress.zip) ||
      !/^\+91[6-9]\d{9}$/.test(shippingAddress.phone) ||
      !/^[A-Z]{2}$/.test(shippingAddress.provinceCode)) throw new Error("Enter a valid Indian delivery address and phone");
  const discountCodes = data.discountCodes ?? [];
  if (!Array.isArray(discountCodes) || discountCodes.length > 5) throw new Error("Invalid discount codes");
  return {
    lines, shippingAddress,
    input: {
      lineItems: lines.map(line => ({ variantId: line.variantId, quantity: line.quantity,
        customAttributes: line.properties.map(property => ({ key: property.name, value: property.value })) })),
      shippingAddress, presentmentCurrencyCode: "INR", acceptAutomaticDiscounts: true,
      discountCodes: discountCodes.map(code => text(code, 255)), allowDiscountCodesInCheckout: false,
      shippingLine: { title: "Free shipping", priceWithCurrency: { amount: "0.00", currencyCode: "INR" } },
    },
  };
}

export function verifyCodQuote(value: {
  totalPriceSet: Parameters<typeof inrPaise>[0]; totalShippingPriceSet: Parameters<typeof inrPaise>[0];
  currencyCode: string; presentmentCurrencyCode: string;
}, advancePercent = 20) {
  if (value.currencyCode !== "INR" || value.presentmentCurrencyCode !== "INR" ||
      inrPaise(value.totalShippingPriceSet) !== 0) throw new Error("Unsupported COD quote");
  return calculatePartialCod(inrPaise(value.totalPriceSet), advancePercent);
}
