export type AcrylicMockup = {
  mockup: string; mockupName: string; fileId?: string;
  x: number; y: number; width: number; height: number; mockupAspect: number;
};
export type AcrylicMockups = Record<string, AcrylicMockup | null>;

export function acrylicChoice(size: string, thickness: string, direction: string) {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?: inches)?$/i);
  if (!match || !["3mm", "5mm"].includes(thickness) || !["Portrait", "Landscape"].includes(direction))
    throw new Error("Choose a size, thickness and direction.");
  const [a, b] = [Number(match[1]), Number(match[2])];
  if (!(a > 0 && b > a && b <= 100)) throw new Error("Check the frame size.");
  return `${a}×${b}|${thickness}|${direction}`;
}

export function choiceDimensions(choice: string) {
  const [size, thickness, direction] = choice.split("|");
  if (acrylicChoice(size, thickness, direction) !== choice) throw new Error("Check the frame selection.");
  const [a, b] = size.split("×").map(Number);
  return { width: direction === "Landscape" ? b : a, height: direction === "Landscape" ? a : b };
}

export function validateAcrylicMockup(value: unknown, choice: string): AcrylicMockup | null {
  if (value === null) return null;
  const t = value as AcrylicMockup;
  const dimensions = choiceDimensions(choice);
  let url: URL;
  try { url = new URL(t?.mockup); } catch { throw new Error("Upload the mockup PNG first."); }
  if (url.protocol !== "https:" || url.hostname !== "cdn.shopify.com" || url.username || url.password ||
      ![t.x, t.y, t.width, t.height, t.mockupAspect].every(Number.isFinite) ||
      t.width <= 0 || t.height <= 0 || t.mockupAspect <= 0 || t.mockupAspect > 64 ||
      t.x - t.width / 2 < -0.01 || t.x + t.width / 2 > 100.01 ||
      t.y - t.height / 2 < -0.01 || t.y + t.height / 2 > 100.01 ||
      Math.abs((t.width / t.height * t.mockupAspect) / (dimensions.width / dimensions.height) - 1) > .08)
    throw new Error("The mockup opening does not match this size and direction.");
  return { mockup: url.href, mockupName: String(t.mockupName || "Mockup PNG").slice(0, 200),
    ...(t.fileId ? { fileId: String(t.fileId) } : {}),
    x: t.x, y: t.y, width: t.width, height: t.height, mockupAspect: t.mockupAspect };
}

export function legacyAcrylicMockups(config: unknown): AcrylicMockups {
  const templates: AcrylicMockups = {};
  const previews = (config as { previews?: Record<string, Record<string, unknown>> })?.previews || {};
  for (const t of Object.values(previews)) {
    if (!t.mockup) continue;
    const w = Number(t.widthInches), h = Number(t.heightInches);
    const thickness = /5mm/i.test(String(t.mockupName || t.mockup)) ? "5mm" : "3mm";
    try {
      const key = acrylicChoice(`${Math.min(w, h)}×${Math.max(w, h)}`, thickness, w > h ? "Landscape" : "Portrait");
      templates[key] = validateAcrylicMockup(t, key);
    } catch { /* Leave invalid legacy files available in Shopify Files. */ }
  }
  return templates;
}
