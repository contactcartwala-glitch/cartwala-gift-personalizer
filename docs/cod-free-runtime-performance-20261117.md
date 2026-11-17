# Free runtime performance checkpoint

Customer Cloudflare cutover is not complete. Shopify application/proxy URLs and Render production remain unchanged. No further payment, refund or shipment is needed for the already-paid pilot #1039.

The genuine Razorpay receipt is reverified as completed: INR130 paid, INR320 remaining COD. NimbusPost independently showed COD320. Cloudflare read-only preflight confirms database/session/app identity/scopes. These observations are not proof of exclusive Worker reconciliation because Render hooks also remain installed.

Added Hyperdrive `cartwala-cod-fresh`, ID `5822d26c40db4d38b054334cbbe79808`, to the isolated native pilot Worker. This uses the existing PostgreSQL origin with cache disabled, TLS require mode, and runtime binding HYPERDRIVE. Direct database fallback continues requiring certificate validation. Credentials remain encrypted platform secrets, never in source.

Observed dashboard invocation metrics:

| Invocation | Version prefix | CPU ms | Wall ms |
| --- | --- | ---: | ---: |
| Original genuine paid webhook | 162dee51 | 57 | 9001 |
| Receipt after pooling | 8f2d5576 | 17 | 3331 |
| Preflight after pooling | 8f2d5576 | 24 | 1536 |
| Eight-caller hosted fixture | 8f2d5576 | 75 | 3918 |
| Preflight first observed after SDK config reuse | 4ef2b609 | 46 | 2474 |
| Preflight repeated | 4ef2b609 | 19 | 2853 |

The fixture is not representative of one checkout. All observed invocations succeeded, but regular Worker Free CPU is 10 ms and burst tolerance is not a stable acceptance criterion. SDK configuration reuse alone does not resolve this. Global CHECKOUT_ENABLED remains false.

Prepared a SQLite-backed Durable Object compute adapter. It preserves existing request-local authentication, PostgreSQL durability, native checkout/payment verification and OFF guards, and fixes the object name to prevent unbounded object creation by callers. No payment/session/order state is stored in Durable Object fields or SQLite. Its separate CPU allowance addresses regular HTTP Worker CPU constraints; this must still be verified on the actual hosted runtime before cutover.

Official limits: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/durable-objects/platform/limits/ ; https://developers.cloudflare.com/durable-objects/platform/pricing/ . Durable Objects are available on Free with SQLite, 100,000 requests/day and 13,000 GB-s/day, with hard failures if quotas are exceeded. No paid upgrade is authorized.

Verification: full compatibility/security/preflight/theme-availability/legacy tests passed. Added direct/Hyperdrive connection configuration tests passed. SQLite Durable Object pilot/native routing, authentication, method limits, customer-OFF and no-outbound-on-invalid-auth checks passed in local workerd (supported compatibility date 2026-08-06). SDK configuration secret rotation rejects old signatures and returns to original secret correctly.

Next gates: deploy Durable Object configuration to isolated pilot; hosted preflight/receipt/actual quote and webhook idempotence/performance checks; verify legacy forwarding and all three new webhook destinations; only then consider app proxy cutover and customer activation. This file records preparation, not completion.
