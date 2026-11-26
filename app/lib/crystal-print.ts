export type CrystalPrint = {
  version: 1; widthCm: number; heightCm: number;
  bounds: number[]; path: string; fit: number[];
  crop: { x: number; y: number; zoom: number };
  text: number[]; textTransform: { x: number; y: number; scale: number; rotation: number };
  message: string; font: string;
};
export function crystalPrintSpec(attributes: Record<string, string>): CrystalPrint | null {
  try {
    const spec = JSON.parse(attributes['_Crystal Print JSON'] || 'null');
    if (spec?.version !== 1 || ![spec.widthCm, spec.heightCm].every(n => Number.isFinite(n) && n > 0 && n <= 100) ||
      ![spec.bounds, spec.fit, spec.text].every(a => Array.isArray(a) && a.every(Number.isFinite)) ||
      spec.bounds.length !== 4 || spec.bounds[2] <= 0 || spec.bounds[3] <= 0 || spec.fit.length !== 2 || spec.text.length !== 4 ||
      typeof spec.path !== 'string' || spec.path.length > 5000 ||
      ![spec.crop?.x, spec.crop?.y, spec.crop?.zoom, spec.textTransform?.x, spec.textTransform?.y, spec.textTransform?.scale, spec.textTransform?.rotation].every(Number.isFinite) ||
      spec.crop.zoom <= 0 || spec.textTransform.scale <= 0 || typeof spec.message !== 'string' || typeof spec.font !== 'string') return null;
    return spec;
  } catch { return null; }
}
