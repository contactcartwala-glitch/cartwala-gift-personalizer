/* global globalThis */
import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { build } from 'esbuild';
import { createWhiteMug } from './mug-studio-model.mjs';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();}); }
};
const output='extensions/cartwala-personalizer/assets/';
const glb=await new GLTFExporter().parseAsync(createWhiteMug(),{binary:true, copyright:'Cartwala Gift Shop. Original mug geometry, 2026.'});
await fs.writeFile(output+'cartwala-white-mug.glb',Buffer.from(glb));
await build({entryPoints:['scripts/mug-studio-viewer.js'],outfile:output+'cartwala-mug-studio.js',bundle:true,minify:true,format:'iife',globalName:'CartwalaMugStudio',target:'es2020',legalComments:'eof'});
await fs.copyFile('node_modules/three/LICENSE',output+'cartwala-three-license.txt');
console.log(`White mug GLB: ${glb.byteLength} bytes; studio viewer bundled.`);
