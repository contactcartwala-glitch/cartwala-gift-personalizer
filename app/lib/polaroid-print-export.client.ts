import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { printPngWithDpi } from "./png-print-density.client";
import {
  CUT_GAP,
  PRINT_DPI,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  polaroidPrintSize,
  polaroidSheetLayout,
  polaroidZipUrls,
} from "./polaroid-print-layout";

type Manifest = {
  size: string;
  totalPrints: number;
  photos: Array<{ file: string; copies: number }>;
};

export function jpegWithPrintDpi(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new Error("Invalid JPEG print image.");
  const output = bytes.slice();
  // Update an existing JFIF block without changing image pixels.
  for (let pos = 2; pos + 4 <= output.length;) {
    if (output[pos] !== 255) break;
    const marker = output[pos + 1];
    if (marker === 218 || marker === 217) break;
    const length = (output[pos + 2] << 8) | output[pos + 3];
    if (length < 2 || pos + 2 + length > output.length) break;
    if (
      marker === 224 &&
      length >= 16 &&
      strFromU8(output.slice(pos + 4, pos + 9)) === "JFIF\0"
    ) {
      output[pos + 11] = 1;
      output[pos + 12] = PRINT_DPI >> 8;
      output[pos + 13] = PRINT_DPI & 255;
      output[pos + 14] = PRINT_DPI >> 8;
      output[pos + 15] = PRINT_DPI & 255;
      return output;
    }
    pos += length + 2;
  }
  const jfif = new Uint8Array([
    255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 1, 44, 1, 44, 0, 0,
  ]);
  const result = new Uint8Array(bytes.length + jfif.length);
  result.set(bytes.slice(0, 2));
  result.set(jfif, 2);
  result.set(bytes.slice(2), 2 + jfif.length);
  return result;
}

const imageFromBytes = async (bytes: Uint8Array, type: string) => {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("A saved print photo could not be opened."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};
const sheetBytes = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Print sheet export failed.")),
      "image/jpeg",
      0.98,
    ),
  );
  return jpegWithPrintDpi(new Uint8Array(await blob.arrayBuffer()));
};

