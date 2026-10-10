# Mug 3D preview review

The product photo now has a 3D button before customization. The editor also has
a 3D Preview action that renders the current photo and text without saving or
unlocking purchase. Preview & Save continues to commit the print properties and
replace the gallery with the saved three-view mug preview.

The modal supports drag, arrow keys, pinch/wheel zoom, zoom buttons and reset.
It uses the existing hollow mug mesh for white, magic, red-inner and heart-handle
models. Devices without WebGL use a depth-buffered Canvas 2D rasterizer of the
same mesh. Magic mugs retain the hot/cold toggle.

## Store review

- Unpublished theme: **Cartwala 3D Cups Review - Oct 10** (186712064185).
- Based on **Cartwala Combined - SEO + Speed - Oct 10** (186700169401).
- The theme override loads only on products tagged `cw-mug`; all 285 active mugs
  were confirmed to have this tag on 2026-10-10.
- The live theme and released app extension have not been changed.
- In Shopify, open Online Store > Themes, find this draft, then Preview.
  Open any mug product and click its 3D button, or Customize Now > upload a photo
  and fill required text > 3D Preview > close > Preview & Save.
- Default product preview wraps the template artwork. Personalized photo/name
  areas are populated once the shopper customizes the mug.

`scripts/build-mug-theme-review.mjs ORIGINAL_LAYOUT OUTPUT_DIRECTORY` builds
the two assets and a conditional loader from a freshly fetched original layout.
The small bootstrap provides the new controls alongside the currently released
Liquid block. After the app extension is released, remove this review loader and
its two assets to avoid retaining a pinned copy of the personalizer.

## Verification

- `npm run qa` passed, including software rasterization of all four models,
  textured rotation, top/bottom views, magic reveal and WebGL recovery.
- ESLint and JavaScript syntax checks passed for the changed scripts.
- Browser checks on the unpublished theme: white upload/text preview,
  rotation/zoom/reset, close and save, saved gallery and enabled Add to Cart;
  magic hot/cold; red cavity/handle; heart-shaped handle; product-page preview
  before upload.
- The test browser did not expose WebGL, so visual checks exercised the software
  path. WebGL behavior was checked by the existing renderer regression suite.
- Actual mobile touch hardware was not available; portrait framing is covered
  by geometry regressions and responsive CSS is provided.
- The review layout passed Shopify Liquid validation. The existing personalizer
  block has 11 pre-existing image-dimension validation errors in clock markup;
  the unchanged baseline reports the same errors.

Review this draft before publishing or releasing the app extension.
