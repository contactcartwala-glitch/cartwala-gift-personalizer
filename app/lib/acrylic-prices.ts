export const ACRYLIC_SIZES = ["8×12", "12×18", "16×24", "20×30", "24×36"] as const;
export const ACRYLIC_COMPARE_MARKUP = 1.4;
export const acrylicComparePrice = (price: number) => Math.round(price * ACRYLIC_COMPARE_MARKUP * 100) / 100;
