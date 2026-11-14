/** Customer mode is controlled separately in the authenticated Cartwala admin. */
export const NATIVE_PREVIEW_PAYMENTS_ENABLED = true;

// Only explicitly reviewed Cartwala copies can accept new customer checkouts.
export const COD_PRODUCT_AMOUNT_THEME = "188307243193";
export const COD_MOBILE_SPEED_THEME = "188523839673";
export function nativeCodThemeForPublication(originalTheme: string, publishedTheme: string | null) {
  return publishedTheme === COD_PRODUCT_AMOUNT_THEME || publishedTheme === COD_MOBILE_SPEED_THEME
    ? publishedTheme : originalTheme;
}

export type NativeCodMode = "preview" | "customer";
export function nativeCodAvailability(settings: {enabled:boolean;customerEnabled:boolean}, reviewTheme:string, publishedTheme:string|null) {
  return {
    checkoutAvailable: settings.enabled && settings.customerEnabled && publishedTheme === reviewTheme,
    previewCheckoutAvailable: NATIVE_PREVIEW_PAYMENTS_ENABLED && settings.enabled && !settings.customerEnabled &&
      publishedTheme !== null && publishedTheme !== reviewTheme,
  };
}
