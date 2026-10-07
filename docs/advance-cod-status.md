# Advance COD review: 7 October 2026

## Implemented in this review

- Authenticated `/app/advance-cod` admin page and navigation.
- Store-specific settings, disabled by default, and whole advance percentages from 10 to 50.
- A fixed INR 80 charge paid upfront. An INR 1,000 product total at 20% means INR 280 now and INR 800 on delivery.
- Optimistic settings revision checks to reject stale saves from another admin tab.
- Integer-paise calculations with nearest-paise rounding, including database amount constraints.
- Each intent stores its own percentage; payment verification and courier amounts use that frozen percentage.
- Signed app-proxy `/signature-day/partial-cod` configuration and review-quote endpoint. The corresponding storefront URL is `/apps/cartwala-signature-day/partial-cod`.
- Shopify-calculated prices, tax and automatic discounts; artwork properties and validated Indian addresses are retained in the review intent.
- Quote requests are explicitly review-only, single-use, bounded in size, and reject discount codes until customer eligibility is implemented.
- Server-side activation gates reject enabling the incomplete integration, even if the admin form or environment is modified.

## Still incomplete

This is not a functioning paid checkout. The review endpoint never creates a payment, invoice, merchandise order or shipment. Existing theme cart-review snippets still show the original 20% illustration; they are not connected to the configurable setting.

The existing draft branch's non-physical deposit-order approach needs accounting work before it can be used. Creating a paid deposit order and another full-value order without reconciling both would duplicate sales. Native Shopify draft-order deposits are limited to Plus; this store is Basic. A separate custom integration therefore needs an accounting representation and live payment tests.

NimbusPost account inspection confirmed that the Shopify channel is active. A dedicated `Cartwala Advance COD` Admin API key was created with merchant approval, with PII access disabled. A read-only `/v2/couriers` request succeeded (HTTP 200, `success: true`). Credentials are private and are not committed to the repository; production server secret configuration remains pending.

The new NimbusPost v2 adapter maps the frozen remaining amount to `order_collectable_amount`, converts paise to rupees, sends parcel weight in kilograms and phone/pincode as numbers. It refuses unverified payment states, unreconciled merchandise values and orders whose automatic Shopify shipping sync has not been excluded. It creates an unbooked order only, never books or requests pickup, requires a separate provider order re-read to acknowledge the exact balance, and never automatically repeats an uncertain POST. This adapter is not connected to the checkout or outbox yet. Mocked tests verify mapping and error recovery, not a live COD order acknowledgment. No courier order or shipment was created.

Paytm merchant credentials and integration do not exist in this source or the current execution environment. The merchant dashboard requires login; secure QR authentication was unavailable and the browser was handed to the merchant. Shopify's installed Paytm gateway does not by itself provide this custom backend with Paytm merchant API credentials. Direct advance payment, server-side status verification and refunds remain blocked pending merchant access and confirmation of the supported accounting flow.

The Fly production app is configured in `shopify.app.live.toml`; this review is not deployed. No database migration, webhook registration or customer activation has been performed.

## Validation

Policy, payment, quote and configurable-settings tests passed. The NimbusPost adapter tests cover 20%/30% balances, paid-state guards, duplicate-sync guards, declared merchandise value, numeric address fields, kilogram units, exact COD acknowledgment, and a rate-limited POST without retry. Typecheck, changed-module ESLint and production build passed. The Shopify quote mutation and a read-only order totals review query were validated against API version 2026-07. Database concurrency, live checkout and live COD-order acknowledgment tests have not run.

## Next integration work

1. Configure the verified NimbusPost credentials as production server secrets and confirm warehouse/parcel configuration and Shopify auto-sync exclusions.
2. Resolve paid-deposit accounting and shipping exclusions before authoring a live payment flow.
3. Implement checkout creation, linked merchandise order creation, refund/cancellation recovery and explicit NimbusPost remaining-amount acknowledgment.
4. Apply migrations to a test database and run concurrency/recovery tests.
5. Test in the duplicate theme, show the merchant the complete order result, and obtain publication approval.

References:
- https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
- https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/draftOrderCalculate
