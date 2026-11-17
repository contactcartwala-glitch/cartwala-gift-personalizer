import { createHmac, timingSafeEqual } from "node:crypto";

const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function sign(payload: string, secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error("Checkout access signing is not configured");
  return createHmac("sha256", secret).update(`cartwala-cod-access-v1:${payload}`).digest("base64url");
}
/** A bearer capability contains no address, photo, payment token or provider credential. */
export function issueCodAccess(shop: string, id: string, secret: string, now = Date.now()) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !idPattern.test(id)) throw new Error("Invalid checkout");
  const payload = Buffer.from(JSON.stringify({ shop, id, expires: Math.floor(now / 1000) + 7 * 86400 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}
export function readCodAccess(token: unknown, shop: string, secret: string, now = Date.now()) {
  if (typeof token !== "string" || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("Invalid checkout access");
  const [payload, signature] = token.split(".");
  const expected = sign(payload, secret);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid checkout access");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (value.shop !== shop || !idPattern.test(value.id) || !Number.isSafeInteger(value.expires) ||
      value.expires <= Math.floor(now / 1000) || value.expires > Math.floor(now / 1000) + 7 * 86400)
    throw new Error("Checkout access expired or belongs to another shop");
  return value.id as string;
}
