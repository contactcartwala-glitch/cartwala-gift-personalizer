import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { File } from "node:buffer";
import ts from "typescript";

const source = fs.readFileSync("app/lib/album-archive.server.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, TextDecoder, Uint8Array, DataView, Map };
vm.runInNewContext(compiled, sandbox);
const { validateAlbumPrintArchive } = sandbox.exports;
assert.equal(typeof validateAlbumPrintArchive, "function");

const enc = new TextEncoder();
const jpeg = new Uint8Array(1024);
jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
function archive(entries, name = "album.zip") {
  const locals = [], central = [];
  let offset = 0;
  for (const { filename, content } of entries) {
    const bytes = content, n = enc.encode(filename);
    const head = new Uint8Array(30 + n.length), v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);v.setUint16(4, 20, true);v.setUint16(6, 0x800, true);
    v.setUint32(18, bytes.length, true);v.setUint32(22, bytes.length, true);
    v.setUint16(26, n.length, true);head.set(n, 30);locals.push(head, bytes);
    const center = new Uint8Array(46 + n.length), c = new DataView(center.buffer);
    c.setUint32(0, 0x02014b50, true);c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);c.setUint16(8, 0x800, true);
    c.setUint32(20, bytes.length, true);c.setUint32(24, bytes.length, true);
    c.setUint16(28, n.length, true);c.setUint32(42, offset, true);
    center.set(n, 46);central.push(center);offset += head.length + bytes.length;
  }
  const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
  const footer = new Uint8Array(22), d = new DataView(footer.buffer);
  d.setUint32(0, 0x06054b50, true);
  d.setUint16(8, entries.length, true);d.setUint16(10, entries.length, true);
  d.setUint32(12, centralSize, true);d.setUint32(16, offset, true);
  return new File([...locals, ...central, footer], name, { type: "application/zip" });
}
const jpg = (filename) => ({ filename, content: jpeg });
const manifest = { filename: "album-manifest.json", content: enc.encode('{"brand":"Cartwala"}') };
const valid = archive([jpg("000-front-cover.jpg"), jpg("001-page.jpg"), manifest]);
assert.equal(await validateAlbumPrintArchive(valid), true, "valid storefront ZIP");
assert.equal(await validateAlbumPrintArchive(archive([jpg("001-page.jpg")])), true, "part without manifest");
assert.equal(await validateAlbumPrintArchive(archive([manifest])), false, "reject files without a print page");
assert.equal(await validateAlbumPrintArchive(archive([jpg("../evil.jpg")])), false, "reject path traversal");
assert.equal(await validateAlbumPrintArchive(archive([jpg("001-page.jpg"), jpg("001-page.jpg")])), false, "reject duplicate file names");
assert.equal(await validateAlbumPrintArchive(archive([jpg("code.exe")])), false, "reject arbitrary file types");
assert.equal(await validateAlbumPrintArchive(archive([jpg("001-page.jpg")], "wrong.txt")), false, "require ZIP extension");
assert.equal(await validateAlbumPrintArchive(new File([new Uint8Array(1024)], "broken.zip", { type: "application/zip" })), false, "reject non-ZIP bytes");
const truncated = new Uint8Array(await valid.arrayBuffer());
truncated[truncated.length - 22] = 0x00;
assert.equal(await validateAlbumPrintArchive(new File([truncated], "truncated.zip", { type: "application/zip" })), false, "reject corrupt ZIP footer");
const html = new File([new Uint8Array(1024)], "album.zip", { type: "text/html" });
assert.equal(await validateAlbumPrintArchive(html), false, "reject HTML disguised as ZIP");
console.log("Album ZIP validation: 10 security and compatibility cases passed.");
