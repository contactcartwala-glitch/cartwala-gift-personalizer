# Advance COD Cloudflare cutover verified live

This supersedes the pending-cutover status in earlier November17 checkpoints. Only Advance COD execution has moved; the whole Cartwala application and database have NOT moved.

## Active deployment and application configuration

- Cloudflare Worker `cartwala-cod-native-pilot`, version `1c272389-7b12-4e60-8821-0795da48ad0d`, uses SQLite-backed NativeCodRuntime compute and the existing Hyperdrive binding. CHECKOUT_ENABLED=true, PILOT_RUNTIME=false, LEGACY_PROXY_ENABLED=true; preview URLs explicitly disabled. No paid infrastructure was selected.
- Merchant explicitly approved read_themes. Released permission-only Shopify app version `cartwala-cod-theme-read-20261117` (1233241407489) and accepted the exact View Online Store / Theme permission update in the installed gift-personalizer app. The hosted scope probe then returned permissionReady=true, missingScopes=[], publishedThemeId188909125817.
- Released app version `cartwala-cod-cloudflare-free-20261117` (1233309696001), active at 23:06 IST. Proxy destination is `https://cartwala-cod-native-pilot.contact-cartwala.workers.dev/signature-day`. App URL and auth callback remain Render. Required scopes, optional read_discounts and both extension UIDs were verified preserved: theme43fbf172-3d5c-22df-9856-166505d415f1b15bfc09, UIa14e4b58-8d06-428d-91ab-520495b8957b.
- The installed public prefix remains `/apps/cartwala-signature-day-1`. No Shopify theme was published or edited by this cutover.

## Public proof and checkout acceptance

Both command-line public GET and connected Chrome read `https://cartwala.in/apps/cartwala-signature-day-1/native-cod` after the cutover and final Worker deployment. HTTP200, Cache-Control no-store, checkoutAvailable=true, themeId188909125817, replacementThemeId188307243193, advancePercent20, codFeePaise5000, revision12, discountCodesAvailable=true, backend=cloudflare-durable-free. The backend marker is emitted inside the Durable Object, providing positive proof that the public Shopify proxy reaches this runtime.

A fixed merchant verification invokes the unmodified production loader/action, creates one uncharged draft and repeats the same request key. Both calls returned the same checkout URL and amounts: goods400, advance80, extra charge50, payable now130, delivery320, total450. Database row d1f11f48-cbbb-4e91-9f1e-aa87feaecc51 is ready, bound to DraftOrder1627938980025, with no orderId. The normal Shopify checkout was opened without paying; it displayed totalINR130 and Razorpay. Its line properties mark the cart DO NOT PAY OR SHIP. The private invoice link and access token are intentionally omitted from this report.

The hosted legacy forwarding check returned reviewsHTTP200 and rejected a fixed invalid JSON POST with HTTP400 / Incomplete preview or print files. No images, PDFs or designs were uploaded or saved. The legacy forwarding timeout now allows the original app's slower operations rather than imposing a new25-second limit.

Genuine prior merchant pilot #1039 remains completed, order19004580495545, Razorpay received130, remaining320, full450; NimbusPost previously independently confirmed COD320. Its database row remains completed and bound to the same order. No new payment, refund, cancellation or shipment occurred during this cutover. Existing Render and pilot hooks remain alongside the verified three Worker native hooks; do not claim exclusive attribution of the earlier real reconciliation to Cloudflare.

Local checks passed: original payment/accounting compatibility, authentication and secret rotation, no outbound I/O on unsigned private endpoints, database TLS/binding guards, customer-OFF guards, customer-ON rejecting unsigned requests, different published theme IDs through the official API, ambiguous/wrong-role rejection, legacy GET/POST preservation and SQLite Durable Object routing. The new official API lookup eliminates the observed HTTP403 storefront HTML scraping dependency. A new real payment after cutover was not performed.

## What remains on Render and Shopify

Cloudflare handles native COD configuration, quotes and reconciliation. Other signed app-proxy requests are forwarded to the existing Render application. Render still hosts the admin/personalizer/uploads application. The existing Render PostgreSQL database remains authoritative for app sessions, settings, frozen COD quotes and order links; it was not copied to Cloudflare. Shopify retains products, orders and gateway payment records. Cloudflare has the previously merchant-approved encrypted application/database credentials and runtime configuration. Do not disable or delete Render.

For a rollback, the preceding scope-only app version1233241407489 preserves the approved theme-read permission and restores the Render proxy. Render native hooks were retained. Do not alter payment/order records to roll back routing. Free service quotas remain applicable; this is not a guarantee against all future network/provider outages.
