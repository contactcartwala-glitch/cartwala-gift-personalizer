# Cartwala COD: Cloudflare Free compatibility review

Source: a0169e943dcf66fb53be3c1d9436574bbe808da6. Production is unchanged.

## Verified locally

The existing native payment verification and checkout access capability modules were bundled unmodified into a test-only Worker and executed twice in Miniflare/workerd with nodejs_compat, compatibility date 2026-08-06 (the installed runtime's latest supported date). Bundle: 22,753 bytes.

Passed: exact advance/balance accounting; Paytm/Razorpay/PhonePe names accepted only with verified fixture receipts; pending/manual/wrong-value receipts rejected; artwork and order identity binding; concurrent receipt changes rejected; HMAC recovery token shop, secret and expiry checks.

All receipts and credentials in the fixture are invented. Zero external fetches, Shopify writes, payments or shipments. This is not a hosted checkout test, CPU quota benchmark, database test, or availability guarantee.

Run from experiments/cod-worker-compat: npm ci && node scripts/verify-worker-compat.mjs.

## Blocking production migration

1. app/db.server.ts currently creates the default Prisma client with a native query engine and a process-level cleanup interval. The Prisma generator has no worker-compatible driver adapter. Do not deploy it unchanged into Workers.
2. app/shopify.server.ts initializes the Node React Router adapter and Prisma session storage. The Worker needs verified request-scoped environment handling and compatible session/authentication storage.
3. Keep the SAME durable NativeCodCheckout records, unique claims and signed recovery secret. A separate empty database or changed secret would break payment recovery and risk duplicate drafts.
4. Both checkout creation AND the paid-order reconciliation webhook must remain available without Render. A Worker that merely proxies to sleeping Render is not a solution.
5. Cloudflare Free currently has 100,000 requests/day, 10ms CPU/request and 50 subrequests/request. Local fixture success does not establish live request CPU or subrequest headroom. Measure the complete Shopify/database path in the hosted Free plan before routing traffic.
6. No Cloudflare account or deployment credentials are connected to this workspace. A hosted test still requires authenticated Cloudflare access. Never add billing, paid Workers or paid database acceleration for this review.

## Next isolated integration

Use the existing database through a supported Worker driver/adapter; keep transactions, atomic checkout claims and session refresh behavior intact. Mount only COD config/quote/status and reconciliation handlers with authenticated Shopify app-proxy/webhook verification. Use fixture Shopify responses and a disposable database first; then a read-only real-session/DB check. Run duplicate-request, ambiguous draft result, settings OFF/revision race and webhook replay checks. Only after hosted quota and recovery checks pass should an unpublished theme and separate pilot routing be prepared. Keep the production Shopify app URL, proxy and webhook destinations unchanged until all acceptance checks pass.

## Official references checked

https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/workers/runtime-apis/nodejs/
https://developers.cloudflare.com/workers/tutorials/using-prisma-postgres-with-workers/
https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service
