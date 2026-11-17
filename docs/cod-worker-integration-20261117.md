# Cartwala Free Worker integration pilot — 17 November 2026

Status: isolated integration code prepared; NOT approved or ready for customer traffic.
Production source baseline: a0169e943dcf66fb53be3c1d9436574bbe808da6.

## Verified connection and routing checkpoint

- The merchant approved adding exactly 2a06:98c0:3600::103/128 to the app allowlist. Saved it alongside the two original Render ranges, with enforcement still ON. The unsaved-policy test reported 0 of 11,054 recent requests blocked.
- Subsequent signed Cloudflare preflight returned databaseReady=true, sessionReady=true, appIdentityVerified=true, permissionsReady=true, missingScopes=[], checkoutEnabled=false. No customer/order/payment record was changed.
- Root cause of the prior hosted 403 is confirmed: Shopify's JSON response explicitly reported that the app's IP restrictions rejected the Cloudflare Workers client address. Header experiments did not resolve the restriction; the approved allowlist addition did.
- Current hosted native pilot is diagnostic-pilot.mts: it exposes authenticated read-only preflight and health only. It does NOT expose checkout/order mutation handlers. The full native-worker bundle remains a separate prepared artifact, not a live customer service.
- Added an OFF-by-default legacy proxy gateway to preserve the other existing /signature-day routes at cutover. It authenticates Shopify app-proxy signatures, uses a fixed Render destination, strips cookies/authorization, preserves body/query and never forwards the COD endpoint or unrelated paths. LEGACY_PROXY_ENABLED is not enabled on production.
- New workerd gateway tests pass for signed GET/POST, unsigned rejection, native endpoint isolation, unrelated path rejection and OFF gating, with synthetic outbound transport only.
- Re-ran existing route tests: OFF/recovery, published-theme switching, stale-theme rejection and publication-during-quote race pass. Native plan tests pass. Durable checkout replay/concurrency tests are run separately against disposable PostgreSQL/PGlite.
- Remaining gates: full hosted quote and reconciliation CPU/subrequest measurement, Worker-bound paid-webhook/replay integration, recovery verification, and a reviewed proxy/webhook cutover preserving admin/personality routes. No real customer checkout has been switched to Cloudflare. No real payment or shipment was made.

## Connection checkpoint, 17 November 2026 17:27 IST

- Merchant explicitly authorized transfer of the existing DATABASE_URL and SHOPIFY_API_SECRET into encrypted Cloudflare secrets, then reconnected Chrome.
- Created a separate Free Worker `cartwala-cod-native-pilot` in the existing Cartwala Cloudflare account and deployed the native integration bundle.
- Existing Render database URL uses a private internal hostname. Read the SAME database's external URL from its Render database Info UI and confirmed username, password and database match without printing any of them. No database credential was rotated or original environment value edited.
- Stored DATABASE_URL as a Cloudflare Secret. Submitted SHOPIFY_API_SECRET as a Secret with SHOPIFY_API_KEY, WORKER_ORIGIN, CHECKOUT_ENABLED=false, PREFLIGHT_ENABLED=true. No credentials are recorded in this document or repository.
- Chrome control timed out while reading final settings confirmation, and a connection recovery attempt also timed out. Do not repeat secret creation blindly; inspect existing Worker variables first.
- Independent GET https://cartwala-cod-native-pilot.contact-cartwala.workers.dev/health returned HTTP 200 with checkoutEnabled:false at 11:56 UTC.
- Independent unsigned GET /pilot/preflight returned HTTP 401 at 11:57 UTC. This confirms the preflight route and authentication configuration are active, while customer checkout remains OFF. It does NOT prove database connectivity or secret equivalence with Shopify.
- Signed real database/session preflight has NOT yet run. No production app URL, proxy, webhook, theme, billing setting, payment or customer order was changed.
- Next: restore browser connection, inspect settings without displaying secrets, run a short-lived signed read-only preflight. Continue remaining release gates below; never treat unsigned 401 as a database test.

## Completed

