import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { redirectDocument } from 'react-router';

const module = { exports: {} };
let authentications = 0;
const product = { title: 'Acrylic master', variants: { nodes: [{ selectedOptions: [{ name: 'Size', value: '8×12 inches' }] }] } };
const source = readFileSync(new URL('../app/routes/app.acrylic-prices.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
vm.runInNewContext(compiled, {
  exports: module.exports, module, URL,
  require(name) {
    if (name === 'react-router') return { redirectDocument };
    if (name === '../shopify.server') return { authenticate: { admin: async () => { authentications++; return { admin: {} }; } } };
    if (name === '../lib/acrylic-prices.server') return { loadAcrylicMatrix: async () => ({ version: 2, sizes: [] }), loadAcrylicProduct: async () => product };
    if (name === '../lib/acrylic-mockups.server') return { loadAcrylicMockups: async () => ({ templates: {}, digest: null }) };
    return {};
  },
});
for (const path of ['/app/acrylic-prices', '/app/acrylic-prices/', '/app/acrylic-prices?shop=demo.myshopify.com&host=example&view=master']) {
  const result = await module.exports.loader({ request: new Request(`https://example.com${path}`) });
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('X-Remix-Reload-Document'), 'true', 'Stale route manifests must load a fresh document rather than loop through SPA redirects');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const location = result.headers.get('Location');
  assert.equal(location, '/app/master-products' + new URL(`https://example.com${path}`).search);
  const canonical = await module.exports.loader({ request: new Request(new URL(location, 'https://example.com')) });
  assert.equal(canonical.productTitle, product.title, 'Canonical master route must render without redirecting back');
}
assert.equal(authentications, 3);
console.log('Master navigation passed: stale-client document reload, preserved embedded query, uncached redirect and canonical route without a back loop.');
