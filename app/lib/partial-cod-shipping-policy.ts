/** One Shopify order is imported by the existing NimbusPost Shopify channel.
 * No direct courier creation/booking is performed in this checkout path.
 * Each imported balance must still be checked before a shipment is booked.
 */
export function requireCodShippingPath(value: unknown): "shopify_auto" {
  if (value !== "shopify_auto") throw new Error("Confirm the single Shopify automatic shipping path before creating an order");
  return value;
}
