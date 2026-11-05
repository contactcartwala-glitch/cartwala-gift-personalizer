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

NimbusPost account inspection confirmed that the Shopify channel is active. A dedicated `Cartwala Advance COD` Admin API key was created with merchant approval, with PII access disabled. A read-only `/v2/couriers` request succeeded (HTTP 200, `success: true`). Credentials are private and are not committed to the repository; the new server credentials have now been saved to Render as described below; a backend redeploy and authentication test remain pending.

The new NimbusPost v2 adapter maps the frozen remaining amount to `order_collectable_amount`, converts paise to rupees, sends parcel weight in kilograms and phone/pincode as numbers. It refuses unverified payment states, unreconciled merchandise values and orders whose automatic Shopify shipping sync has not been excluded. It creates an unbooked order only, never books or requests pickup, requires a separate provider order re-read to acknowledge the exact balance, and never automatically repeats an uncertain POST. This adapter is not connected to the checkout or outbox yet. Mocked tests verify mapping and error recovery, not a live COD order acknowledgment. No courier order or shipment was created.

On 5 November the merchant signed into the correct Paytm Payments account, where production API credentials were available. With explicit approval, `PAYTM_MID` and `PAYTM_MERCHANT_KEY` were saved to Render service `cartwala-gift-personalizer-1` in Dileep's workspace using Save only. The page was reloaded to verify both variable names persisted. No secret value is committed here, and the running build has not been redeployed to consume these variables.

The server-only Paytm adapter uses the pinned `paytmchecksum` 1.5.1 SDK for request signing and response verification, separate fixed staging/production hosts, server-frozen amounts and an opaque stable reference per shop/intent. A successful signed transaction-status re-read must acknowledge the merchant, order, exact amount, transaction ID, successful capture and zero refunded amount. Pending/failed responses do not produce paid proof. Production initiation requires an explicit opt-in and does not retry requests automatically. No initiation route is exposed, so it cannot currently collect a payment. A bounded POST callback route now verifies the form signature, binds the persisted reference to the configured shop/merchant/environment, and re-reads signed provider status before recording any proof. A callback never supplies payment proof directly.

The draft now includes `PartialCodPaytmAttempt`, its migration, and a parameterized SQL payment store. It commits a single-writer claim and moves the quoted intent to awaiting payment before reaching Paytm, rejects expired quotes and mismatched account/amount references, keeps uncertain calls for reconciliation without sending another initiation, and records repeated paid proof idempotently. A unique provider fingerprint prevents using one transaction for two intents. Transaction tokens are not persisted. Recording Paytm proof deliberately does not enqueue the old deposit-order outbox or mark a Shopify order paid. The Prisma query bridge and callback route are implemented in the draft. The callback has a database-backed status-check lease to limit signed replays across workers, rejects unsupported methods/media types and oversized bodies, and returns generic responses without logging provider errors or customer details. It requires explicit PAYTM_SHOP and PAYTM_ENVIRONMENT bindings in addition to the saved credentials; these bindings are not configured yet. Status-recovery UI/job, refund/cancellation recovery and final Shopify order accounting remain incomplete. This migration has not run on production.

Order-access blocker resolved on 5 November with explicit merchant approval. The app configuration was released as `cartwala-gift-personalizer-4` (version `1195882676225`) with the existing six scopes plus `write_orders` and `write_draft_orders`. The new version retained the existing theme extension `cartwala-personalizer`, UI extension `signature-day-preview-pdf`, all four webhook subscriptions, app proxy and custom-data definitions. The Cartwala store's custom install link was used to open Update data access, and Update was approved. A direct Admin API read then confirmed both additional scopes were actually granted (with implicit `read_draft_orders`), rather than merely requested by the version.

The Render `SCOPES` setting was updated to the full explicit eight-scope list using Save only and verified after reload. `shopify.app.toml` in this draft now carries the same scope set so a later release cannot inadvertently revert it. This was a permissions/configuration release only; no Advance COD backend, storefront checkout code or database migration was deployed. The running backend build remains separate from this draft.

With explicit merchant approval, a new NimbusPost key named `Cartwala Advance COD Server 2026-11-05` was created with Admin role and PII access OFF. It was saved to the same Render service as `NIMBUSPOST_API_KEY` and `NIMBUSPOST_API_SECRET` using Save only. Both names persisted after a page reload, existing Paytm variables were preserved, and the new key was visibly Active. The previous key was not changed or revoked. No credential values were saved to source, logs or Library; no server redeploy, API-authentication test or courier order was performed in this step.

