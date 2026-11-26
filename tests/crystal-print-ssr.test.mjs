import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crystalPrintSpec } from '../app/lib/crystal-print.ts';
const spec = { version:1,widthCm:12,heightCm:8.5,bounds:[170,275,896,720],path:'M0 0L1 1Z',fit:[705,600],crop:{x:500,y:600,zoom:1},text:[628,930,500,32],textTransform:{x:628,y:930,scale:1,rotation:0},message:'',font:'Arial' };
test('crystal layout is available during server rendering without browser globals',()=>{
  assert.deepEqual(crystalPrintSpec({'_Crystal Print JSON':JSON.stringify(spec)}),spec);
  assert.equal(crystalPrintSpec({}),null);
  assert.equal(crystalPrintSpec({'_Crystal Print JSON':JSON.stringify({...spec,crop:{zoom:0}})}),null);
});
test('production server bundle includes the actual crystal validator, not a client-module stub',()=>{
  const server=fs.readFileSync(new URL('../build/server/index.js',import.meta.url),'utf8');
  assert.match(server,/function crystalPrintSpec\(/);
  assert.doesNotMatch(server,/const crystalPrintSpec = (?:void 0|undefined)/);
});
