# Advance COD review: updated 5 November 2026

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

On 5 November the merchant signed into the correct Paytm Payments account, where production API credentials were available. With explicit approval, `PAYTM_MID` and `PAYTM_MERCHANT_KEY` were saved to Render service `cartwala-gift-personalizer-1` in Dileep's workspace using Save only. The page was reloaded to verify both variable names persisted. No secret value is committed here, and the running build has not been redeployed to consume these variables.

The server-only Paytm adapter uses the pinned `paytmchecksum` 1.5.1 SDK for request signing and response verification, separate fixed staging/production hosts, server-frozen amounts and an opaque stable reference per shop/intent. A successful signed transaction-status re-read must acknowledge the merchant, order, exact amount, transaction ID, successful capture and zero refunded amount. Pending/failed responses do not produce paid proof. Production initiation requires an explicit opt-in and does not retry requests automatically. The adapter is not imported by a route and cannot currently collect a payment. Its callback URL is a reserved integration path, not an implemented endpoint.

The draft now includes `PartialCodPaytmAttempt`, its migration, and a parameterized SQL payment store. It commits a single-writer claim and moves the quoted intent to awaiting payment before reaching Paytm, rejects expired quotes and mismatched account/amount references, keeps uncertain calls for reconciliation without sending another initiation, and records repeated paid proof idempotently. A unique provider fingerprint prevents using one transaction for two intents. Transaction tokens are not persisted. Recording Paytm proof deliberately does not enqueue the old deposit-order outbox or mark a Shopify order paid. The Prisma query bridge, callback routing, status-recovery UI/job, refund/cancellation recovery and final Shopify order accounting remain incomplete. This migration has not run on production.

Current live blockers verified on 5 November: the Render `SCOPES` setting contains only `write_products,read_products`, without the order/draft-order permissions required by this implementation. The NimbusPost `Cartwala Advance COD` key remains active, but its overview only shows masked credentials; the Render service has no NimbusPost variables. The earlier private local credential copy is not available in this workspace after maintenance. A merchant-approved credential replacement and secure server configuration are needed before shipping tests. No key was rotated or created during this check.

The Cartwala backend currently observed in Render is service `cartwala-gift-personalizer-1`, with deployed commit `43e69e390b876ebdcfbbbe5a88d61c658b182cf7`. The older Fly configuration in the draft is not evidence of the current runtime. This draft is not deployed or merged; no database migration, webhook registration or customer activation has been performed.

## Validation

Policy, payment, quote and configurable-settings tests passed. The NimbusPost adapter tests cover 20%/30% balances, paid-state guards, duplicate-sync guards, declared merchandise value, numeric address fields, kilogram units, exact COD acknowledgment, and a rate-limited POST without retry. Typecheck, changed-module ESLint and production build passed. The Shopify quote mutation and a read-only order totals review query were validated against API version 2026-07. Database concurrency, live checkout and live COD-order acknowledgment tests have not run.

5 November Paytm validation: mocked transport tests using real SDK signatures cover request/response signing, tampered/missing signatures, 20%/30% and fractional-paise rounding, stable references scoped by shop, mismatched merchant/order/amount, refunded/pre-authorized payments, pending/failed states, closed intents, invalid configuration, transport/HTTP/JSON errors, no automatic retries and the default live-initiation gate. The new adapter and SDK declaration pass scoped strict TypeScript checking and ESLint. These checks do not constitute a Paytm staging transaction, a full application build, database-concurrency test or live checkout test.

The payment store migration and SQL operations were exercised against PGlite's embedded PostgreSQL engine: 12 overlapping initiation calls produce one gateway call, eight repeated paid confirmations remain idempotent, a transaction cannot be reused across orders, unknown outcomes cannot trigger a new initiation, delayed signed proof can reconcile an uncertain payment, expired quotes and cancelled intents reject payment claims/proof, and paid rows require proof fields. Store TypeScript/ESLint and Prisma schema validation passed. These are local database tests; multi-process tests against a deployed PostgreSQL service are still pending.

## Next integration work

1. Configure the verified NimbusPost credentials as production server secrets and confirm warehouse/parcel configuration and Shopify auto-sync exclusions.
2. Resolve paid-deposit accounting and shipping exclusions before authoring a live payment flow.
3. Implement checkout creation, linked merchandise order creation, refund/cancellation recovery and explicit NimbusPost remaining-amount acknowledgment.
4. Apply migrations to a test database and run concurrency/recovery tests.
5. Test in the duplicate theme, show the merchant the complete order result, and obtain publication approval.
6. Connect the Paytm adapter through durable attempts and the callback/status routes, verify staging credentials and an actual staging payment before any live test, then integrate the single Shopify order and NimbusPost balance.

References:
- https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
- https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/draftOrderCalculate
- https://www.paytmpayments.com/docs/api/initiate-transaction-api
- https://www.paytmpayments.com/docs/api/v3/transaction-status-api
- https://www.paytmpayments.com/docs/jscheckout-test-go-live

