# Advance COD theme review — 6 November 2026

Theme: `188248228025`, **Cartwala Advance COD Review Nov6**, unpublished.
Copied from current live theme `188187869369` (Cartwala Album Variant Fix Nov5).

## Delivered

The cart page and cart drawer open one payment-choice dialog when Place Order is pressed. Full payment resumes the original cart form submission or checkout link. The previous inline `cw-partial-cod` review is removed from the duplicate cart page only. No product/editor changes.

Shopify admin → Apps → Cartwala Gift Personalizer → Advance COD (`/app/cod-theme-review`) controls the review ON/OFF, percentage 10–50 and exact COD charge. This isolated admin release is live at commit `cec0b422e6babca639200901d77c109af097c6fa`, deploy `dep-dbmmevjm8hqs73asqh50`. These are **central preview settings**, separate from production payment activation. Theme settings retain only the switch that loads this review component, with no duplicate amount controls.

The installed Render-backed app's actual proxy URL was confirmed in Shopify Manage app as `/apps/cartwala-signature-day-1`; `/apps/cartwala-signature-day` belongs to the older app and did not reach the new backend. No app proxy or developer app configuration was changed. The script reads `/apps/cartwala-signature-day-1/cod-review`, validates the fixed theme ID and `paymentsEnabled: false`, and refreshes configuration on every intercepted checkout press. OFF or an unavailable/invalid configuration resumes native checkout. An already-loaded ON page observes OFF at its next checkout press.

The dialog reads the current INR cart, shows goods, advance, complete extra fee upfront, balance and total. ₹400 at 20% plus ₹50 gives ₹130 now / ₹320 delivery / ₹450 total. Values are estimates; checkout taxes, shipping and discounts must be resolved by the authoritative server quote before any advance can be charged.

Advance continuation is disabled with an explicit preview notice. This implementation makes **no gateway calls, creates no orders and sends no courier requests**. It does not implement a second checkout or certify any external payment flow. Do not publish it as a finished Advance COD feature.

## Validation

- Shopify accepted all eight files without user errors.
- Browser: cart-page popup, drawer popup by click and keyboard, selection/breakdown and disabled advance continuation.
- Browser: OFF omitted the popup; Place Order reached native Shopify checkout with ₹400 and the existing Paytm method.
- Browser: ON → Full payment reached the same native checkout. No address entered, payment initiated, or order submitted.
- Browser: 390 × 844 responsive review inspected; viewport override reset.
- JavaScript syntax check passed.
- Central admin → popup browser validation: saving 30% / ₹80 showed ₹120 advance + ₹80 fee = ₹200 now and ₹280 COD for the existing ₹400 cart. Changing admin to OFF on an already-loaded cart went directly to native checkout. Restored 20% / ₹50 and preview ON afterward. No payments or orders were submitted.
- `scripts/verify-cod-theme-review-storefront.mjs` validates theme restriction, initial OFF/configuration failure, re-reading changed amounts/OFF, native prepaid continuation and disabled advance submission. Scoped lint passed.
- Shopify theme validator could not run because its installed `@shopify/theme-check-common` dependency is missing. Do not describe this as a completed theme-check run.

## Remaining before a complete merchant payment test

Connect supported payment flow and production activation to the saved admin policy; isolate test payment/order/courier effects; configure Paytm staging merchant binding and verify real staging transaction callbacks; confirm NimbusPost exact remaining-balance mapping and automatic-sync exclusion; complete cancellation/refund coordination and reconcile fees/taxes/discounts. The full payment backend draft and all production readiness gates remain unchanged.

Live theme, Paytm configuration, NimbusPost channels and existing orders were not changed. An isolated admin/proxy release was deployed on top of the live diagnostic base; it contains no full payment/courier integration. Only the unpublished review theme loads the new configuration endpoint. Merchant approval after complete testing is required before publishing.
