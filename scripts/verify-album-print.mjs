import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
import { zipSync, unzipSync } from "fflate";
import UPNG from "@pdf-lib/upng";

const route = fs.readFileSync("app/routes/app.print-files.tsx", "utf8");
const helpers = route.slice(route.indexOf("const originalAssetUrl ="), route.indexOf("const documentSize ="));
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(`${helpers}\nthis.helpers = { originalAssetUrl, attrMap, albumPrintPages, albumPrintProblem, sourceFor };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const h = context.helpers;
const url = "https://cdn.shopify.com/s/files/test/original.jpg";
assert.equal(h.originalAssetUrl(JSON.stringify([url.replace(".jpg", "_small.jpg"), url])), url);
assert.equal(h.originalAssetUrl("blob:unavailable"), "");
assert.equal(h.sourceFor({ "Photo 1": url }, { i: "1", l: "Photo 1" }), url);
const attrs = h.attrMap([
  { key: "_Album print 002-back-cover.jpg", value: url },
  { key: "_Album print 000-front-cover.jpg", value: JSON.stringify([url + "?width=100", url]) },
  { key: "_Album print 001-page.jpg", value: url },
  { key: "Album print pages", value: "3" },
  { key: "_Album print resolution", value: "3600x2700 pixels (300 DPI)" },
  { key: "_Cartwala Design JSON", value: '{"v":1,"p":[],"t":[]}' },
]);
const pages = h.albumPrintPages(attrs);
assert.deepEqual(Array.from(pages, p => p.index), [0, 1, 2]);
assert.equal(pages[0].url, url);
assert.equal(attrs["_Cartwala Design JSON"], '{"v":1,"p":[],"t":[]}');
assert.equal(h.albumPrintProblem(pages, attrs), "");
assert.ok(h.albumPrintProblem(pages.slice(1), attrs));
assert.ok(h.albumPrintProblem([{ ...pages[0], url: "" }], {}));
assert.ok(h.albumPrintProblem([pages[0], pages[2]], {}));

const png = new Uint8Array(UPNG.default.encode([new Uint8Array(3600 * 2700 * 4).buffer], 3600, 2700, 0));
let failAt = -1, requests = 0;
const exportSource = fs.readFileSync("app/lib/album-print-export.client.ts", "utf8")
  .replace(/^import .*;\n/gm, "").replace("export async function", "async function");
const exporter = { build: new Function("PDFDocument", "zipSync", "fetch",
  ts.transpileModule(exportSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
  "\nreturn buildAlbumPrintExport;")(PDFDocument, zipSync,
    async () => ({ ok: requests++ !== failAt, arrayBuffer: async () => png.buffer })) };
const archive = unzipSync(await exporter.build(pages, "zip", "Test album"));
assert.deepEqual(Object.keys(archive), Array.from(pages, p => p.name));
for (const bytes of Object.values(archive)) assert.deepEqual(bytes, png, "ZIP preserves source pixels/bytes");
const pdf = await PDFDocument.load(await exporter.build(pages, "pdf", "Test album"));
assert.equal(pdf.getPageCount(), 3);
for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 864, height: 648 }, "12x9 inches at 300 DPI");
requests = 0; failAt = 1;
await assert.rejects(exporter.build(pages, "zip", "Test"), /001-page.jpg/);
console.log("Album URL normalization, page completeness, ordered ZIP, PDF dimensions and failed-download checks passed");
