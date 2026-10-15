import { jpegWithPrintDpi } from './polaroid-print-export.client';

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
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const blob = (c: HTMLCanvasElement, type: string) => new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Crystal export failed')), type, .98));
export async function crystalPrintFile(attributes: Record<string, string>, format: 'jpg' | 'psd') {
  const source = attributes['_Personalised Preview'];
  if (!/^https:\/\//.test(source || '')) throw new Error('The saved customer crystal preview is missing.');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => resolve(im); im.onerror = () => reject(new Error('Could not load the saved crystal preview')); im.src = source; });
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  if (!width || !height || width * height > 40000000) throw new Error('The saved crystal preview has invalid dimensions.');
  const composite = canvas(width, height);
  composite.getContext('2d')!.drawImage(image, 0, 0);
  if (format === 'jpg') return new Blob([new Uint8Array(jpegWithPrintDpi(new Uint8Array(await (await blob(composite, 'image/jpeg')).arrayBuffer())))], { type: 'image/jpeg' });
  const { writePsd } = await import('ag-psd');
  const bytes = writePsd({ width, height, canvas: composite,
    imageResources: { resolutionInfo: { horizontalResolution: 300, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: 300, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } },
    children: [{ name: 'Customer-approved crystal preview (saved composite)', canvas: composite }],
  });
  return new Blob([new Uint8Array(bytes)], { type: 'image/vnd.adobe.photoshop' });
}
