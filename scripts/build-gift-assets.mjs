import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

await build({
  entryPoints: ['scripts/gift-photo-processing.mjs'], bundle: true, minify: true,
  format: 'iife', platform: 'browser', external: ['https://*'],
  alias: {
    'onnxruntime-web': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.min.mjs',
    'onnxruntime-web/webgpu': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.mjs',
  },
  outfile: 'extensions/cartwala-personalizer/assets/cartwala-gift-photo-processing.js',
  banner: {js:'/*! Photo segmentation: @imgly/background-removal 1.7.0, AGPL-3.0. Source and license: https://github.com/contactcartwala-glitch/cartwala-gift-personalizer/tree/work/gift-catalog-73-templates */'},
});
for (const name of ['cartwala-gift-calendar.js', 'cartwala-gift-photo-processing.js'])
  await copyFile('extensions/cartwala-personalizer/assets/' + name, 'shopify-theme/assets/' + name);