- Reuses the existing COD loader/action, draft creation, same-order reconciliation, and webhook handler through build-time adapters. No production source edits.
- Replaces the Prisma/native-engine singleton in this bundle with request-scoped `pg` 8.23.1 TCP/TLS connections. Certificate verification is mandatory; connections close after each request. No database creation, migration or empty replacement database.
- Uses the official Shopify SDK 15.1.1 Web API adapter for app-proxy signatures and raw-body webhook validation. Rejects stale, duplicate security parameters, forged and foreign-shop requests.
- Request secrets and authenticated shop are isolated with AsyncLocalStorage; no global process.env mutation. Reads the existing shop-bound offline Session row. Does not send credentials to browsers or logs.
- Payment creation and webhook reconciliation both mount in the Worker. The existing unique durable checkout claims remain the authority; no Render call is used for these handlers.
- Worker event subscriptions must already exist and be verified before a payable checkout. No request silently installs subscriptions or changes destinations.
- Added signed, read-only preflight using a PostgreSQL READ ONLY transaction to verify existing settings/table access, offline session and installed-app identity/scopes.
- Added a Worker-safe published-theme reader: manual redirects are rejected, response size is bounded, and in-flight network promises never cross request boundaries. A positive loader fixture caught and corrected the Node-only redirect:error option before any cutover.
- Customer checkout and preflight are both OFF by default. The hosted synthetic pilot deliberately ignores all bindings and cannot use real credentials even if accidentally supplied.

## Evidence

- Local workerd: genuine-receipt/accounting/artwork/recovery fixtures pass.
- Local workerd: official SDK proxy and webhook validation; stale/duplicate/forged/foreign signatures; body limits; 16 concurrent request contexts; offline-session shop binding; mutation and checkout OFF guards pass. Outbound calls: zero.
- Existing PostgreSQL/PGlite checkout suite passes: 8 concurrent callers, one draft/edit; lost create/begin/add/commit responses; replay/recovery; invalid amounts/manual captures/country/tax; duplicate-payment prevention.
- Existing native plan suite passes, including address-free Shopify checkout, exact quantity/artwork/amount allocation and changed tax/price/discount rejection.
- Hosted Cloudflare Free `/compat`: passed=true.
- Hosted Cloudflare Free `/security`: passed=true, externalRequests=0, shopifyWrites=0.
- Local read-only preflight: valid app passes; missing permissions are surfaced; wrong app identity is rejected and the read-only transaction rolls back. Only fixture transport is used.
- Local configuration loader: actual published-theme replacement is followed automatically; redirects fail closed; merchant OFF remains OFF. Only fixture transport is used.
- Public fixture: https://cartwala-cod-compat-pilot.contact-cartwala.workers.dev/security
- Hosted synthetic bundle: 267,168 bytes before addition of the separate read-only preflight adapter; hosted bundle has no real secrets or database connection.

## Release gates still open

1. An isolated integration Worker needs the existing DATABASE_URL and SHOPIFY_API_SECRET stored as encrypted Cloudflare secrets. This materially grants Cloudflare access to the existing database/app identity. Obtain explicit confirmation immediately before transferring either credential. Do not display them, save them in this public repository, or change the original values.
2. Verify existing database external TCP reachability and TLS certificate chain from Cloudflare Free. Render-private internal hostnames cannot be used externally. Do not disable TLS validation or create a paid replacement database.
3. Run the authenticated read-only preflight against the SAME database. Confirm the existing offline session is non-expiring or implement/test coordinated refresh against the existing app before cutover. Current adapter rejects missing/near-expired sessions; it does not rotate refresh tokens.
4. Measure hosted CPU/subrequests for the COMPLETE authenticated SQL + Shopify quote and paid-webhook path. A synthetic SDK fixture passing is not proof that live checkout fits Free 10ms CPU. No paid-plan fallback is authorized.
5. Run settings OFF/revision-race, webhook replay, and receipt recovery acceptance through the Worker-bound routes with disposable records and fixture transport before any real payable test.
6. Prepare app-proxy routing while preserving other existing `/signature-day` endpoints. This Worker intentionally returns 404 for other routes. Do not point the entire app proxy at it as currently built. Keep the app/admin URL and unrelated personalization routes on their existing host.
7. Register/verify Worker webhooks only at an explicitly approved cutover. Existing Render handlers and Worker must share claims. Do not remove Render hooks before recovery verification.

No live theme, app URL, proxy, webhook destination, production data, payment gateway, plan or billing settings changed. No real charge, refund or shipment performed. This is progress toward the requested reliability fix, not a claim that live COD is fixed.

## Build and tests

From experiments/cod-worker-compat: `npm ci && npm test && npm run build:native`.
Existing checkout/plan regression scripts run from the repository root with the repository dev dependencies installed.
`wrangler.native-pilot.jsonc` is an OFF-by-default draft only; no deployment command was run for that configuration.
Experiment entry modules use .mts so the repository's root **/*.ts / **/*.tsx include patterns do not pull this separately installed pilot into the production app typecheck.

## References

- https://developers.cloudflare.com/workers/databases/connecting-to-databases/
- https://developers.cloudflare.com/workers/platform/limits/
- https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
- Official SDK installed source: app-proxy `validateHmac`, `webhooks.validate`, Web API adapter.
