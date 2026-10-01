import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = process.argv[2] || fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(root + '/package.json');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createMemoryRouter, RouterProvider } = require('react-router');
process.env.SHOPIFY_API_KEY = '00000000000000000000000000000000';
process.env.SHOPIFY_API_SECRET = 'test-only';
process.env.SHOPIFY_APP_URL = 'https://example.com';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/master_render_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
const build = await import(pathToFileURL(root + '/build/server/index.js'));
const Component = build.routes['routes/app.master-products'].module.default;
const product = { id: 'gid://shopify/Product/123', title: 'Portrait three photos', handle: 'portrait-three-photos', tags: ['cw-acrylic-frame'], variants: {nodes: []}, personalizer: {jsonValue: {enabled: true, canvasRatio: '2:3', acrylicDesign: { masterProductId: 'gid://shopify/Product/15402886135993', orientation: 'Portrait' }, photoFields: []}} };
const master = {matrix: {version:2,sizes:[{size:'8×12',price3:750,price5:1125}]}, productTitle:'Acrylic master',variantCount:4,mockups:{templates:{},digest:null},previewSizes:['8×12']};
for (const view of ['master', 'designs']) {
 const router = createMemoryRouter([{id:'routes/app', path:'/app', children:[{id:'routes/app.master-products',path:'master-products',element:React.createElement(Component)}]}],{initialEntries:[`/app/master-products?view=${view}`],hydrationData:{loaderData:{'routes/app':{products:[product]},'routes/app.master-products':master}}});
 const html = renderToStaticMarkup(React.createElement(RouterProvider,{router}));
 assert.match(html, /heading="Master Products"/, `${view} must render Master Products rather than the standalone route`);
 assert.match(html, /Designs, PSD upload &amp; preview/);
 if(view === 'designs') {
  assert.match(html,/heading="Acrylic designs"/);
  assert.match(html,/heading="PSD auto template import"/);
  assert.match(html,/Portrait only/);
  assert.doesNotMatch(html,/heading="Mug product setup"/);
 } else assert.match(html,/heading="Master mockups &amp; test preview"/);
 console.log(`Production render passed: ${view}`);
 router.dispose();
}

// Importing the server initializes its session-storage poller. The render tests
// use hydration fixtures only; stop before any background database retries.
process.exit(0);
