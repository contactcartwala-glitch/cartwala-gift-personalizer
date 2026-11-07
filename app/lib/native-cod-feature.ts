/** Customer mode is controlled separately in the authenticated Cartwala admin. */
export const NATIVE_PREVIEW_PAYMENTS_ENABLED = true;

export type NativeCodMode = "preview" | "customer";
export function nativeCodAvailability(settings: {enabled:boolean;customerEnabled:boolean}, reviewTheme:string, publishedTheme:string|null) {
  return {
    checkoutAvailable: settings.enabled && settings.customerEnabled && publishedTheme === reviewTheme,
    previewCheckoutAvailable: NATIVE_PREVIEW_PAYMENTS_ENABLED && settings.enabled && !settings.customerEnabled &&
      publishedTheme !== null && publishedTheme !== reviewTheme,
  };
}
