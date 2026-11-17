# Latest durable COD cutover status

This supersedes earlier preparation checkpoints. Customer-facing Shopify app proxy cutover has NOT been released. No new payment, shipment, cancellation or refund was performed.

## Completed

- Created the merchant-approved account token restricted to the Individual Workers Editor role for `cartwala-cod-native-pilot` only, expiring after seven days. No account-wide build token was created; no token value is in source or reports.
- Deployed the SQLite-backed Durable Object runtime using Wrangler 4.164.0 and the existing Hyperdrive binding. Customer quote, payment and order state remain in the existing PostgreSQL database.
- Hosted preflight succeeded on the Durable Object runtime; genuine pilot #1039 again verified completed, INR130 received and INR320 remaining COD, without any payment or order mutation.
- Explicitly registered and reread all three fixed Worker native COD destinations: ORDERS_PAID, ORDERS_CANCELLED, REFUNDS_CREATE. Existing Render and pilot webhook destinations were not removed or changed.
- Staged backend configuration: CHECKOUT_ENABLED=true, PILOT_RUNTIME=false, LEGACY_PROXY_ENABLED=true. This enables the backend for verification, not the storefront: Shopify still forwards the public proxy to Render. Signed receipt/preflight diagnostics remain separately authenticated. Preview URLs are explicitly disabled.

## New blocker, with hosted evidence

The old published-theme implementation scraped the storefront HTML. Both fixed public URLs `https://cartwala.in/` and `/cart` returned HTTP403 to the hosted Cloudflare runtime (4ms each). Therefore `checkoutAvailable` became false despite settings enabled=true, customerEnabled=true, revision12, advance20%, feeINR50. This is an independently observed Cloudflare cutover blocker; it is not proof of the cause of every earlier Render outage.

Prepared the official Admin GraphQL published-theme lookup instead: `themes(first:2,roles:[MAIN]) { nodes { id role } pageInfo { hasNextPage } }`. Only one valid MAIN theme is accepted; missing, ambiguous or wrong-role results fail closed. Runtime code reads metadata only and never edits theme files. This API requires the additional `read_themes` scope; the permission itself can read theme metadata and files. Merchant confirmation for that new access is still required. Existing declared app scopes do not include it. Hosted `/pilot/theme-api-check` independently returned permissionReady=false and missingScopes=[read_themes], with zero payments and zero Shopify writes.

Latest staged Worker version: `7617f5a6-89f2-4d44-a106-48c55ed86acd`. Earlier hosted diagnostic version `e59de908-036e-4ff6-9b52-27bd5893998e` produced the two HTTP403 probes. Do not call the migration live or finished.

## Prepared Shopify change, NOT released

The browser's Create version form for app428603867137 is based on active version `cartwala-cod-discount-optional` (1198559952897). Proposed name `cartwala-cod-theme-read-20261117`; proxy URL remains the existing Render destination for this scope-only version; proposed required scopes append only `read_themes`. A separate proxy release is needed only after runtime acceptance passes. Application URL, auth callback, existing scopes and optional read_discounts remain the same. The Release button has NOT been pressed. Active theme/UI extensions and metafield definitions must be verified unchanged after any eventual release.

## Validation and remaining gates

Local workerd verified separate pilot/native routing, customer OFF, customer ON rejecting unsigned requests, method limits and no outbound calls on invalid authentication. Official Shopify Toolkit validated the webhook read/create operations, permission-scope query and published-theme query against API2026-07; the latter reports required read_themes. Availability tests cover two different theme IDs, OFF, redirect, ambiguous themes and wrong roles. Existing payment/accounting and genuine receipt proof remain intact.

Next: obtain explicit merchant confirmation for read_themes; release the scope update without prematurely switching the proxy if installation consent is required; verify the newly granted permission and exact MAIN theme via the hosted diagnostic; complete real backend quote/idempotence and legacy-forwarding checks without paying; release the proxy cutover preserving extensions; verify public config and storefront checkout through Shopify. Keep the pilot order unshipped and do not pay it again.
