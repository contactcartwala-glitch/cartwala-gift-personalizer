/** Customer mode is controlled separately in the authenticated Cartwala admin. */
export const NATIVE_PREVIEW_PAYMENTS_ENABLED = true;

// Legacy metadata remains compatible with existing theme scripts.
export const COD_PRODUCT_AMOUNT_THEME = "188307243193";
function isPublishedThemeId(value: string | null): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}
// App-proxy authentication restricts this feature to Cartwala. Follow its actual
// published theme so a reviewed duplicate can be published without a code release.
// Keep the original review target only for merchant preview / unknown publication.
export function nativeCodThemeForPublication(originalTheme: string, publishedTheme: string | null, customerEnabled: boolean) {
  return customerEnabled && isPublishedThemeId(publishedTheme) ? publishedTheme : originalTheme;
}

export type NativeCodMode = "preview" | "customer";
export function nativeCodAvailability(settings: {enabled:boolean;customerEnabled:boolean}, reviewTheme:string, publishedTheme:string|null) {
  return {
    checkoutAvailable: settings.enabled && settings.customerEnabled && isPublishedThemeId(publishedTheme) && publishedTheme === reviewTheme,
    previewCheckoutAvailable: NATIVE_PREVIEW_PAYMENTS_ENABLED && settings.enabled && !settings.customerEnabled &&
      isPublishedThemeId(publishedTheme) && publishedTheme !== reviewTheme,
  };
}
