# Cartwala automated UI/UX QA

This audit runs against the live store after a successful **Deploy Shopify app** workflow, every morning, and on demand.

It automatically:
- crawls Shopify sitemap URLs at a common mobile viewport;
- checks representative pages in Chromium, WebKit (Safari engine) and Firefox;
- covers 320×568, 390×844, 430×932, 768×1024 and 1366×768 viewports;
- detects body-level horizontal overflow, broken images, uncaught page errors, small tap targets and unnamed buttons;
- verifies a fixed sticky Add to Cart remains visible on product pages and flags WhatsApp overlap;
- runs the master Photo Frame flow: select 24×36, upload a test image, Preview & Save, then open the size-guide image;
- saves failure screenshots plus a machine-readable JSON report.

The workflow uploads `qa-output/report.json`, `qa-output/summary.md` and screenshots as a GitHub Actions artifact. Critical issues make the audit workflow red so they are visible immediately after deployment.

This does not replace every real-device test in existence, but it gives broad, repeatable coverage without manually checking many phones.
