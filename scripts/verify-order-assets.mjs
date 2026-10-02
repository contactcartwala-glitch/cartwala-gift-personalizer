import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const storefront = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.js", "utf8");
const helper = storefront.slice(storefront.indexOf("  const orderAssetUrl ="), storefront.indexOf("  const MAX_FIELDS ="));
let requests = [], fail = false, active = 0, peak = 0;
const context = vm.createContext({ URL, FormData, window: { Shopify: { routes: { root: "/te/" } } },
  fetch: async (url, options) => {
    requests.push({ url, body: options.body });
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { ok: !fail, json: async () => fail ? { error: "upload failed" } :
      { url: `https://cdn.shopify.com/s/files/1/test/${options.body.get("file").name}` } };
  },
});
vm.runInContext(`${helper}\nthis.prepare = prepareOrderAssets; this.upload = uploadOrderAsset;`, context);
const photos = [0, 1, 2].map((id) => ({ field: { id: String(id), label: "Photo" },
  file: new File([new Uint8Array(100)], `photo-${id}.jpg`, { type: "image/jpeg" }) }));
const preview = new File([new Uint8Array(100)], "preview.png", { type: "image/png" });
const attachment = new File([new Uint8Array(100)], "note.pdf", { type: "application/pdf" });
const files = new Map([["Photo", photos[2].file], ["_Personalised Preview", preview], ["Note", attachment]]);
const cache = new WeakMap(), data = new FormData();
await context.prepare(data, files, photos, cache);
assert.equal(requests.length, 4, "upload all originals even when labels repeat, plus the preview");
assert.ok(peak <= 3, "mobile uploads have bounded concurrency");
assert.ok(requests.every((r) => r.url === "/te/apps/cartwala-signature-day" && r.body.get("intent") === "personalizer_upload"));
for (const photo of photos) assert.equal(data.get(`properties[_Cartwala Source ${photo.field.id}]`),
  `https://cdn.shopify.com/s/files/1/test/${photo.file.name}`);
assert.equal(data.get("properties[_Personalised Preview]"), "https://cdn.shopify.com/s/files/1/test/preview.png");
assert.equal(data.get("properties[_Note]").name, "note.pdf", "non-image attachments keep their existing upload path");
await context.prepare(new FormData(), files, photos, cache);
assert.equal(requests.length, 4, "retrying cart submission reuses completed uploads");
fail = true;
const failedFile = new File([new Uint8Array(100)], "failed.jpg", { type: "image/jpeg" });
await assert.rejects(context.prepare(new FormData(), new Map([["Photo", failedFile]]), [], cache), /upload failed/);
assert.equal(cache.has(failedFile), false);

const route = fs.readFileSync("app/routes/app.print-files.tsx", "utf8");
const helpers = route.slice(route.indexOf("const attrMap ="), route.indexOf("const documentSize ="));
const build = route.slice(route.indexOf("async function buildPrint("), route.indexOf("const canvasBlob ="));
const printContext = vm.createContext({});
vm.runInContext(ts.transpileModule(`${helpers}\n${build}\nthis.build = buildPrint;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, printContext);
await assert.rejects(printContext.build({ attributes: [{ key: "_Cartwala Design JSON", value: JSON.stringify({
  v: 1, r: "17:7", o: "overlay.png", p: photos.map((p) => ({ i: p.field.id, l: `Photo ${p.field.id}` })), t: [],
}) }] }), /Original photos are missing/,
"missing sources reject print rendering before drawing an overlay-only file");
console.log("Order asset upload, retry, field identity and incomplete export checks passed");
