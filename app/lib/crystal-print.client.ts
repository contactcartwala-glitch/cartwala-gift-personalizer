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
  const spec = crystalPrintSpec(attributes);
  const source = attributes['_Background removed photo'];
  if (!spec || !/^https:\/\//.test(source || '')) throw new Error('Saved crystal artwork is missing. The customer photo must be attached before export.');
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => resolve(im); im.onerror = () => reject(new Error('Could not load the crystal photo')); im.src = source; });
  const width = Math.round(spec.widthCm / 2.54 * 300), height = Math.round(spec.heightCm / 2.54 * 300);
  if (width * height > 40000000) throw new Error('Crystal artwork is too large.');
  const [x, y, w, h] = spec.bounds;
  const photo = canvas(width, height), text = canvas(width, height), background = canvas(width, height), composite = canvas(width, height);
  for (const c of [photo, text]) { const ctx = c.getContext('2d')!; ctx.scale(width / w, height / h); ctx.translate(-x, -y); ctx.clip(new Path2D(spec.path)); }
  const scale = Math.min(spec.fit[0] / image.width, spec.fit[1] / image.height) * spec.crop.zoom;
  photo.getContext('2d')!.drawImage(image, spec.crop.x - image.width * scale / 2, spec.crop.y - image.height * scale / 2, image.width * scale, image.height * scale);
  const tc = text.getContext('2d')!, lines = spec.message.split('\n').slice(0, 2);
  await document.fonts.load(`${spec.text[3]}px ${spec.font}`);
  let fs = spec.text[3]; tc.font = `${fs}px ${spec.font}`;
  while (fs > 16 && lines.some(line => tc.measureText(line).width > spec.text[2])) { fs--; tc.font = `${fs}px ${spec.font}`; }
  tc.translate(spec.textTransform.x, spec.textTransform.y); tc.rotate(spec.textTransform.rotation); tc.scale(spec.textTransform.scale, spec.textTransform.scale);
  tc.fillStyle = '#000'; tc.textAlign = 'center'; tc.textBaseline = 'middle';
  lines.forEach((line, i) => tc.fillText(line, 0, (i - (lines.length - 1) / 2) * (fs + 3)));
  const bc = background.getContext('2d')!; bc.fillStyle = '#fff'; bc.fillRect(0, 0, width, height);
  const cc = composite.getContext('2d')!; [background, photo, text].forEach(c => cc.drawImage(c, 0, 0));
  if (format === 'jpg') return new Blob([new Uint8Array(jpegWithPrintDpi(new Uint8Array(await (await blob(composite, 'image/jpeg')).arrayBuffer())))], { type: 'image/jpeg' });
  const { writePsd } = await import('ag-psd');
  const bytes = writePsd({ width, height, canvas: composite,
    imageResources: { resolutionInfo: { horizontalResolution: 300, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: 300, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } },
    children: [{ name: 'White background', canvas: background }, { name: 'Customer photo - positioned cutout', canvas: photo }, ...(spec.message.trim() ? [{ name: 'Message - raster text', canvas: text }] : [])],
  });
  return new Blob([new Uint8Array(bytes)], { type: 'image/vnd.adobe.photoshop' });
}
