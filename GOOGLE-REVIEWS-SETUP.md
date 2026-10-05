# Google reviews in Cartwala Gift Personalizer

This feature uses the owner's Google Business Profile project. There is no third-party review-app subscription. Existing hosting and database costs still apply.

## Server setup required before publishing

1. Obtain Business Profile API access approval for Cartwala's Google Cloud project. Enable the Account Management and Business Information APIs and the Google My Business API. The location must be verified.
2. Configure Google OAuth with the `https://www.googleapis.com/auth/business.manage` scope. The server only reads reviews; it does not reply, delete reviews or edit listings. Google does not offer a narrower review-read scope for this API.
3. Complete the owner's Google consent flow securely using that project's OAuth client with offline access. Store the refresh token and client secret in hosting environment variables, never in Shopify theme settings, this repository or chat.
4. Set these environment variables:
   - `GOOGLE_REVIEWS_SHOP`: the installed shop's permanent `*.myshopify.com` domain.
   - `GOOGLE_REVIEWS_LOCATION`: `accounts/<account-id>/locations/<location-id>` from the owner's Account Management and Business Information APIs. A Maps URL/Place ID cannot replace this resource name.
   - `GOOGLE_REVIEWS_CLIENT_ID`
   - `GOOGLE_REVIEWS_CLIENT_SECRET`
   - `GOOGLE_REVIEWS_REFRESH_TOKEN`
5. Run the existing deployment's Prisma migrations, then deploy the app backend and theme extension. This change does not alter app proxy configuration or Shopify scopes.
6. Open Google Reviews in the app and refresh. Verify the imported count against Google's reported total; differences can occur while reviews change between page requests. Validate the intended Cartwala location before publishing.
7. Add the Google Reviews app block to the duplicate theme. Set the Maps link to `https://maps.app.goo.gl/LwsePZgVbizU355GA`, inspect mobile/desktop, and publish only after approval.

## Behaviour and boundaries

- The server follows every Google page token; it does not impose a review-count cap or filter out low ratings or rating-only reviews.
- Six reviews appear initially. Show more appends the next six until every fetched review is displayed.
- A signed Shopify app proxy endpoint provides public review fields. No Google credentials or private account data are returned.
- Website visits refresh snapshots older than an hour. Concurrent refreshes share one request per server process; failures are retried after five minutes.
- Snapshot contents are stored unchanged. The widget escapes content via DOM text nodes. Google's average and total are used directly.
- Snapshots older than 24 hours are cleared before reads, and when the app is uninstalled. A production hourly database cleanup job must also delete expired snapshots so data is removed even when the website is idle. Configure this on the existing server scheduler; do not purchase a new service without approval.
- A failed refresh leaves the last snapshot available for at most 24 hours. With no valid data the block is hidden rather than displaying sample reviews.
- The feature is not live until credentials, migration, backend/extension deployment and theme activation are complete. No OAuth credentials or API approval have been created by this code change.

References: https://developers.google.com/my-business/content/prereqs · https://developers.google.com/my-business/content/review-data · https://developers.google.com/my-business/content/policies
