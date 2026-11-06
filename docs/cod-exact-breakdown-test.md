# Exact Shopify order breakdown diagnostic

User-confirmed representation: ₹400 goods; ₹80 Advance COD (20%); ₹50 shipping/COD charge; ₹450 order total; ₹130 received online; ₹320 outstanding COD. This is one full-value, partially-paid order, not an ₹80 fully-paid order. The existing active Shopify gateway must take the advance; the historical direct-Paytm path is not selected.

This isolated release adds only `/app/cod-breakdown-test` and its pure arithmetic / TEST-only helpers on top of live preview-control commit cec0b422e6babca639200901d77c109af097c6fa. It does not enable customer Advance COD, change theme files/payment providers/settings, alter courier channels or add a migration. The existing central preview and old #1034 diagnostic are retained.

The connected Shopify MCP rejected orderCreate because it requires offline-token authentication. This is an API authentication constraint, not a user approval rejection. The authenticated Cartwala admin action uses the already-installed app's unauthenticated.admin(shop) offline client, as the old diagnostic does. It is Cartwala-only and POST-only and takes no user-supplied monetary values or order identifiers.

The fixed test reference CARTWALA-COD-400-50-20261106-V1 has its own primary-key row in the existing CodAccountingDiagnostic table. A durable INSERT claim precedes its only orderCreate attempt; later invocations re-read/search the same reference and never repost an uncertain mutation. Shipping is explicitly ₹50, merchandise ₹400, a clearly named TEST transaction ₹130, with no assigned financialStatus. A Shopify re-read must show test=true, PARTIALLY_PAID, total450/received130/outstanding320/shipping50, exact visible breakdown fields and a single TEST transaction.

No customer contact/address, actual product variants, inventory decrement, receipt email or shipment is used. The test is deliberately nonshipping/incomplete. It simulates accounting; it is not a real payment or customer-checkout test. Invoice #D1 remains unpaid and must not be paid.

Validation: embedded PostgreSQL concurrency with 12 calls gives one mutation; explicit rejection, lost-response recovery, wrong outstanding/shipping/attributes and non-test payment records fail confirmation. Old diagnostic and central preview regressions are checked. Full production payment/order/courier/refund work remains incomplete.

## Observed result — 6 November 2026

The isolated release 1e75383547e87d2be5186751ca421130a0736917 went live as Render deploy dep-dbmnommtlv9c73bhjofg at 07:07:51 UTC (12:37:51 IST). Auto-deploy remains off. No schema migration or customer-payment activation was added.

The authenticated admin test created exactly one new TEST order #1035, gid://shopify/Order/18981308137657, through the installed Cartwala app's offline client. Its persisted diagnostic status is confirmed. An independent Admin API read and native Shopify Orders UI both showed:

| Field | Confirmed value |
| --- | --- |
| Goods / subtotal | ₹400 |
| Advance COD additional detail | ₹80 (20%) |
| Shipping / COD charge | ₹50 (actual Shipping row, not a second fee product) |
| Full order total | ₹450 |
| TEST received | ₹130 |
| Outstanding | ₹320 |
| Financial state | PARTIALLY_PAID |

Native Shopify Additional details shows all six named breakdown values. The order is explicitly marked Test order and its note states accounting simulation only. An independent transaction read confirmed exactly one test=true SUCCESS/SALE transaction, ₹130, gateway label Cartwala TEST accounting (no real payment). The only product is a custom nonshipping ₹400 fixture with variant=null; no customer/address, stock, email or real payment was used.

NimbusPost's existing Cartwala - 1 Shopify channel automatically imported this same #1035 at 12:39 IST, with Total ₹450, Collectable ₹320, payment mode COD and status INCOMPLETE. Only the Orders Refresh/read controls were used in NimbusPost; no API-created duplicate, order edit, courier selection, booking, wallet charge or shipment was made. The incomplete state is expected for this deliberately nonshipping fixture without an address.

The original #1034 was not changed. The native invoice preview #D1 remains separate and unpaid. A post-release proxy read confirmed preview ON, 20%, ₹50, revision5 and paymentsEnabled:false for unpublished theme188248228025. This confirms exact-example accounting and automatic balance mapping, not real native checkout payment, tax/discount/customization integration or dispatch. The full customer Advance COD feature is still incomplete and must not be published as ready.
