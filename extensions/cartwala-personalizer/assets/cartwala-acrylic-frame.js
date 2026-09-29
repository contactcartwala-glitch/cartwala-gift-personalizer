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
    const slots = [panel.querySelector("[data-cw-acrylic-sizes]"),
      panel.querySelector("[data-cw-acrylic-orientations]"), panel.querySelector("[data-cw-acrylic-materials]")];
    const lists = [sizes, orientations, materials];
    const indices = [0, 2, 1];
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
        render();
        const url = new URL(location.href);
        url.searchParams.set("variant", String(next.id));
        // A fresh product page also updates the theme's own price and cart variant.
        location.assign(url.href);
      });
      slot.appendChild(button);
      return button;
    }));
    const frame = panel.querySelector("[data-cw-acrylic-frame]");
    const render = () => {
      const size = choice(selected, 0);
      const orientation = choice(selected, 2);
      const [short, long] = size.split(" ")[0].split("×").map(Number);
      if (!Number.isFinite(short) || !Number.isFinite(long)) return;
      const width = orientation === "Landscape" ? long : short;
      const height = orientation === "Landscape" ? short : long;
      frame.style.width = `${(width / 36) * 270}px`;
      frame.style.height = `${(height / 36) * 270}px`;
      frame.classList.toggle("cw-acrylic__frame--studs", choice(selected, 1) === "5mm with studs");
      panel.querySelector("[data-cw-acrylic-width]").textContent = `← ${width}″ width →`;
      panel.querySelector("[data-cw-acrylic-height]").textContent = `${height}″ height`;
      panel.querySelector("[data-cw-acrylic-caption]").textContent = `${size.replace(" inches", "")}, ${orientation}`;
      panel.querySelector("[data-cw-acrylic-price]").textContent =
        `₹${(Number(selected.price) / 100).toLocaleString("en-IN")} · ${choice(selected, 1)}`;
      buttons.forEach((group, index) => group.forEach((button, valueIndex) => {
        const active = lists[index][valueIndex] === choice(selected, indices[index]);
        button.setAttribute("aria-pressed", String(active));
      }));
      root.dispatchEvent(new CustomEvent("cw:acrylic-selection", {
        detail: { ratio: `${width}:${height}`, variantId: String(selected.id) },
      }));
    };
    render();
    // Keep the guide aligned when a theme variant picker is used instead.
    document.addEventListener("change", (event) => {
      if (event.target?.name !== "id") return;
      const next = find(event.target.value);
      if (next) { selected = next; render(); }
    });
  });
  initialize();
  document.addEventListener("shopify:section:load", initialize);
})();
