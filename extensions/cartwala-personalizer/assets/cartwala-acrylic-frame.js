(() => {
  const sizes = ["8×12 inches", "12×18 inches", "16×24 inches", "20×30 inches", "24×36 inches"];
  const orientations = ["Portrait", "Landscape"];
  const materials = ["3mm without studs", "5mm with studs"];
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
    const lookup = (size, material, orientation) => variants.find((variant) =>
      choice(variant, 0) === size && choice(variant, 1) === material && choice(variant, 2) === orientation);
    const syncCartVariant = () => document.querySelectorAll('form[action*="/cart/add"] input[name="id"]')
      .forEach((input) => {
        if (input.value === String(selected.id)) return;
        input.value = String(selected.id);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    const slots = [panel.querySelector("[data-cw-acrylic-sizes]"),
      panel.querySelector("[data-cw-acrylic-orientations]"), panel.querySelector("[data-cw-acrylic-materials]")];
    const lists = [sizes, orientations, materials];
    const indices = [0, 2, 1];
    const gallery = document.querySelector("[data-gallery-main]");
    const galleryImage = gallery?.querySelector("img");
    gallery?.classList.add("cw-acrylic__gallery");
    const preview = document.createElement("div");
    preview.className = "cw-acrylic__gallery-preview";
    preview.hidden = true;
    preview.innerHTML = '<div class="cw-acrylic__gallery-guide"><span data-cw-acrylic-height></span><div class="cw-acrylic__frame" data-cw-acrylic-frame><img class="cw-acrylic__photo" data-cw-acrylic-photo alt="Your acrylic frame design"></div><span data-cw-acrylic-width></span><strong data-cw-acrylic-caption></strong></div>';
    gallery?.appendChild(preview);
    let designUrl = "";
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
    const buttons = slots.map((slot, group) => lists[group].map((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cw-acrylic__choice";
      button.textContent = value.replace(" inches", '″');
      button.addEventListener("click", () => {
        const options = [choice(selected, 0), choice(selected, 1), choice(selected, 2)];
        options[indices[group]] = value;
        const next = lookup(...options);
        if (!next || next.id === selected.id) return;
        selected = next;
        // The theme picker updates the displayed price, gallery and availability in place.
        const nativeOption = [...document.querySelectorAll(`input[type="radio"][name="option${indices[group] + 1}"]`)]
          .find((input) => input.value === value);
        nativeOption?.click();
        syncCartVariant();
        render();
        const url = new URL(location.href);
        url.searchParams.set("variant", String(next.id));
        history.replaceState(history.state, "", url.href);
      });
      slot.appendChild(button);
      return button;
    }));
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
      const size = choice(selected, 0);
      const orientation = choice(selected, 2);
      const [short, long] = size.split(" ")[0].split("×").map(Number);
      if (!Number.isFinite(short) || !Number.isFinite(long)) return;
      const width = orientation === "Landscape" ? long : short;
      const height = orientation === "Landscape" ? short : long;
      frame.style.width = `${(width / 36) * 72}%`;
      frame.style.height = `${(height / 36) * 72}%`;
      frame.classList.toggle("cw-acrylic__frame--studs", choice(selected, 1) === "5mm with studs");
      if (!designUrl) selectGalleryMedia();
      preview.querySelector("[data-cw-acrylic-width]").textContent = `← ${width}″ width →`;
      preview.querySelector("[data-cw-acrylic-height]").textContent = `${height}″ height`;
      preview.querySelector("[data-cw-acrylic-caption]").textContent = `${size.replace(" inches", "")}, ${orientation}`;
      panel.querySelector("[data-cw-acrylic-price]").textContent =
        `₹${(Number(selected.price) / 100).toLocaleString("en-IN")} · ${choice(selected, 1)}`;
      buttons.forEach((group, index) => group.forEach((button, valueIndex) => {
        const active = lists[index][valueIndex] === choice(selected, indices[index]);
        button.setAttribute("aria-pressed", String(active));
      }));
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
    }, { once: true });
    // Keep the guide aligned when a theme variant picker is used instead.
    document.addEventListener("change", (event) => {
      if (event.target?.name === "id") {
        const next = find(event.target.value);
        if (next && next.id !== selected.id) { selected = next; render(); }
      } else if (["option1", "option2", "option3"].includes(event.target?.name)) {
        const current = [1, 2, 3].map((index) =>
          document.querySelector(`input[name="option${index}"]:checked`)?.value);
        const next = lookup(...current);
        if (next && next.id !== selected.id) {
          selected = next;
          render();
          syncCartVariant();
        }
      }
    });
  });
  initialize();
  document.addEventListener("shopify:section:load", initialize);
})();