The Cartwala backend currently observed in Render is service `cartwala-gift-personalizer-1`, with deployed commit `43e69e390b876ebdcfbbbe5a88d61c658b182cf7`. The older Fly configuration in the draft is not evidence of the current runtime. This draft is not deployed or merged; no database migration, webhook registration or customer activation has been performed.

## Validation

Policy, payment, quote and configurable-settings tests passed. The NimbusPost adapter tests cover 20%/30% balances, paid-state guards, duplicate-sync guards, declared merchandise value, numeric address fields, kilogram units, exact COD acknowledgment, and a rate-limited POST without retry. Typecheck, changed-module ESLint and production build passed. The Shopify quote mutation and a read-only order totals review query were validated against API version 2026-07. Deployed multi-process database concurrency, live checkout and live COD-order acknowledgment tests have not run. Local embedded-PostgreSQL concurrency tests are described below.

5 November Paytm validation: mocked transport tests using real SDK signatures cover request/response signing, tampered/missing signatures, 20%/30% and fractional-paise rounding, stable references scoped by shop, mismatched merchant/order/amount, refunded/pre-authorized payments, pending/failed states, closed intents, invalid configuration, transport/HTTP/JSON errors, no automatic retries and the default live-initiation gate. The new adapter and SDK declaration pass scoped strict TypeScript checking and ESLint. These adapter checks do not constitute a Paytm staging transaction or live checkout test. The full reconstructed application typecheck and production build subsequently passed; the build warns about an unrelated public image omitted from the local reconstruction.

The payment store migration and SQL operations were exercised against PGlite's embedded PostgreSQL engine: 12 overlapping initiation calls produce one gateway call, eight repeated paid confirmations remain idempotent, a transaction cannot be reused across orders, unknown outcomes cannot trigger a new initiation, delayed signed proof can reconcile an uncertain payment, expired quotes and cancelled intents reject payment claims/proof, and paid rows require proof fields. Store TypeScript/ESLint and Prisma schema validation passed. These are local database tests; multi-process tests against a deployed PostgreSQL service are still pending.

The callback route is exercised through HTTP Request/Response objects with real SDK-signed forms and an embedded PostgreSQL ledger. Tests cover HTTP method/media-type and streaming size limits, invalid signatures and unknown orders, matching shop/account/environment, signed-success notifications with a pending server status, repeated callbacks, provider failures without leaked details, persisted paid proof and repeated successful confirmations. Adapter/store tests additionally cover signature tampering and overlapping status-check leases. Full application typecheck and production build passed after adding this route. These are local tests, not an actual provider payment.

A diagnostic orderCreate attempt through the generic Shopify connector was rejected before any order was created: that operation requires an offline-authenticated app client. The installed Cartwala app's write_orders/write_draft_orders grants were separately verified. Accounting validation must therefore run through the app's own authenticated offline Admin client in an isolated test environment; repeating scope approval does not resolve the connector token-type restriction.

The draft has been brought forward onto master commit `643f3da107644230e0176e1e3f9dce4d81404ee0` through a merge into the feature branch only. The five overlapping files were reconciled: navigation retains Google Reviews and adds Advance COD, Prisma retains Google Reviews/photo-original models and adds COD models, both dependency sets are retained in package/lock files, and the current app configuration retains frame-mockup definitions plus the granted COD scopes. Other master files are carried forward unchanged by tree identity. After reconciliation, npm ci, Prisma generation, full application typecheck/build, all eight COD suites, and Google Reviews/photo-original regression tests passed. The locally reconstructed checkout still omits binary/static assets, so this is build validation, not storefront visual QA or a deployment.

## Next integration work

1. Validate a single Shopify order's partial-payment accounting using the app's offline Admin client; reconcile merchandise, tax, discounts and the INR 80 non-shipping fee exactly.
2. Confirm warehouse/parcel configuration and Shopify auto-sync exclusions before linking the NimbusPost adapter.
3. Implement checkout initiation, recovery UI/job, refund/cancellation handling and explicit NimbusPost remaining-amount acknowledgment.
4. Configure staging account/shop/environment bindings in an isolated backend, apply migrations and run actual Paytm staging and deployed concurrency/recovery tests.
5. Test in the duplicate theme, show the merchant the complete order result, and obtain publication approval.

References:
- https://shopify.dev/changelog/posts/draft-order-deposit-fields-now-available-in-the-admin-and-customer-account-graphql-apis
- https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/draftOrderCalculate
- https://www.paytmpayments.com/docs/api/initiate-transaction-api
- https://www.paytmpayments.com/docs/api/v3/transaction-status-api
- https://www.paytmpayments.com/docs/jscheckout-test-go-live

