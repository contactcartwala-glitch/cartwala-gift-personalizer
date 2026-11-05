export const PRINT_DPI = 300;
export const SHEET_WIDTH = 3900;
export const SHEET_HEIGHT = 5700;
// 3 mm outside margin and cutting gap; never scale a photo to fit a sheet.
export const CUT_GAP = Math.round((3 * PRINT_DPI) / 25.4);

export function polaroidPrintSize(label: string) {
  const match =
    /^\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(cm|inches|inch|in|")\s*$/i.exec(
      label,
    );
  if (!match)
    throw new Error("The ordered print size is missing or unsupported.");
  const factor = match[3].toLowerCase() === "cm" ? PRINT_DPI / 2.54 : PRINT_DPI;
  const width = Math.round(Number(match[1]) * factor);
  const height = Math.round(Number(match[2]) * factor);
  if (width < 1 || height < 1) throw new Error("Invalid ordered print size.");
  return { width, height };
}

export function polaroidSheetLayout(width: number, height: number) {
  const grid = (rotated: boolean) => {
    const w = rotated ? height : width,
      h = rotated ? width : height;
    const columns = Math.floor((SHEET_WIDTH - CUT_GAP) / (w + CUT_GAP));
    const rows = Math.floor((SHEET_HEIGHT - CUT_GAP) / (h + CUT_GAP));
    return {
      rotated,
      width: w,
      height: h,
      columns,
      rows,
      capacity: columns * rows,
    };
  };
  const normal = grid(false),
    rotated = grid(true);
  const best = rotated.capacity > normal.capacity ? rotated : normal;
  if (best.columns < 1 || best.rows < 1)
    throw new Error("This print size does not fit a 13 × 19 inch sheet.");
  return best;
}

export function polaroidZipUrls(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      const match = /^Print files (\d+)$/i.exec(key);
      if (!match) return [];
      if (!/^https:\/\/cdn\.shopify\.com\/.*\.zip(?:\?|$)/i.test(value))
        throw new Error(`The saved ${key} ZIP link is missing or invalid.`);
      return [{ index: Number(match[1]), url: value }];
    })
    .sort((a, b) => a.index - b.index);
}
