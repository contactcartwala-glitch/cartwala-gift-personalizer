import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const load = (path, imports = {}) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: name => imports[name], URL, structuredClone });
  return exports;
};
const acrylic = load('app/lib/acrylic-design.ts');
const cfg = load('app/lib/personalizer-config.ts', { './acrylic-design': acrylic });
const server = load('app/lib/photo-frame-design.server.ts', { './personalizer-config': cfg });
const sizes = ['8x12', '10x15', '12x18', '16x24', '20x30', '24x36'];
const master = { id: cfg.PHOTO_FRAME_MASTER_ID, tags: ['master-photo-frame'], config: null, variants: { nodes: ['Portrait', 'Landscape'].flatMap(orientation => sizes.map((size, i) => ({ id: `${orientation}-${i}`, price: String(300 + i * 100), compareAtPrice: String(600 + i * 200), selectedOptions: [{ name: 'Size', value: size }, { name: 'Orientation', value: orientation }] }))), pageInfo: { hasNextPage: false } } };
for (const orientation of ['Portrait', 'Landscape']) {
  const raw = { enabled: true, canvasRatio: orientation === 'Portrait' ? '1200:1800' : '1800:1200', photoFrameDesign: { masterProductId: master.id, orientation }, photoFields: [{ id: 'photo1', label: 'Photo', x: 50, y: 50, width: 100, height: 100, required: true }] };
  const product = { id: `gid://shopify/Product/${orientation}`, tags: ['existing-tag'], config: { jsonValue: raw }, variants: { nodes: [{ id: 'default', price: '0', compareAtPrice: null, selectedOptions: [{ name: 'Title', value: 'Default Title' }] }], pageInfo: { hasNextPage: false } } };
  const calls = [];
  const admin = { graphql: async (q, { variables: v }) => {
    let data;
    if (q === server.FRAME_PRODUCT_QUERY) data = { product: v.id === master.id ? master : product };
    else {
      calls.push(q);
      if (q === server.FRAME_BOOTSTRAP) {
        product.variants.nodes = v.input.variants.map((row, i) => ({ id: `variant-${i}`, price: row.price, compareAtPrice: row.compareAtPrice, selectedOptions: row.optionValues.map(o => ({ name: o.optionName, value: o.name })) })); data = { productSet: { userErrors: [] } };
      } else if (q === server.FRAME_TAGS) { product.tags = v.input.tags; data = { productUpdate: { userErrors: [] } }; }
      else if (q === server.FRAME_UPDATE_VARIANTS) { for (const row of v.variants) Object.assign(product.variants.nodes.find(x => x.id === row.id), row); data = { productVariantsBulkUpdate: { userErrors: [] } }; }
      else throw new Error(q);
    }
    return { json: async () => ({ data }) };
  } };
  const normalized = cfg.normalizeConfig(raw);
  assert.equal(normalized.photoFrameDesign.orientation, orientation);
  assert.equal(server.frameMasterRows(master, normalized).length, 6);
  assert.throws(() => server.frameMasterRows(master, { ...normalized, canvasRatio: orientation === 'Portrait' ? '3:2' : '2:3' }), /matching artwork/);
  await server.validatePhotoFrameDesign(admin, product.id, normalized);
  assert.equal(await server.syncPhotoFrameDesign(admin, product.id), true);
  assert.equal(product.variants.nodes.length, 6);
  assert(product.variants.nodes.every(v => v.selectedOptions.length === 1 && v.selectedOptions[0].name === 'Size'));
  assert(product.tags.includes('existing-tag'));
  assert(product.tags.includes(`cw-photo-frame-${orientation.toLowerCase()}`));
  const ids = product.variants.nodes.map(v => v.id).join(',');
  const writes = calls.length;
  await server.syncPhotoFrameDesign(admin, product.id);
  assert.equal(calls.length, writes, 'Repeated webhook does not write again');
  master.variants.nodes.find(v => v.selectedOptions[1].value === orientation).price = '399';
  await server.syncPhotoFrameDesign(admin, product.id);
  assert.equal(product.variants.nodes[0].price, '399');
  assert.equal(product.variants.nodes.map(v => v.id).join(','), ids, 'Inherited prices preserve variant IDs');
  product.variants.nodes[0].selectedOptions.push({ name: 'Color', value: 'Red' });
  await assert.rejects(() => server.validatePhotoFrameDesign(admin, product.id, normalized), /Existing variants/);
}
assert.equal(cfg.normalizeConfig({ photoFrameDesign: { masterProductId: 'wrong', orientation: 'Portrait' } }).photoFrameDesign, undefined);
console.log('Black frame links passed: both fixed orientations, all six sizes, matching artwork, inherited prices, stable IDs, safe variant checks and idempotent sync.');
