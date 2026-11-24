import { orderedShirts } from "./signature-day-print-order";

export const A4_JPG = { width: 2480, height: 3508, dpi: 300 } as const;
export function signatureJpgPlan(design: Parameters<typeof orderedShirts>[0]) {
  const pages: { url: string; filename: string }[] = [];
  for (const { shirt, index, size } of orderedShirts(design)) {
    for (const [side, url] of [["Front", shirt.front], ["Back", shirt.back]] as const) {
      if (!url) continue;
      const sequence = String(pages.length + 1).padStart(3, "0");
      const label = size.replace(/[^a-zA-Z0-9_-]/g, "_") || "Unknown";
      pages.push({ url, filename: `${sequence}_${label}_Shirt-${String(index + 1).padStart(3, "0")}_${side}.jpg` });
    }
  }
  return pages;
}

export function fitA4(width: number, height: number) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    throw new Error("Invalid print artwork dimensions");
  const scale = Math.min(A4_JPG.width / width, A4_JPG.height / height);
  return { scale, width: width * scale, height: height * scale,
    x: (A4_JPG.width - width * scale) / 2, y: (A4_JPG.height - height * scale) / 2 };
}

// Canvas JPEGs normally declare 96 DPI. Encode physical density, not just a filename label.
export function jpeg300Dpi(input: Uint8Array) {
  if (input[0] !== 0xff || input[1] !== 0xd8) throw new Error("JPEG encoding failed");
  const bytes = new Uint8Array(input);
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) throw new Error("Invalid JPEG segment");
    if (marker === 0xe0 && length >= 16 &&
        [74, 70, 73, 70, 0].every((value, i) => bytes[offset + 4 + i] === value)) {
      bytes.set([1, 1, 44, 1, 44], offset + 11); // inches, X=300, Y=300
      return bytes;
    }
    offset += length + 2;
  }
  const jfif = new Uint8Array([255,224,0,16,74,70,73,70,0,1,2,1,1,44,1,44,0,0]);
  const result = new Uint8Array(bytes.length + jfif.length);
  result.set(bytes.subarray(0, 2)); result.set(jfif, 2); result.set(bytes.subarray(2), 20);
  return result;
}
