# Cartwala COD accounting diagnostic only

Based exactly on the observed live backend commit 43e69e390b876ebdcfbbbe5a88d61c658b182cf7. This release adds the authenticated Cartwala-only /app/cod-accounting-test page, one diagnostic table/migration, a COD check navigation link, and its local PostgreSQL tests/dev dependency. It does not include the unfinished paid checkout from PR #17.

The merchant-approved test creates at most one clearly marked Shopify test order per diagnostic version: INR 1,000 non-shipping merchandise + INR 80 fee, with INR 280 imported test payment and INR 800 outstanding. financialStatus is omitted so Shopify derives it. There is no customer, email, phone, shipping address, variant, inventory decrement, customer receipt, fulfillment or real Paytm transaction. The test uses the app's own offline Admin client and the already-granted order scopes.

A durable unique claim prevents duplicate creation. Unknown responses are reconciled by searching the original tag and re-reading the original order, never automatically repeating orderCreate. A mismatch remains visible and must not activate Advance COD. Test order IDs and observed totals are stored; no credentials or customer data are stored here. The added table is compatible with the previous build if application rollback is needed.

Target: Dileep's Render workspace, existing service cartwala-gift-personalizer-1 (srv-dasaieg473hc73fenaag). Before deploying, recheck the current live commit and outstanding deploys. If it has changed, rebase this diagnostic onto the actual current live build instead of overwriting another person's changes.

Render's Dashboard Deploy a specific commit can deploy this isolated branch without merging master. That action disables automatic deploys. It requires merchant approval for the live-backend update and temporary auto-deploy pause; restore the intended deployment policy deliberately after the diagnostic/follow-up release. No deployment has been performed as part of preparation.

After a confirmed deploy, open COD check inside the Cartwala app, review the test details, run the one test and verify Shopify reports INR 1,080 total, INR 280 received and INR 800 outstanding. Inspect runtime errors without exposing secrets. This only validates Shopify accounting; Paytm payment, NimbusPost balance/sync, storefront checkout, refunds and full end-to-end tests remain separate blockers.

Local validation: node scripts/verify-cod-accounting-diagnostic.mjs, npm run typecheck and npm run build. The PostgreSQL test covers 12 overlapping calls, one mutation, pending/lost responses, mismatch/rejection, read-only recovery and cross-shop restrictions. No actual Shopify order or payment was created during local testing.

## Live test and typed PostgreSQL persistence fix

The approved initial release 4db26b058352da8eb50f20c7064f5e36a3cea921 became live on Render deploy dep-dbm6vbl9el5s738tgrag on 5 November 2026. Its independent diagnostic migration was applied. It created exactly one Shopify test order, #1034 (gid://shopify/Order/18979804872889), with test=true, PARTIALLY_PAID, INR 1,080 total, INR 280 received, INR 800 outstanding, zero shipping/tax/refund and two non-shipping custom lines. The connected Admin API independently confirmed those fields. No real payment was initiated. Render auto-deploy is now disabled as approved.

The admin confirmation initially remained uncertain because the JSON result was supplied as a typed text parameter to a JSONB column. A PostgreSQL test reproducing Prisma text parameter binding failed on the old SQL. Adding an explicit ::jsonb cast fixes persistence; the regression suite now preserves text binding for every string parameter. Rechecking this original order never creates another order. Final live confirmation after this correction must be recorded separately; local success is not a substitute.
