import fs from 'node:fs';
import path from 'node:path';
import PNGModule from '@pdf-lib/upng';
const UPNG = PNGModule.default || PNGModule;
const destination = process.argv[2] || '/tmp/cartwala-frame-apertures';
fs.mkdirSync(destination, { recursive: true });
const results = [];
for (const filename of fs.readdirSync('app/data/frame-mockups').filter(name => name.endsWith('.b64')).sort()) {
  const bytes = Buffer.from(fs.readFileSync(`app/data/frame-mockups/${filename}`, 'utf8'), 'base64');
  const raw = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const rgba = new Uint8Array(UPNG.toRGBA8(raw)[0]);
  const transparent = [], white = [];
  for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
    const i = (y * raw.width + x) * 4;
    if (rgba[i + 3] !== 0) continue;
    transparent.push([x, y]);
    if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 210) white.push([x, y]);
  }
  // Legacy export enlarged a white placeholder's opening to a ratio and
  // cleared alpha over original beading. RGB is intact; restore it exactly.
  // A source with a genuinely black opening has no white placeholder and is
  // retained unchanged. This repair applies only to bundled legacy mockups.
  const points = white.length > transparent.length * 0.7 ? white : transparent;
  const bounds = points.reduce((b, [x, y]) => ({ left: Math.min(b.left, x), top: Math.min(b.top, y), right: Math.max(b.right, x), bottom: Math.max(b.bottom, y) }), { left: raw.width, top: raw.height, right: 0, bottom: 0 });
  let restored = 0;
  if (points === white) for (const [x, y] of transparent) {
    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) continue;
    rgba[(y * raw.width + x) * 4 + 3] = 255;
    restored++;
  }
  const output = path.join(destination, filename.replace('.b64', '.png'));
  fs.writeFileSync(output, restored ? Buffer.from(UPNG.encode([rgba.buffer], raw.width, raw.height, 0)) : bytes);
  results.push({ id: filename.replace('.b64', ''), file: output, x: bounds.left / raw.width * 100, y: bounds.top / raw.height * 100, width: (bounds.right - bounds.left + 1) / raw.width * 100, height: (bounds.bottom - bounds.top + 1) / raw.height * 100, restored });
}
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(results, null, 2));
console.log(results.map(r => ({ id: r.id, restored: r.restored, x: r.x, y: r.y, width: r.width, height: r.height })));
