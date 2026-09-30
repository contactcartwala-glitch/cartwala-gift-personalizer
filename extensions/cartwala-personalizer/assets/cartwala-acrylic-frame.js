(() => {
  const initialize = () => document.querySelectorAll("[data-cw-acrylic]").forEach((panel) => {
    if (panel.dataset.ready) return;
    panel.dataset.ready = "true";
    const root = panel.closest("[data-cw-personalizer]");
    let variants;
    try { variants = JSON.parse(panel.dataset.variants || "[]"); } catch { return; }
    const find = (id) => variants.find((variant) => String(variant.id) === String(id));
    let selected = find(new URLSearchParams(location.search).get("variant")) ||
      find(panel.dataset.selectedVariant) || variants[0];
    if (!selected) return;
    const choice = (variant, index) => variant[`option${index + 1}`] || variant.options?.[index];
    let optionNames;
    try { optionNames = JSON.parse(panel.dataset.optionNames || '["Size","Acrylic","Orientation"]'); } catch { return; }
    const option = (variant, name) => choice(variant, optionNames.indexOf(name));
    const designRatio = (panel.dataset.designRatio || "").split(":").map(Number);
    const fixedOrientation = panel.dataset.fixedOrientation ||
      (designRatio.length === 2 && designRatio[0] > designRatio[1] ? "Landscape" : "Portrait");
    const lookup = (values) => variants.find((variant) =>
      optionNames.every((_, index) => choice(variant, index) === values[index]));
    const syncCartVariant = () => document.querySelectorAll('form[action*="/cart/add"] input[name="id"]')
      .forEach((input) => {
        if (input.value === String(selected.id)) return;
        input.value = String(selected.id);
      });
    const gallery = document.querySelector("[data-gallery-main]");
    const galleryImage = gallery?.querySelector("img");
    gallery?.classList.add("cw-acrylic__gallery");
    gallery?.parentElement?.classList.add("cw-acrylic__gallery-container");
    const preview = document.createElement("div");
    preview.className = "cw-acrylic__gallery-preview";
    preview.hidden = true;
    preview.innerHTML = '<div class="cw-acrylic__room" aria-hidden="true"><div class="cw-acrylic__room-scale">Approx. 5 ft sofa for scale</div></div><div class="cw-acrylic__gallery-guide"><span data-cw-acrylic-height></span><div class="cw-acrylic__frame" data-cw-acrylic-frame><img class="cw-acrylic__photo" data-cw-acrylic-photo alt="Your acrylic frame design"></div><span data-cw-acrylic-width></span><strong data-cw-acrylic-caption></strong></div>';
    if (panel.dataset.roomImage) preview.style.setProperty("--cw-acrylic-room-image", `url("${panel.dataset.roomImage}")`);
    if (panel.dataset.studImage) preview.style.setProperty("--cw-acrylic-stud-image", `url("${panel.dataset.studImage}")`);
    gallery?.appendChild(preview);
    let designUrl = panel.dataset.designImage || "";
    const showPreview = () => {
      if (!gallery || !designUrl) return;
      preview.querySelector("[data-cw-acrylic-photo]").src = designUrl;
      preview.hidden = false;
      galleryImage?.classList.add("cw-acrylic__gallery-original--hidden");
    };
    root.addEventListener("cartwala:preview-ready", (event) => {
      if (!event.detail?.url) return;
      designUrl = event.detail.url;
      showPreview();
    });
    const frame = preview.querySelector("[data-cw-acrylic-frame]");
    const selectGalleryMedia = () => {
      const media = selected.featured_media;
      const thumbnail = media?.id && document.querySelector(`[data-gallery-thumb][data-media-id="${media.id}"]`);
      if (!thumbnail) return;
      if (!thumbnail.classList.contains("is-active")) thumbnail.click();
      const mainImage = document.querySelector("[data-gallery-main] img");
      if (mainImage && media.alt) mainImage.alt = media.alt;
    };
    const render = () => {
      const size = option(selected, "Size");
      const orientation = panel.dataset.fixedOrientation || option(selected, "Orientation") || fixedOrientation;
      const [short, long] = size.split(" ")[0].split("×").map(Number);
      if (!Number.isFinite(short) || !Number.isFinite(long)) return;
      const width = orientation === "Landscape" ? long : short;
      const height = orientation === "Landscape" ? short : long;
      // Keep the room reference fixed: the 78%-wide sofa represents roughly 60 inches.
      frame.style.width = `${(width / 60) * 78}%`;
      frame.style.height = `${(height / 60) * 78}%`;
      frame.style.setProperty("--cw-acrylic-stud-size", `${Math.max(4, Math.min(12, Math.round(short / 2)))}px`);
      frame.classList.toggle("cw-acrylic__frame--studs",
        (option(selected, "Thickness") || option(selected, "Acrylic")) === "5mm with studs");
      if (!designUrl) selectGalleryMedia();
      preview.querySelector("[data-cw-acrylic-width]").textContent = `← ${width}″ width →`;
      preview.querySelector("[data-cw-acrylic-height]").textContent = `${height}″ height`;
      preview.querySelector("[data-cw-acrylic-caption]").textContent = `${size.replace(" inches", "")}, ${orientation}`;
      root.dispatchEvent(new CustomEvent("cw:acrylic-selection", {
        detail: { ratio: `${width}:${height}`, variantId: String(selected.id) },
      }));
      if (designUrl) showPreview();
    };
    render();
    syncCartVariant();
    // The theme's deferred gallery script can bind after this app block runs.
    if (document.readyState !== "complete") window.addEventListener("load", () => {
      if (!designUrl) selectGalleryMedia();
      syncCartVariant();
    }, { once: true });
    // Keep the guide aligned when a theme variant picker is used instead.
    document.addEventListener("change", (event) => {
      if (event.target?.name === "id") {
        const next = find(event.target.value);
        if (next && next.id !== selected.id) { selected = next; render(); }
      } else if (["option1", "option2", "option3"].includes(event.target?.name)) {
        const current = optionNames.map((_, index) =>
          document.querySelector(`input[name="option${index + 1}"]:checked`)?.value || choice(selected, index));
        const next = lookup(current);
        if (next && next.id !== selected.id) {
          selected = next;
          render();
          syncCartVariant();
          const url = new URL(location.href);
          url.searchParams.set("variant", String(next.id));
          history.replaceState(history.state, "", url.href);
        }
      }
    });
  });
  initialize();
  document.addEventListener("shopify:section:load", initialize);
})();
