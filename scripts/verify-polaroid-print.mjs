import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
const exports = {};
new Function(
  "exports",
  compile(fs.readFileSync("app/lib/polaroid-print-layout.ts", "utf8")),
)(exports);
const {
  polaroidPrintSize,
  polaroidSheetLayout,
  polaroidZipUrls,
  CUT_GAP,
  SHEET_WIDTH,
  SHEET_HEIGHT,
} = exports;
assert.deepEqual(polaroidPrintSize("7 × 10 cm"), { width: 827, height: 1181 });
assert.deepEqual(polaroidPrintSize("7 x 3 cm"), { width: 827, height: 354 });
assert.deepEqual(polaroidPrintSize("3 x 7 in"), { width: 900, height: 2100 });
assert.throws(() => polaroidPrintSize("7 x 10"), /unsupported/);
assert.throws(() => polaroidPrintSize("0 x 10 cm"), /Invalid/);
assert.throws(() => polaroidSheetLayout(6000, 6000), /does not fit/);
for (const label of [
  "7 × 10 cm",
  "7 x 3 cm",
  "3 x 7 in",
  "10 x 15 cm",
  "15 x 10 cm",
  "5 x 5 cm",
]) {
  const { width, height } = polaroidPrintSize(label),
    layout = polaroidSheetLayout(width, height);
  assert.ok(layout.capacity > 0);
  assert.equal(
    layout.width * layout.height,
    width * height,
    "Rotation keeps ordered dimensions",
  );
  for (let i = 0; i < layout.capacity; i++) {
    const x = CUT_GAP + (i % layout.columns) * (layout.width + CUT_GAP);
    const y =
      CUT_GAP + Math.floor(i / layout.columns) * (layout.height + CUT_GAP);
    assert.ok(x + layout.width + CUT_GAP <= SHEET_WIDTH);
    assert.ok(y + layout.height + CUT_GAP <= SHEET_HEIGHT);
  }
}
assert.equal(polaroidSheetLayout(827, 1181).capacity, 18);
assert.deepEqual(
  polaroidZipUrls({
    "Print files 2": "https://cdn.shopify.com/2.zip",
    "Print files 1": "https://cdn.shopify.com/1.zip",
  }).map((p) => p.index),
  [1, 2],
);
assert.throws(
  () => polaroidZipUrls({ "Print files 1": "https://example.com/1.zip" }),
  /invalid/,
);
console.log(
  "Polaroid ordered dimensions, full sheet bounds, rotation, cutting margins and ZIP ordering checks passed.",
);
