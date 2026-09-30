export type Direction = "Portrait" | "Landscape";
export type PreviewTemplate = { image: string; background: string; overlay: string; x: number; y: number; width: number; height: number; studs: boolean; mockup?: string; mockupAspect?: number; mockupName?: string };
export type GroupRow = { id: string; values: string[]; price: number; compare: number | null; width: number; height: number; templates: Record<Direction, PreviewTemplate> };
export type ProductGroup = { id: string; name: string; tags: string[]; collectionIds: string[]; productIds: string[]; excludedIds: string[]; keepPriceIds: string[]; options: string[]; rows: GroupRow[]; compareMode: "manual" | "percent" | "none"; percentage: number; previewMode: "manual" | "automatic" | "off" | "png"; customization: "plain" | "design" | "existing"; direction: "customer" | "portrait" | "landscape" | "product"; orientationOption: string; portraitTag: string; landscapeTag: string; background: string; createVariants: boolean };
export type GroupState = { version: 1; appliedImportId?: string; groups: ProductGroup[]; published: ProductGroup[]; history: Array<{ at: string; name: string; groups: ProductGroup[]; published: ProductGroup[] }> };
export const emptyTemplate = (): PreviewTemplate => ({ image: "", background: "", overlay: "", x: 50, y: 34, width: 30, height: 45, studs: false });
export const emptyGroup = (id: string): ProductGroup => ({ id, name: "New Product Group", tags: [], collectionIds: [], productIds: [], excludedIds: [], keepPriceIds: [], options: ["Size", "Material"], rows: [], compareMode: "manual", percentage: 0, previewMode: "png", customization: "plain", direction: "customer", orientationOption: "Orientation", portraitTag: "", landscapeTag: "", background: "", createVariants: true });
export const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s*(inches|inch|in|\")\s*$/i, "").replace(/\s*[x×]\s*/g, "×");
export const rowKey = (values: string[]) => values.map(normalizeValue).join("|");
export function comparePrice(group: ProductGroup, row: GroupRow): number | null {
  if (group.compareMode === "none") return null;
  return group.compareMode === "percent" ? Math.round(row.price * (1 + group.percentage / 100) * 100) / 100 : row.compare;
}
export function matches(group: ProductGroup, product: { id: string; tags: string[]; collectionIds: string[] }): boolean {
  return !group.excludedIds.includes(product.id) && (group.productIds.includes(product.id) || [...group.tags,group.portraitTag,group.landscapeTag].filter(Boolean).some(tag => product.tags.includes(tag.trim())) || group.collectionIds.some(id => product.collectionIds.includes(id)));
}
export function directionFor(group: ProductGroup, tags: string[]): Direction | null {
  const p = !!group.portraitTag && tags.includes(group.portraitTag), l = !!group.landscapeTag && tags.includes(group.landscapeTag);
  if (p && l) throw new Error("Both direction tags are present. Keep only one.");
  if (p) return "Portrait"; if (l) return "Landscape";
  if (group.direction === "portrait") return "Portrait";
  if (group.direction === "landscape") return "Landscape";
  return null;
}
export function validateGroup(value: unknown): ProductGroup {
  const g = value as ProductGroup;
  if (!g || !/^[a-zA-Z0-9_-]{1,80}$/.test(g.id) || !g.name?.trim()) throw new Error("Enter a group name.");
  for (const key of ["tags", "collectionIds", "productIds", "excludedIds", "keepPriceIds", "options"] as const) {
    if (!Array.isArray(g[key]) || g[key].some(v => typeof v !== "string" || v.length > 255) || g[key].length > 1000) throw new Error(`Check ${key}.`);
    g[key] = [...new Set(g[key].map(v => v.trim()).filter(Boolean))];
  }
  if (!g.tags.length && !g.collectionIds.length && !g.productIds.length) throw new Error("Choose at least one tag, collection or product.");
  if (!g.options.length || g.options.length > 3 || new Set(g.options.map(v => v.toLowerCase())).size !== g.options.length) throw new Error("Use one to three different option names.");
  if (!["manual", "percent", "none"].includes(g.compareMode) || !["manual", "automatic", "off", "png"].includes(g.previewMode) || !["plain", "design", "existing"].includes(g.customization) || !["customer", "portrait", "landscape", "product"].includes(g.direction)) throw new Error("Check group settings.");
  if (!Number.isFinite(g.percentage) || g.percentage < 0 || g.percentage > 1000) throw new Error("Percentage must be between 0 and 1000.");
  if (g.direction === "customer" && (g.options.length > 2 || !g.orientationOption?.trim() || g.options.includes(g.orientationOption))) throw new Error("Customer orientation requires a separate option and at most two other options.");
  const url = (v: string) => { if (v && (!/^https:\/\//.test(v) || v.length > 2048)) throw new Error("Images must use an HTTPS URL."); };
  url(g.background);
  if (!Array.isArray(g.rows) || !g.rows.length || g.rows.length > 100) throw new Error("Add between 1 and 100 price rows.");
  const keys = new Set<string>();
  for (const r of g.rows) {
    if (!r.id || !Array.isArray(r.values) || r.values.length !== g.options.length || r.values.some(v => typeof v !== "string" || !v.trim())) throw new Error("Every row needs a value for each option.");
    r.values = r.values.map(v => v.trim()); const key = rowKey(r.values);
    if (keys.has(key)) throw new Error("Two rows have the same option values."); keys.add(key);
    const money = (n: number) => Number.isFinite(n) && n > 0 && n <= 10000000 && Math.abs(n*100-Math.round(n*100)) < .00001;
    if (!money(r.price) || (r.compare !== null && !money(r.compare))) throw new Error("Prices must be positive with up to two decimals.");
    const compare = comparePrice(g,r); if (compare !== null && compare <= r.price) throw new Error("Crossed-out price must be higher than selling price, or leave it empty.");
    if (![r.width,r.height].every(n => Number.isFinite(n) && n > 0 && n <= 1000)) throw new Error("Enter valid physical width and height.");
    for (const direction of ["Portrait", "Landscape"] as const) {
      const t = r.templates?.[direction]; if (!t) throw new Error("Both preview directions need settings.");
      [t.image,t.background,t.overlay,t.mockup||""].forEach(url);
      if(t.mockup&&(!Number.isFinite(t.mockupAspect)||t.mockupAspect!<=0))throw new Error("Upload the mockup PNG again.");
      if (![t.x,t.y,t.width,t.height].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !t.width || !t.height || t.x-t.width/2 < 0 || t.x+t.width/2 > 100 || t.y-t.height/2 < 0 || t.y+t.height/2 > 100) throw new Error("Keep the photo box inside its background.");
    }
  }
  return g;
}
export function escapeCsv(value: unknown) { return '"' + String(value ?? "").replace(/"/g,'""') + '"'; }
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i=0;i<input.length;i++) { const c=input[i]; if(c==='"') { if(quoted && input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; } else if(c===','&&!quoted){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell="";}else cell+=c; }
  if(quoted)throw new Error("CSV has an unclosed quote.");row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
}
