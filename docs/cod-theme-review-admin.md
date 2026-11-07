# Isolated admin controls for the unpublished COD theme

This release is based on the observed live diagnostic commit `fed09158227671d6e0c459ade6fb9fb1179db628`. It adds a Cartwala-only `/app/cod-theme-review` page and signed app-proxy GET `/signature-day/cod-review`. It does not include the full Advance COD backend from PR17.

The page saves preview ON/OFF, whole advance percentage 10–50, and exact COD charge ₹0–₹10,000. Saving amounts preserves ON/OFF; toggling preserves saved amounts. Revision checks reject concurrent stale writes. An independent `CodThemeReviewSettings` table defaults OFF and does not modify payment records, diagnostic orders or other app settings.

The public response contains only preview settings and the fixed unpublished theme ID `188248228025`, plus `paymentsEnabled: false`. No credentials, customer data or payment capability are returned. Both admin and proxy authenticate through the existing official Shopify library and restrict the shop. No POST proxy exists. There are no Paytm or NimbusPost imports/calls in these new modules.

The matching duplicate-theme script accepts this configuration only when the returned theme ID matches the rendered theme. It re-reads settings on each intercepted checkout press; OFF or configuration failure resumes normal native checkout. Advance continuation remains disabled, so this is central control of the layout review, not completed payment integration.

Validation: PostgreSQL migration/defaults/persistence, action authentication/shop restriction/method restriction, exact decimal fee parsing, stale writes, independent toggle/save actions, OFF preservation and signed proxy response; existing diagnostic regression; application typecheck, scoped lint and production build. The Shopify component validator could not run because the installed toolkit lacks its typescript dependency. The reconstructed local app reports its existing missing acrylic-preview-stud asset and bundle-size warnings; no unrelated assets were changed.

Deployment applies only this independent migration and admin/proxy code. Publishing a theme or enabling real advance payments is not part of this release. Merchant testing and approval remain required before storefront launch. Deployment and browser confirmation must be recorded separately; local checks alone do not establish that the admin page is available.

## Observed deployment and browser validation

Commit `cec0b422e6babca639200901d77c109af097c6fa` is live on Render deploy `dep-dbmmevjm8hqs73asqh50` (6 November 2026, 05:39 UTC). Logs confirmed the independent migration was applied successfully. The authenticated admin page displays the new Advance COD navigation link and settings.

Shopify Manage app confirmed the Render-backed app is installed at `/apps/cartwala-signature-day-1`. The older app owns the unsuffixed proxy path. The duplicate-theme script uses the observed `-1` path; no app configuration, permissions or old application settings were modified.

Browser checks confirmed central 30% / ₹80 settings appeared as ₹200 now and ₹280 COD for a ₹400 cart. OFF from admin affected an already-loaded ON cart at its next checkout press and reached native Shopify checkout. Saving 20% / ₹50 while OFF preserved OFF; preview was then restored ON. The proxy explicitly reports paymentsEnabled:false. No payment, order creation, courier action or theme publishing occurred.
