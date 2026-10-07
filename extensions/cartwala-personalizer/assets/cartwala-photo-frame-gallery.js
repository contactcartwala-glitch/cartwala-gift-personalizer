// Cartwala master photo-frame gallery v2 — gallery owns saved-photo mockup rendering.
(() => {
  if (window.cartwalaPhotoFrameGalleryLoaded) return;
  window.cartwalaPhotoFrameGalleryLoaded = true;

  const MASTER_SIZE = 1254;
  const sizeViews = {
    "8x12": { match: "photo-frame-8x12-black-beading", rect: [576, 326, 666, 476] },
    "10x15": { match: "photo-frame-10x15-black-beading", rect: [553, 270, 680, 476] },
    "12x18": { match: "photo-frame-12x18-black-beading", rect: [535, 229, 704, 506] },
    "16x24": { match: "photo-frame-16x24-black-beading", rect: [517, 197, 732, 558] },
    "20x30": { match: "photo-frame-20x30-black-beading", rect: [478, 156, 767, 607] },
    "24x36": { match: "photo-frame-24x36-black-beading", rect: [469, 115, 785, 635] },
  };
  const guideMatches = [
    "photo-frame-size-guide-black-beading",
    "photo-frame-size-guide.png",
  ];
  const guideRects = [
    [93, 452, 176, 586],
    [231, 428, 329, 594],
    [387, 399, 501, 594],
    [562, 363, 696, 594],
    [759, 326, 928, 595],
    [993, 288, 1186, 596],
  ];
  const sideMatches = [
    "photo-frame-side-view-black-beading",
    "photo-frame-side-view.png",
  ];
  const sideQuad = [
    [466, 221],
    [863, 188],
    [815, 958],
    [408, 922],
  ];

  let artworkUrl = "";
  let generation = 0;
  let scheduled = 0;
  let renderedUrls = [];
  const renderedMeta = new Map();

  const root = () =>
    document.querySelector(
      '[data-cw-personalizer][data-cw-photo-frame-master="true"]',
    );

  const sizeKeyFrom = (value) => {
    const compact = String(value || "")
      .toLowerCase()
      .replace(/[×X]/g, "x")
      .replace(/inches?|inch|"/g, "")
      .replace(/\s+/g, "");
    return ["8x12","10x15","12x18","16x24","20x30","24x36"]
      .find((size) => compact.includes(size)) || "";
  };

  const markPhotoFrameControls = () => {
    const sizeNodes = [
      ...document.querySelectorAll('input[type="radio"][value], option[value], label, button')
    ].filter((node) => sizeKeyFrom(node.value || node.textContent));

    let best = null;
    let bestScore = Infinity;

    sizeNodes.forEach((node) => {
      const directFieldset = node.closest?.("fieldset");
      const candidates = directFieldset ? [directFieldset] : [];
      let current = node.parentElement;
      for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        candidates.push(current);
      }

      candidates.forEach((candidate) => {
        const found = new Set(
          [...candidate.querySelectorAll('input[type="radio"][value], option[value], label, button')]
            .map((child) => sizeKeyFrom(child.value || child.textContent))
            .filter(Boolean)
        );
        if (found.size < 4) return;
        const score = candidate.querySelectorAll("*").length;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
    });

    if (best) {
      best.classList.add("cw-photo-frame-size-picker");
      best.style.setProperty("max-width", "100%", "important");
      best.style.setProperty("width", "100%", "important");
      best.style.setProperty("box-sizing", "border-box", "important");
    }

    const qty = document.querySelector('input[name="quantity"]');
    const qtyWrap = qty?.closest("quantity-input,.quantity,.product-form__quantity") || qty?.parentElement;
    qtyWrap?.classList.add("cw-photo-frame-quantity");
  };

  const cleanUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      ["width", "height", "crop", "pad", "format"].forEach((key) =>
        url.searchParams.delete(key),
      );
      return url.href;
    } catch {
      return String(value || "");
    }
  };

  const descriptorFor = (url) => {
    const value = String(url || "").toLowerCase();
    for (const [size, view] of Object.entries(sizeViews)) {
      if (value.includes(view.match))
        return { key: `size:${size}`, type: "rect", rects: [view.rect] };
    }
    if (guideMatches.some((match) => value.includes(match)))
      return { key: "guide", type: "rect", rects: guideRects };
    if (sideMatches.some((match) => value.includes(match)))
      return { key: "side", type: "quad", quad: sideQuad };
    return null;
  };

  const rememberTargets = () => {
    if (!root()) return;
    document.querySelectorAll("img").forEach((image) => {
      const candidate = cleanUrl(image.currentSrc || image.src);
      const descriptor = descriptorFor(candidate);

      // Product themes often reuse the SAME <img> element when a customer
      // clicks another gallery thumbnail or changes a variant. If the element
      // was first tagged as 8x12, keeping that old dataset makes every later
      // image render back into the 8x12 mockup. Refresh the stored base/kind
      // whenever Shopify swaps this element to another known master asset.
      if (descriptor) {
        image.dataset.cwFrameBase = candidate;
        image.dataset.cwFrameKind = descriptor.key;
        return;
      }

      // A generated blob is our personalised result. When the theme reuses
      // the main gallery <img> after a thumbnail click, recover the exact
      // mockup kind/base from the blob so Guide/Side/Size never falls back
      // to the previously selected size.
      if (String(image.currentSrc || image.src).startsWith("blob:")) {
        const meta = renderedMeta.get(String(image.currentSrc || image.src));
        if (meta) {
          image.dataset.cwFrameBase = meta.baseUrl;
          image.dataset.cwFrameKind = meta.key;
        }
        return;
      }

      // If the theme reused this node for an unrelated image, do not let the
      // stale 8x12 (or other) mapping pull it back to the old mockup.
      delete image.dataset.cwFrameBase;
      delete image.dataset.cwFrameKind;
      delete image.dataset.cwFramePreview;
    });
  };

  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      if (!String(url).startsWith("blob:")) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Photo-frame preview image failed to load."));
      image.src = url;
    });

  const scaleRect = (rect, width, height) => [
    (rect[0] / MASTER_SIZE) * width,
    (rect[1] / MASTER_SIZE) * height,
    (rect[2] / MASTER_SIZE) * width,
    (rect[3] / MASTER_SIZE) * height,
  ];

  const drawRect = (ctx, art, rect) => {
    const [x0, y0, x1, y1] = rect;
    const inset = Math.max(1, Math.min(x1 - x0, y1 - y0) * 0.006);
    ctx.drawImage(
      art,
      x0 + inset,
      y0 + inset,
      Math.max(1, x1 - x0 - inset * 2),
      Math.max(1, y1 - y0 - inset * 2),
    );
  };

  const interpolate = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];

  const drawQuad = (ctx, art, quad, scaleX, scaleY) => {
    const q = quad.map(([x, y]) => [x * scaleX, y * scaleY]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    q.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.clip();

    const steps = Math.min(360, Math.max(160, art.naturalHeight || art.height || 240));
    const sourceHeight = art.naturalHeight || art.height;
    const sourceWidth = art.naturalWidth || art.width;
    for (let index = 0; index < steps; index += 1) {
      const t = (index + 0.5) / steps;
      const left = interpolate(q[0], q[3], t);
      const right = interpolate(q[1], q[2], t);
      const dx = right[0] - left[0];
      const dy = right[1] - left[1];
      const length = Math.hypot(dx, dy);
      const sy = (index / steps) * sourceHeight;
      const sh = Math.max(1, sourceHeight / steps + 1);
      ctx.save();
      ctx.translate(left[0], left[1]);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.drawImage(art, 0, sy, sourceWidth, sh, 0, -1.5, length, 3);
      ctx.restore();
    }
    ctx.restore();
  };

  const canvasBlobUrl = (canvas) =>
    new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Could not create the personalized frame preview."));
          resolve(URL.createObjectURL(blob));
        },
        "image/png",
        0.96,
      ),
    );

  const compose = async (baseUrl, descriptor, art) => {
    const base = await loadImage(baseUrl);
    const width = base.naturalWidth || base.width;
    const height = base.naturalHeight || base.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.drawImage(base, 0, 0, width, height);
    if (descriptor.type === "rect") {
      descriptor.rects
        .map((rect) => scaleRect(rect, width, height))
        .forEach((rect) => drawRect(ctx, art, rect));
    } else {
      drawQuad(
        ctx,
        art,
        descriptor.quad,
        width / MASTER_SIZE,
        height / MASTER_SIZE,
      );
    }
    return canvasBlobUrl(canvas);
  };

  const replaceImage = (image, url) => {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    const picture = image.closest("picture");
    picture?.querySelectorAll("source").forEach((source) => {
      source.removeAttribute("srcset");
      source.removeAttribute("sizes");
    });
    image.src = url;
    image.dataset.cwFramePreview = url;
    image.style.objectFit = "contain";
  };

  const renderAll = async () => {
    if (!artworkUrl || !root()) return;
    const token = ++generation;
    rememberTargets();
    const art = await loadImage(artworkUrl).catch(() => null);
    if (!art || token !== generation) return;

    renderedUrls.forEach((url) => {
      renderedMeta.delete(url);
      URL.revokeObjectURL(url);
    });
    renderedUrls = [];

    const targets = [...document.querySelectorAll("img[data-cw-frame-kind]")];
    const groups = new Map();
    for (const image of targets) {
      const key = image.dataset.cwFrameKind;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(image);
    }

    for (const [key, images] of groups) {
      if (token !== generation) return;
      const baseUrl = images[0]?.dataset.cwFrameBase;
      const descriptor = descriptorFor(baseUrl);
      if (!baseUrl || !descriptor) continue;
      try {
        const url = await compose(baseUrl, descriptor, art);
        if (token !== generation) {
          URL.revokeObjectURL(url);
          return;
        }
        renderedUrls.push(url);
        renderedMeta.set(url, { key, baseUrl });
        images.forEach((image) => replaceImage(image, url));
      } catch (error) {
        console.warn("Cartwala photo-frame gallery preview unavailable", error);
      }
    }
  };

  const scheduleRender = () => {
    if (!artworkUrl) return;
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(renderAll, 80);
  };

  const ensureSavedStatus = () => {
    const host = root();
    if (!host) return;
    let status = host.querySelector("[data-cw-frame-saved-status]");
    if (!status) {
      status = document.createElement("div");
      status.className = "cw-photo-frame-saved-status";
      status.dataset.cwFrameSavedStatus = "true";
      status.setAttribute("role", "status");
      status.innerHTML = "<span aria-hidden=\"true\">✓</span><strong>Photo saved</strong><span>You can edit it before ordering.</span>";
      host.querySelector("[data-cw-open]")?.insertAdjacentElement("afterend", status);
    }
    document.body.classList.add("cw-photo-frame-personalized");
  };

  const bindPreviewEvent = () => {
    const host = root();
    if (!host || host.dataset.cwFramePreviewBound === "true") return;
    host.dataset.cwFramePreviewBound = "true";
    host.addEventListener("cartwala:preview-ready", (event) => {
      const url = event.detail?.url;
      if (!url) return;
      artworkUrl = url;
      ensureSavedStatus();
      renderAll();
    });
  };
  const bindGalleryClicks = () => {
    if (document.documentElement.dataset.cwFrameGalleryClickBound === "true") return;
    document.documentElement.dataset.cwFrameGalleryClickBound = "true";

    const galleryRoot = () =>
      document.querySelector(
        ".product-gallery, media-gallery, [id^=\"MediaGallery-\"], .product__media-wrapper, .product-media, [data-product-gallery]"
      );

    const mainGalleryImage = () => {
      const gallery = galleryRoot() || document;
      const preferred = [
        ".product-gallery__main img[data-cw-frame-kind]",
        ".product__media-item.is-active img[data-cw-frame-kind]",
        ".product__media-item[aria-hidden=\"false\"] img[data-cw-frame-kind]",
        "[data-media-id].is-active img[data-cw-frame-kind]"
      ];
      for (const selector of preferred) {
        const image = gallery.querySelector(selector);
        if (image) return image;
      }
      const visible = [...gallery.querySelectorAll("img[data-cw-frame-kind]")]
        .map((img) => ({ img, rect: img.getBoundingClientRect() }))
        .filter(({ rect, img }) =>
          rect.width > 100 &&
          rect.height > 100 &&
          getComputedStyle(img).display !== "none" &&
          getComputedStyle(img).visibility !== "hidden"
        )
        .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
      return visible[0]?.img || null;
    };

    document.addEventListener("click", (event) => {
      if (!artworkUrl || !root()) return;

      const direct = event.target?.closest?.("img[data-cw-frame-kind]");
      const interactive = event.target?.closest?.(
        "button, a, [role=\"button\"], li, [data-media-id], [data-thumbnail]"
      );
      const clicked = direct || interactive?.querySelector?.("img[data-cw-frame-kind]");
      if (!clicked) return;

      const gallery = galleryRoot();
      if (gallery && !gallery.contains(clicked)) return;

      const desiredKind = clicked.dataset.cwFrameKind;
      const desiredBase = clicked.dataset.cwFrameBase;
      const desiredSrc = clicked.currentSrc || clicked.src;
      if (!desiredKind || !desiredBase || !desiredSrc) return;

      const applyToMain = () => {
        const gallery = galleryRoot() || document;
        const candidates = new Set();

        const primary = mainGalleryImage();
        if (primary) candidates.add(primary);

        [
          ".product-gallery__main img[data-cw-frame-kind]",
          ".product__media-item.is-active img[data-cw-frame-kind]",
          ".product__media-item[aria-hidden=\"false\"] img[data-cw-frame-kind]",
          "[data-media-id].is-active img[data-cw-frame-kind]"
        ].forEach((selector) => {
          gallery.querySelectorAll(selector).forEach((img) => candidates.add(img));
        });

        // Some themes do not mark the active media item reliably. In that
        // case, the large visible image is the actual product hero. Include
        // all large visible frame images, but never thumbnail-strip images.
        gallery.querySelectorAll("img[data-cw-frame-kind]").forEach((img) => {
          if (
            img === clicked ||
            img.closest(".product-gallery__thumbs,.thumbnail-list,[class*=\"thumb\" i],[data-thumbnail]")
          ) return;
          const rect = img.getBoundingClientRect();
          if (
            rect.width >= 180 &&
            rect.height >= 180 &&
            getComputedStyle(img).display !== "none" &&
            getComputedStyle(img).visibility !== "hidden"
          ) candidates.add(img);
        });

        candidates.forEach((main) => {
          if (!main || main === clicked || !document.contains(main)) return;
          main.dataset.cwFrameKind = desiredKind;
          main.dataset.cwFrameBase = desiredBase;
          replaceImage(main, desiredSrc);
        });
      };

      // Let the Shopify theme handle its own media selection first, then
      // re-apply the personalised media after each common gallery update
      // window. The final late pass covers themes that animate/swizzle media.
      [0, 80, 220, 500, 900, 1400].forEach((delay) =>
        window.setTimeout(applyToMain, delay)
      );
    }, true);
  };


  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (
      target.getAttribute("name") === "id" ||
      /^option[1-3]$/.test(target.getAttribute("name") || "")
    )
      scheduleRender();
  });

  document.addEventListener("shopify:section:load", () => {
    rememberTargets();
    scheduleRender();
  });

  const observer = new MutationObserver(() => {
    markPhotoFrameControls();
    rememberTargets();
    scheduleRender();
  });
  const start = () => {
    if (!root()) return;
    document.body.classList.add("cw-photo-frame-master-page");
    markPhotoFrameControls();
    bindPreviewEvent();
    bindGalleryClicks();
    rememberTargets();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();