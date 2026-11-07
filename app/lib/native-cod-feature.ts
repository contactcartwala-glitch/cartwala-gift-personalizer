/** Customer mode is controlled separately in the authenticated Cartwala admin. */
export const NATIVE_PREVIEW_PAYMENTS_ENABLED = true;

// Keep the original theme working until the merchant publishes this specific copy.
export const COD_PRODUCT_AMOUNT_THEME = "188307243193";
export function nativeCodThemeForPublication(originalTheme: string, publishedTheme: string | null) {
  return publishedTheme === COD_PRODUCT_AMOUNT_THEME ? COD_PRODUCT_AMOUNT_THEME : originalTheme;
}

export type NativeCodMode = "preview" | "customer";
export function nativeCodAvailability(settings: {enabled:boolean;customerEnabled:boolean}, reviewTheme:string, publishedTheme:string|null) {
  return {
    checkoutAvailable: settings.enabled && settings.customerEnabled && publishedTheme === reviewTheme,
    previewCheckoutAvailable: NATIVE_PREVIEW_PAYMENTS_ENABLED && settings.enabled && !settings.customerEnabled &&
      publishedTheme !== null && publishedTheme !== reviewTheme,
  };
}
