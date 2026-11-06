# Exact Shopify order breakdown diagnostic

User-confirmed representation: ₹400 goods; ₹80 Advance COD (20%); ₹50 shipping/COD charge; ₹450 order total; ₹130 received online; ₹320 outstanding COD. This is one full-value, partially-paid order, not an ₹80 fully-paid order. The existing active Shopify gateway must take the advance; the historical direct-Paytm path is not selected.

This isolated release adds only `/app/cod-breakdown-test` and its pure arithmetic / TEST-only helpers on top of live preview-control commit cec0b422e6babca639200901d77c109af097c6fa. It does not enable customer Advance COD, change theme files/payment providers/settings, alter courier channels or add a migration. The existing central preview and old #1034 diagnostic are retained.

The connected Shopify MCP rejected orderCreate because it requires offline-token authentication. This is an API authentication constraint, not a user approval rejection. The authenticated Cartwala admin action uses the already-installed app's unauthenticated.admin(shop) offline client, as the old diagnostic does. It is Cartwala-only and POST-only and takes no user-supplied monetary values or order identifiers.

The fixed test reference CARTWALA-COD-400-50-20261106-V1 has its own primary-key row in the existing CodAccountingDiagnostic table. A durable INSERT claim precedes its only orderCreate attempt; later invocations re-read/search the same reference and never repost an uncertain mutation. Shipping is explicitly ₹50, merchandise ₹400, a clearly named TEST transaction ₹130, with no assigned financialStatus. A Shopify re-read must show test=true, PARTIALLY_PAID, total450/received130/outstanding320/shipping50, exact visible breakdown fields and a single TEST transaction.

No customer contact/address, actual product variants, inventory decrement, receipt email or shipment is used. The test is deliberately nonshipping/incomplete. It simulates accounting; it is not a real payment or customer-checkout test. Invoice #D1 remains unpaid and must not be paid.

Validation: embedded PostgreSQL concurrency with 12 calls gives one mutation; explicit rejection, lost-response recovery, wrong outstanding/shipping/attributes and non-test payment records fail confirmation. Old diagnostic and central preview regressions are checked. Full production payment/order/courier/refund work remains incomplete.
