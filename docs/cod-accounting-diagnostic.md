# Cartwala COD accounting diagnostic only

Based exactly on the observed live backend commit 43e69e390b876ebdcfbbbe5a88d61c658b182cf7. This release adds the authenticated Cartwala-only /app/cod-accounting-test page, one diagnostic table/migration, a COD check navigation link, and its local PostgreSQL tests/dev dependency. It does not include the unfinished paid checkout from PR #17.

The merchant-approved test creates at most one clearly marked Shopify test order per diagnostic version: INR 1,000 non-shipping merchandise + INR 80 fee, with INR 280 imported test payment and INR 800 outstanding. financialStatus is omitted so Shopify derives it. There is no customer, email, phone, shipping address, variant, inventory decrement, customer receipt, fulfillment or real Paytm transaction. The test uses the app's own offline Admin client and the already-granted order scopes.

A durable unique claim prevents duplicate creation. Unknown responses are reconciled by searching the original tag and re-reading the original order, never automatically repeating orderCreate. A mismatch remains visible and must not activate Advance COD. Test order IDs and observed totals are stored; no credentials or customer data are stored here. The added table is compatible with the previous build if application rollback is needed.

Target: Dileep's Render workspace, existing service cartwala-gift-personalizer-1 (srv-dasaieg473hc73fenaag). Before deploying, recheck the current live commit and outstanding deploys. If it has changed, rebase this diagnostic onto the actual current live build instead of overwriting another person's changes.

Render's Dashboard Deploy a specific commit can deploy this isolated branch without merging master. That action disables automatic deploys. It requires merchant approval for the live-backend update and temporary auto-deploy pause; restore the intended deployment policy deliberately after the diagnostic/follow-up release. No deployment has been performed as part of preparation.

After a confirmed deploy, open COD check inside the Cartwala app, review the test details, run the one test and verify Shopify reports INR 1,080 total, INR 280 received and INR 800 outstanding. Inspect runtime errors without exposing secrets. This only validates Shopify accounting; Paytm payment, NimbusPost balance/sync, storefront checkout, refunds and full end-to-end tests remain separate blockers.

Local validation: node scripts/verify-cod-accounting-diagnostic.mjs, npm run typecheck and npm run build. The PostgreSQL test covers 12 overlapping calls, one mutation, pending/lost responses, mismatch/rejection, read-only recovery and cross-shop restrictions. No actual Shopify order or payment was created during local testing.
