import { nativeCodGraphql, type NativeCodAdmin } from "./native-cod-payment.server";

export const COD_DISCOUNT_SCOPE = "read_discounts";
export const validCodCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

let cachedAccess: {shop:string;value:boolean;until:number} | undefined;
export async function hasNativeCodDiscountAccess(admin: NativeCodAdmin, shop:string) {
  if(cachedAccess?.shop===shop && cachedAccess.until>Date.now())return cachedAccess.value;
  const result = await nativeCodGraphql(admin, `query NativeCodDiscountAccess {
    currentAppInstallation { accessScopes { handle } }
  }`, {});
  const value=result.currentAppInstallation?.accessScopes?.some((scope: {handle: string}) => scope.handle === COD_DISCOUNT_SCOPE) === true;
  cachedAccess={shop,value,until:Date.now()+60_000};return value;
}

/** Price overrides do not redeem a Shopify code; use only unlimited public merchandise discounts. */
export async function authorizeNativeCodDiscount(admin: NativeCodAdmin, code: unknown) {
  if (!validCodCode(code)) throw new Error("Invalid discount code");
  const result = await nativeCodGraphql(admin, `query NativeCodDiscountRule($code:String!) {
    codeDiscountNodeByCode(code:$code) { codeDiscount { __typename ... on DiscountCodeBasic {
      status usageLimit appliesOncePerCustomer context { __typename }
    } } }
  }`, {code});
  const d = result.codeDiscountNodeByCode?.codeDiscount;
  if (d?.__typename !== "DiscountCodeBasic" || d.status !== "ACTIVE" || d.usageLimit !== null ||
      d.appliesOncePerCustomer !== false || d.context?.__typename !== "DiscountBuyerSelectionAll")
    throw new Error("Use full payment for this discount code");
  return code;
}
