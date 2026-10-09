import { PDFDocument } from "pdf-lib";
import { zipSync } from "fflate";

type PageFile = { name: string; url: string };

export async function buildAlbumPrintExport(
  pages: PageFile[],
  format: "zip" | "pdf",
  title: string,
  progress: (done: number, total: number) => void = () => {},
): Promise<Uint8Array> {
  if (!pages.length) throw new Error("No album print pages were saved.");
  const files: Record<string, Uint8Array> = {};
  const pdf = await PDFDocument.create();
  for (const [index, page] of pages.entries()) {
    progress(index, pages.length);
    const response = await fetch(`/app/print-asset?url=${encodeURIComponent(page.url)}`);
    if (!response.ok) throw new Error(`Could not load ${page.name}. Please retry the download.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!jpeg && !png) throw new Error(`${page.name} is not a valid print image.`);
    if (format === "zip") {
      // Preserve uploaded JPEG/PNG bytes, resolution and colour profile.
      files[page.name] = bytes;
    } else {
      const image = jpeg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      // Album files are exported at 300 DPI. Do not resize landscape 12x9
      // artwork to ISO A4 just because the product label also says "A4".
      const width = image.width * 72 / 300, height = image.height * 72 / 300;
      const output = pdf.addPage([width, height]);
      output.drawImage(image, { x: 0, y: 0, width, height });
    }
    progress(index + 1, pages.length);
  }
  if (format === "zip") return zipSync(files, { level: 0 });
  pdf.setTitle(title);
  return pdf.save();
}
