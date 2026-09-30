type Shirt = { front: string; back?: string };
type PrintDesign = { printUrls: Shirt[]; shirtSizes: string[] };
const SIZES = ["S", "M", "L", "XL", "XXL", "XS"];

export function orderedShirts(design: PrintDesign) {
  return design.printUrls.map((shirt, index) => ({ shirt, index, size: design.shirtSizes[index] || "Unknown" }))
    .sort((a, b) => (SIZES.indexOf(a.size) < 0 ? 99 : SIZES.indexOf(a.size)) -
      (SIZES.indexOf(b.size) < 0 ? 99 : SIZES.indexOf(b.size)) || a.index - b.index);
}

