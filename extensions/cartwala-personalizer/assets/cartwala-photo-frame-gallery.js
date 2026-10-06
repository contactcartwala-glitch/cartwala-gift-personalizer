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

  const root = () =>
    document.querySelector(
      '[data-cw-personalizer][data-cw-photo-frame-master="true"]',
    );

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
      if (image.dataset.cwFrameBase && image.dataset.cwFrameKind) return;
      const candidate = cleanUrl(image.currentSrc || image.src);
      const descriptor = descriptorFor(candidate);
      if (!descriptor) return;
      image.dataset.cwFrameBase = candidate;
      image.dataset.cwFrameKind = descriptor.key;
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

    renderedUrls.forEach((url) => URL.revokeObjectURL(url));
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

  document.addEventListener("cartwala:preview-ready", (event) => {
    const host =
      event.target instanceof Element
        ? event.target.closest("[data-cw-personalizer]")
        : null;
    if (!host || host.dataset.cwPhotoFrameMaster !== "true") return;
    const url = event.detail?.url;
    if (!url) return;
    artworkUrl = url;
    renderAll();
  });

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
    rememberTargets();
    scheduleRender();
  });
  const start = () => {
    if (!root()) return;
    rememberTargets();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();