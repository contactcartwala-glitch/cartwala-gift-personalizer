# Advance COD theme review — 6 November 2026

Theme: `188248228025`, **Cartwala Advance COD Review Nov6**, unpublished.
Copied from current live theme `188187869369` (Cartwala Album Variant Fix Nov5).

## Delivered

The cart page and cart drawer open one payment-choice dialog when Place Order is pressed. Full payment resumes the original cart form submission or checkout link. The previous inline `cw-partial-cod` review is removed from the duplicate cart page only. No product/editor changes.

Theme editor → Theme settings → Advance COD review controls the review ON/OFF, percentage 10–50 and preview COD charge. OFF omits the dialog and script entirely. These are explicitly **review-only theme settings**, not the server's merchant settings. They are not synchronized with `/app/advance-cod` yet.

The dialog reads the current INR cart, shows goods, advance, complete extra fee upfront, balance and total. ₹400 at 20% plus ₹50 gives ₹130 now / ₹320 delivery / ₹450 total. Values are estimates; checkout taxes, shipping and discounts must be resolved by the authoritative server quote before any advance can be charged.

Advance continuation is disabled with an explicit preview notice. This implementation makes **no gateway calls, creates no orders and sends no courier requests**. It does not implement a second checkout or certify any external payment flow. Do not publish it as a finished Advance COD feature.

## Validation

- Shopify accepted all eight files without user errors.
- Browser: cart-page popup, drawer popup by click and keyboard, selection/breakdown and disabled advance continuation.
- Browser: OFF omitted the popup; Place Order reached native Shopify checkout with ₹400 and the existing Paytm method.
- Browser: ON → Full payment reached the same native checkout. No address entered, payment initiated, or order submitted.
- Browser: 390 × 844 responsive review inspected; viewport override reset.
- JavaScript syntax check passed.
- Shopify theme validator could not run because its installed `@shopify/theme-check-common` dependency is missing. Do not describe this as a completed theme-check run.

## Remaining before a complete merchant payment test

Connect supported payment flow and authoritative server admin settings; isolate test payment/order/courier effects; configure Paytm staging merchant binding and verify real staging transaction callbacks; confirm NimbusPost exact remaining-balance mapping and automatic-sync exclusion; complete cancellation/refund coordination and reconcile fees/taxes/discounts. The full backend draft and all production readiness gates remain unchanged.

Live theme, live app deployment, Paytm configuration, NimbusPost channels and existing orders were not changed by this theme review. Only this unpublished theme's files were updated. Merchant approval after complete testing is required before publishing.