export async function buildPolaroidPrintExport(
  attributes: Record<string, string>,
  quantity = 1,
  progress: (message: string) => void = () => {},
) {
  const size = polaroidPrintSize(attributes["Print size"] || "");
  const layout = polaroidSheetLayout(size.width, size.height);
  const archives = polaroidZipUrls(attributes);
  if (!archives.length)
    throw new Error("No Polaroid print ZIP was saved for this order.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("Invalid order quantity.");
  const files: Record<string, Uint8Array> = {};
  const sources: Array<{
    name: string;
    bytes: Uint8Array;
    type: string;
    copies: number;
  }> = [];
  const unpacked: Record<string, Uint8Array> = {};
  let manifest: Manifest | null = null;
  for (const archive of archives) {
    progress(`Loading saved ZIP ${archive.index}/${archives.length}…`);
    const response = await fetch(`/app/print-asset?url=${encodeURIComponent(archive.url)}`);
    if (!response.ok) throw new Error("A saved Polaroid ZIP could not be downloaded. Please retry.");
    const part = unzipSync(new Uint8Array(await response.arrayBuffer()));
    for (const [name, bytes] of Object.entries(part)) {
      if (name === "print-manifest.json") {
        const next = JSON.parse(strFromU8(bytes)) as Manifest;
        if (manifest && JSON.stringify(manifest) !== JSON.stringify(next))
          throw new Error("Conflicting saved print manifests.");
        manifest = next;
      } else {
        if (unpacked[name]) throw new Error("Duplicated photo files in saved ZIP parts.");
        unpacked[name] = bytes;
      }
    }
  }
  if (!manifest || !Array.isArray(manifest.photos) || !manifest.photos.length)
    throw new Error("The saved ZIP has no complete print manifest.");
  const saved = polaroidPrintSize(manifest.size || "");
  if (saved.width !== size.width || saved.height !== size.height)
    throw new Error("Saved photos do not match the ordered print size.");
  const used = new Set<string>();
  for (const photo of manifest.photos) {
    if (!Number.isInteger(photo.copies) || photo.copies < 1 || photo.copies > 1000 || used.has(photo.file))
      throw new Error("The saved photo copy count or filename is invalid.");
    used.add(photo.file);
    const bytes = unpacked[photo.file];
    if (!bytes) throw new Error(`A saved print photo is missing: ${photo.file}`);
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if (!jpeg && !png) throw new Error("A saved print photo has an unsupported format.");
    const output = jpeg ? jpegWithPrintDpi(bytes)
      : new Uint8Array(await (await printPngWithDpi(new Blob([new Uint8Array(bytes)]))).arrayBuffer());
    sources.push({ name: `photo-${String(sources.length + 1).padStart(3, "0")}`,
      bytes: output, type: jpeg ? "image/jpeg" : "image/png", copies: photo.copies });
  }
  if (sources.reduce((n, source) => n + source.copies, 0) !== manifest.totalPrints)
    throw new Error("The saved ZIP photo count is incomplete.");
  const packCount = sources.reduce((total, photo) => total + photo.copies, 0);
  const expected = Number(attributes["Number of prints"]);
  if (!Number.isInteger(expected) || expected < 1 || packCount !== expected)
    throw new Error(
      "The saved photos do not match the ordered number of prints.",
    );
  const total = packCount * quantity;
  if (total > 2000)
    throw new Error(
      "This print batch is too large. Export fewer packs at a time.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Print sheet canvas is unavailable.");
  const clear = () => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
  };
  const sheets: Array<{ file: string; photos: string[] }> = [];
  let placed = 0,
    sheetPhotos: string[] = [];
  const finishSheet = async () => {
    const file = `sheets/Sheet-${String(sheets.length + 1).padStart(2, "0")}-13x19in-300dpi.jpg`;
    files[file] = await sheetBytes(canvas);
    sheets.push({ file, photos: sheetPhotos });
    sheetPhotos = [];
    clear();
  };
  clear();
  try {
    for (const source of sources) {
      const image = await imageFromBytes(source.bytes, source.type);
      if (
        image.naturalWidth !== size.width ||
        image.naturalHeight !== size.height
      )
        throw new Error(
          "A saved photo has the wrong pixel dimensions for the ordered size. Export stopped to avoid incorrect prints.",
        );
      for (let copy = 1; copy <= source.copies * quantity; copy++) {
        const extension = source.type === "image/jpeg" ? "jpg" : "png";
        const name = `photos/${source.name}-copy-${String(copy).padStart(3, "0")}.${extension}`;
        files[name] = source.bytes;
        const slot = placed % layout.capacity;
        const x = CUT_GAP + (slot % layout.columns) * (layout.width + CUT_GAP);
        const y =
          CUT_GAP +
          Math.floor(slot / layout.columns) * (layout.height + CUT_GAP);
        context.save();
        if (layout.rotated) {
          context.translate(x + size.height, y);
          context.rotate(Math.PI / 2);
          context.drawImage(image, 0, 0, size.width, size.height);
        } else context.drawImage(image, x, y, size.width, size.height);
        context.restore();
        sheetPhotos.push(name);
        placed++;
        progress(`Preparing ${placed}/${total} prints…`);
        if (placed % layout.capacity === 0 || placed === total)
          await finishSheet();
      }
    }
  } finally {
    canvas.width = canvas.height = 1;
  }
  files["print-manifest.json"] = strToU8(
    JSON.stringify(
      {
        version: 2,
        size: attributes["Print size"],
        dpi: PRINT_DPI,
        widthPx: size.width,
        heightPx: size.height,
        quantity,
        totalPrints: total,
        sheetWidthInches: 13,
        sheetHeightInches: 19,
        sheetWidthPx: SHEET_WIDTH,
        sheetHeightPx: SHEET_HEIGHT,
        cuttingGapMm: 3,
        sheetCapacity: layout.capacity,
        sheets,
      },
      null,
      2,
    ),
  );
  progress("Packing ZIP…");
  return zipSync(files, { level: 0 });
}
