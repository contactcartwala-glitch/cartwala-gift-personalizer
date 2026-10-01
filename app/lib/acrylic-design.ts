export const ACRYLIC_MASTER_ID = "gid://shopify/Product/15402886135993";
export type AcrylicDesign = {
  masterProductId: typeof ACRYLIC_MASTER_ID;
  orientation: "Portrait" | "Landscape";
};
export function normalizeAcrylicDesign(
  value: unknown,
): AcrylicDesign | undefined {
  const v = value as Partial<AcrylicDesign> | undefined;
  return v?.masterProductId === ACRYLIC_MASTER_ID &&
    ["Portrait", "Landscape"].includes(v.orientation || "")
    ? { masterProductId: ACRYLIC_MASTER_ID, orientation: v.orientation! }
    : undefined;
}
export function compatibleAcrylicSizes<T extends { size: string }>(
  ratio: string,
  orientation: string,
  sizes: T[],
) {
  const [w, h] = ratio.split(":").map(Number);
  if (!(w > 0 && h > 0) || (orientation === "Portrait" ? w >= h : w <= h))
    throw new Error(
      `The PSD must be ${orientation.toLowerCase()}. Upload a matching PSD before saving.`,
    );
  return sizes.filter((row) => {
    const [a, b] = row.size.split("×").map(Number);
    const target = orientation === "Portrait" ? a / b : b / a;
    return Math.abs(w / h / target - 1) < 0.005;
  });
}
