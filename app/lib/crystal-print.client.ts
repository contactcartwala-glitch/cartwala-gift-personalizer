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
async function loadCrystalImage(source: string) {
  if (!/^https:\/\//.test(source || '')) throw new Error('A saved crystal source image is missing.');
  return new Promise<HTMLImageElement>((resolve, reject) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => resolve(im); im.onerror = () => reject(new Error('Could not load a saved crystal image')); im.src = source; });
}
const crystalTints: Record<string, number[]> = {"square-cube": [255, 255, 255], "cut-cube": [255, 255, 255], "rectangle-cube": [255, 255, 255], "stand-heart": [255, 255, 255], "wide-heart": [255, 255, 255], "half-moon": [255, 255, 255], "rounded-landscape": [255, 255, 255], "rounded-portrait": [255, 255, 255], "diamond": [255, 255, 255], "oval": [255, 255, 255], "square-plaque": [255, 255, 255], "leaf-heart": [255, 255, 255], "leaf": [255, 255, 255], "rectangle-heart": [255, 255, 255], "rectangle-plaque": [255, 255, 255], "half-diamond": [255, 255, 255], "two-heart": [255, 255, 255], "rectangle-zigzag": [255, 255, 255], "horizontal-zigzag": [255, 255, 255], "rectangle-wave": [255, 255, 255], "thick-moon": [255, 255, 255], "thick-square": [255, 255, 255], "wave-heart": [255, 255, 255], "apple": [255, 255, 255], "love-heart": [255, 255, 255], "heart-iceberg": [255, 255, 255], "mountain-iceberg": [255, 255, 255], "big-iceberg": [255, 255, 255], "bend-heart": [255, 255, 255], "thick-rectangle": [255, 255, 255], "rectangle-stand": [255, 255, 255], "big-diamond": [255, 255, 255], "thick-heart": [255, 255, 255], "big-wave": [255, 255, 255], "wooden-frame": [255, 255, 255], "heart-keychain": [222, 255, 230], "diamond-keychain": [212, 229, 255], "rectangle-keychain": [212, 229, 255], "square-keychain": [255, 242, 210]};
export async function crystalPrintFile(attributes: Record<string, string>, format: 'jpg' | 'psd') {
  const image = await loadCrystalImage(attributes['_Personalised Preview']);
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  if (!width || !height || width * height > 40000000) throw new Error('The saved crystal preview has invalid dimensions.');
  const composite = canvas(width, height);
  composite.getContext('2d')!.drawImage(image, 0, 0);
  if (format === 'jpg') return new Blob([new Uint8Array(jpegWithPrintDpi(new Uint8Array(await (await blob(composite, 'image/jpeg')).arrayBuffer())))], { type: 'image/jpeg' });
  const spec = crystalPrintSpec(attributes);
  if (!spec) throw new Error('The saved crystal layer layout is missing. JPG preview is still available.');
  const saved = JSON.parse(attributes['_Crystal crop'] || '{}');
  const tint = crystalTints[saved.model];
  if (!tint || !/^https:\/\//.test(saved.mockup || '')) throw new Error('The saved crystal mockup is missing.');
  const [blank, cutout] = await Promise.all([loadCrystalImage(saved.mockup), loadCrystalImage(attributes['_Background removed photo'])]);
  const layout = saved.sizeTransform || { sx: 1, sy: 1, anchor: [627, 1010] };
  if (![layout.sx, layout.sy, ...layout.anchor].every(Number.isFinite) || layout.sx <= 0 || layout.sy <= 0) throw new Error('Invalid saved crystal transform.');
  const path = new Path2D(spec.path), background = canvas(width, height), crystal = canvas(width, height), photo = canvas(width, height), text = canvas(width, height), photoMask = canvas(width, height);
  const transform = (c: HTMLCanvasElement) => { const ctx = c.getContext('2d')!; ctx.scale(width / 1254, height / 1254); ctx.translate(...layout.anchor as [number, number]); ctx.scale(layout.sx, layout.sy); ctx.translate(-layout.anchor[0], -layout.anchor[1]); return ctx; };
  const shape = canvas(1254, 1254), sc = shape.getContext('2d')!;
  sc.fillStyle = '#fff'; sc.strokeStyle = '#fff'; sc.lineJoin = 'round';
  const [x, y, w, h] = spec.bounds;
  if (['square-cube', 'rectangle-cube', 'thick-rectangle'].includes(saved.model)) sc.fillRect(x - 45, y - 65, w + 140, h + 115);
  else { sc.fill(path); sc.lineWidth = 75; sc.stroke(path); sc.save(); sc.filter = 'blur(16px)'; sc.fillRect(x - 40, y + h - 15, w + 80, 200); sc.restore(); }
  const glass = canvas(1254, 1254), gc = glass.getContext('2d')!; gc.drawImage(blank, 0, 0, 1254, 1254); gc.globalCompositeOperation = 'destination-in'; gc.drawImage(shape, 0, 0);
  const bc = background.getContext('2d')!;
  if (layout.sx === 1 && layout.sy === 1) {
    bc.drawImage(blank, 0, 0, width, height);
    const split = canvas(width, height), pc = split.getContext('2d')!; pc.drawImage(shape, 0, 0, width, height);
    const pixels = pc.getImageData(0, 0, width, height); for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] > 0 ? 255 : 0; pc.putImageData(pixels, 0, 0);
    const cc = crystal.getContext('2d')!; cc.drawImage(blank, 0, 0, width, height); cc.globalCompositeOperation = 'destination-in'; cc.drawImage(split, 0, 0); cc.globalCompositeOperation = 'source-over';
    bc.globalCompositeOperation = 'destination-out'; bc.drawImage(split, 0, 0); bc.globalCompositeOperation = 'source-over';
  } else { bc.drawImage(blank, 0, 0, 65, 1254, 0, 0, width, height); transform(crystal).drawImage(glass, 0, 0); }
  const engraved = canvas(cutout.width, cutout.height), ec = engraved.getContext('2d')!; ec.drawImage(cutout, 0, 0);
  const engraving = ec.getImageData(0, 0, engraved.width, engraved.height), d = engraving.data;
  for (let i = 0; i < d.length; i += 4) { const light = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255; const tone = Math.max(0, Math.min(1, (light - .12) * 1.65)), grain = .98 + ((i * 13 % 101) / 100) * .02; d[i + 3] = Math.round(d[i + 3] * Math.pow(tone, .8) * grain); [d[i], d[i + 1], d[i + 2]] = tint; }
  ec.putImageData(engraving, 0, 0);
  const scale = Math.min(spec.fit[0] / cutout.width, spec.fit[1] / cutout.height) * spec.crop.zoom;
  transform(photo).drawImage(engraved, spec.crop.x - cutout.width * scale / 2, spec.crop.y - cutout.height * scale / 2, cutout.width * scale, cutout.height * scale);
  const mc = transform(photoMask); mc.fillStyle = '#fff'; mc.fill(path);
  const tc = transform(text); tc.clip(path); const lines = spec.message.split('\n').slice(0, 2);
  await document.fonts.load(`${spec.text[3]}px ${spec.font}`);
  let fs = spec.text[3]; tc.font = `${fs}px ${spec.font}`; while (fs > 16 && lines.some(line => tc.measureText(line).width > spec.text[2])) { fs--; tc.font = `${fs}px ${spec.font}`; }
  tc.translate(spec.textTransform.x, spec.textTransform.y); tc.rotate(spec.textTransform.rotation); tc.scale(spec.textTransform.scale, spec.textTransform.scale); tc.fillStyle = 'rgba(245,247,247,.88)'; tc.textAlign = 'center'; tc.textBaseline = 'middle'; lines.forEach((line, i) => tc.fillText(line, 0, (i - (lines.length - 1) / 2) * (fs + 3)));
  // Photoshop masks read luminance, not alpha: flatten the shape over black.
  const mask = canvas(width, height), maskCtx = mask.getContext('2d')!; maskCtx.fillStyle = '#000'; maskCtx.fillRect(0, 0, width, height); maskCtx.drawImage(photoMask, 0, 0);
  const { writePsd } = await import('ag-psd');
  const bytes = writePsd({ width, height, canvas: composite,
    imageResources: { resolutionInfo: { horizontalResolution: 300, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: 300, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } },
    children: [
      { name: 'Background / setting', canvas: background },
      { name: 'Crystal / glass', canvas: crystal },
      { name: 'Customer photo - engraving', canvas: photo, blendMode: 'screen', mask: { top: 0, left: 0, bottom: height, right: width, defaultColor: 0, canvas: mask } },
      ...(spec.message.trim() ? [{ name: 'Customer message (raster text)', canvas: text }] : []),
      { name: 'Original colour cutout (reference)', canvas: (() => { const c = canvas(cutout.width, cutout.height); c.getContext('2d')!.drawImage(cutout, 0, 0); return c; })(), hidden: true },
      { name: 'Customer-approved preview (reference)', canvas: composite, hidden: true },
    ],
  });
  return new Blob([new Uint8Array(bytes)], { type: 'image/vnd.adobe.photoshop' });
}
