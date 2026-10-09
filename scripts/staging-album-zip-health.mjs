// An isolated Render health probe for the album ZIP upload hotfix.
// No Shopify credentials, customer files, sessions or database connections are used.
import http from "node:http";
import { File } from "node:buffer";
import { validateAlbumPrintArchive } from "../app/lib/album-archive.server.ts";

const enc = new TextEncoder();
function syntheticZip() {
  const jpg = new Uint8Array(1024);
  jpg.set([0xff, 0xd8, 0xff, 0xe0]);
  const filename = enc.encode("001-page.jpg");
  const local = new Uint8Array(30 + filename.length);
  const l = new DataView(local.buffer);
  l.setUint32(0, 0x04034b50, true);
  l.setUint16(4, 20, true);
  l.setUint16(6, 0x800, true);
  l.setUint32(18, jpg.length, true);
  l.setUint32(22, jpg.length, true);
  l.setUint16(26, filename.length, true);
  local.set(filename, 30);
  const central = new Uint8Array(46 + filename.length);
  const c = new DataView(central.buffer);
  c.setUint32(0, 0x02014b50, true);
  c.setUint16(4, 20, true);
  c.setUint16(6, 20, true);
  c.setUint16(8, 0x800, true);
  c.setUint32(20, jpg.length, true);
  c.setUint32(24, jpg.length, true);
  c.setUint16(28, filename.length, true);
  c.setUint32(42, 0, true);
  central.set(filename, 46);
  const footer = new Uint8Array(22);
  const f = new DataView(footer.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, 1, true);
  f.setUint16(10, 1, true);
  f.setUint32(12, central.length, true);
  f.setUint32(16, local.length + jpg.length, true);
  return new File([local, jpg, central, footer], "staging-album.zip", { type: "application/zip" });
}
const valid = await validateAlbumPrintArchive(syntheticZip());
const invalid = await validateAlbumPrintArchive(
  new File([new Uint8Array(1024)], "not-a-zip.zip", { type: "application/zip" }),
);
if (!valid || invalid) throw new Error("Album ZIP validation startup check failed.");

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" || req.url !== "/health") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    healthy: true,
    mode: "isolated-album-zip-validation",
    archiveValidation: "passed",
    shopifyConnected: false,
    databaseConnected: false,
    customerDataUsed: false,
    realCartIntegration: "not-tested",
  }));
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0");
