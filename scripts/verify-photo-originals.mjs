import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as fflate from "fflate";
function load(path, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  new Function("exports", "require", code)(exports, (name) => {
    if (!deps[name]) throw new Error(name);
    return deps[name];
  });
  return exports;
}
const { readOriginalArchive, mergeOriginalArchives } = load(
  "app/lib/photo-original-zip.server.ts",
  { "node:crypto": crypto, fflate },
);
const { originalArchiveIds, originalsDeleteAfter } = load(
  "app/lib/photo-originals.ts",
);
const photo = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const hash = crypto.createHash("sha256").update(photo).digest("hex");
const manifest = {
  version: 1,
  originals: [
    {
      file: "originals/photo-001.png",
      hash,
      originalName: "Customer Original.png",
    },
  ],
};
const archive = fflate.zipSync(
  {
    "originals/photo-001.png": photo,
    "original-manifest.json": fflate.strToU8(JSON.stringify(manifest)),
  },
  { level: 0 },
);
const originals = readOriginalArchive(archive);
assert.deepEqual(
  originals.files["originals/photo-001.png"],
  photo,
  "Original bytes never resized/recompressed",
);
const merged = readOriginalArchive(mergeOriginalArchives([archive, archive]));
assert.equal(
  merged.originals.length,
  1,
  "Same original once across all ZIP parts",
);
assert.deepEqual(merged.files[merged.originals[0].file], photo);
const tampered = fflate.zipSync({
  "originals/photo-001.png": photo,
  "original-manifest.json": fflate.strToU8(
    JSON.stringify({
      ...manifest,
      originals: [{ ...manifest.originals[0], hash: "0".repeat(64) }],
    }),
  ),
});
assert.throws(() => readOriginalArchive(tampered), /verification/);
const extra = fflate.zipSync({
  "originals/photo-001.png": photo,
  "unexpected.txt": fflate.strToU8("no"),
  "original-manifest.json": fflate.strToU8(JSON.stringify(manifest)),
});
assert.throws(() => readOriginalArchive(extra), /Unexpected/);
const id = "12345678-1234-1234-1234-123456789012";
assert.deepEqual(
  originalArchiveIds([
    { key: "_Cartwala Original archive 1", value: id },
    { key: "_Cartwala Original archive 2", value: id },
    { key: "_Cartwala Original archive 3", value: "invalid" },
  ]),
  [id],
);
const lastUsedAt = new Date("2026-10-14T00:00:00Z"),
  completedAt = new Date("2026-10-20T00:00:00Z");
assert.equal(
  originalsDeleteAfter({ lastUsedAt, orders: [{ completedAt: null }] }),
  null,
  "Incomplete order retained",
);
assert.equal(
  originalsDeleteAfter({
    lastUsedAt,
    orders: [{ completedAt }, { completedAt: null }],
  }),
  null,
  "Shared file retained while any order incomplete",
);
assert.equal(
  originalsDeleteAfter({ lastUsedAt, orders: [{ completedAt }] }).toISOString(),
  "2026-11-19T00:00:00.000Z",
);
assert.equal(
  originalsDeleteAfter({
    lastUsedAt: new Date("2026-11-01T00:00:00Z"),
    orders: [{ completedAt }],
  }).toISOString(),
  "2026-12-01T00:00:00.000Z",
  "Reused cart originals protected",
);
assert.equal(
  originalsDeleteAfter({ lastUsedAt, orders: [] }).toISOString(),
  "2026-11-13T00:00:00.000Z",
  "Abandoned original uploads expire after 30 days",
);
console.log(
  "Original byte preservation, hash integrity, ZIP deduplication and safe 30-day retention checks passed.",
);
