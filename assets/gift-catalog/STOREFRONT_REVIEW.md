# 73 gift products: storefront review

The collection is `personalised-gift-collection` (collection ID 509005627577). All 73 product configurations are stored in `storefront-configs` and mirrored to the merchant-owned product JSON metafield `cartwala_personalizer.gift_config`. This namespace is shared by the theme and the app. The existing live app configuration is not enabled by this setup.

Draft theme **Cartwala 73 Gifts Customization Review**, ID **186527973561**, contains the editor section and its own JavaScript, fonts and photo processing dependencies. The product and collection templates render the clean preview URL from the new configuration. The collection shows all 73 products on one page, with lazy loaded images.

Photos, names, dates and editable text preserve the recovered PSD layout. Printed photographs use their template masks. Cutout and engraved treatments process the actual customer photograph in the browser. The processing model downloads on first use; the photograph is not sent to the model provider. Original photographs, processed photographs and the saved preview upload to the existing Shopify app endpoint when the customer adds the item to the cart.

Four calendar templates have a required date picker and draw the selected month, year and highlighted day. The wooden calendar layout and the floral heart photo boundary include the final browser review corrections. Stale saved previews must be resaved when the template configuration changes; customer fields remain recoverable.

`npm run build:gift-assets` rebuilds the segmentation bundle. `node scripts/verify-gift-catalog.mjs` checks all 73 configurations, source mask geometry, ready previews, leap dates, storefront/admin calendar parity, photo stacking and scene resolution. The existing QA suite, order asset checks, lint, typecheck and production build were run during review. Shopify Liquid validation passed for the section, product card, collection section, product template and locale file.

The PSDs are editable product scene mockups. They are not supplier production die lines. Manufacturing print dimensions still need confirmation before preparing flat production artwork. The admin export changes on this branch retain scene resolution, calendar layers, custom fonts, original sources and the correct cutout/engraving layer order. Deploy this app branch before relying on those new admin exports. Storefront preview, upload and cart were tested against the existing app endpoint.

The live theme is not replaced. Publishing the reviewed theme remains a merchant action in Shopify Admin because the connector blocks theme publishing. Recheck the active theme before applying any future release.

The segmentation dependency is licensed under AGPL-3.0; its license is in `public/gift-photo-processing-license.txt`, and corresponding source/build instructions are committed in this repository.
