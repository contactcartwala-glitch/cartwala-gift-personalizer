import { zipSync } from "fflate";
import { A4_JPG, fitA4, jpeg300Dpi, signatureJpgPlan } from "./signature-day-jpg-plan";
// Vite's ?url import exports the bundled worker URL, not the worker's module exports.
// eslint-disable-next-line import/default
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export async function buildSignatureDayJpgZip(design: Parameters<typeof signatureJpgPlan>[0]) {
  const plan = signatureJpgPlan(design);
  if (!plan.length) throw new Error("No saved print pages were found for this design.");
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = workerUrl;
  const assets = new Map<string, Uint8Array>();
  const documents = new Map<string, Awaited<ReturnType<typeof getDocument>["promise"]>>();
  const files: Record<string, Uint8Array> = {};
  const canvas = document.createElement("canvas");
  canvas.width = A4_JPG.width; canvas.height = A4_JPG.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare print images");
  try {
    for (const { url, filename } of plan) {
      const [fileUrl, fragment] = url.split("#");
      if (!assets.has(fileUrl)) {
        const response = await fetch(`/app/print-asset?url=${encodeURIComponent(fileUrl)}`);
        if (!response.ok) throw new Error("A saved print file could not be loaded. Please retry.");
        assets.set(fileUrl, new Uint8Array(await response.arrayBuffer()));
      }
      const bytes = assets.get(fileUrl)!;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70) {
        if (!documents.has(fileUrl)) documents.set(fileUrl,
          await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise);
        const pdf = documents.get(fileUrl)!;
        const number = Number(/(?:^|&)page=(\d+)/.exec(fragment || "")?.[1] || 1);
        if (number < 1 || number > pdf.numPages) throw new Error("A saved A4 print page is missing.");
        const page = await pdf.getPage(number);
        try {
          const original = page.getViewport({ scale: 1 });
          const box = fitA4(original.width, original.height);
          await page.render({ canvas, canvasContext: context,
            viewport: page.getViewport({ scale: box.scale }),
            transform: [1, 0, 0, 1, box.x, box.y], background: "rgb(255,255,255)" }).promise;
        } finally { page.cleanup(); }
      } else {
        const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
        try {
          const box = fitA4(bitmap.width, bitmap.height);
          context.drawImage(bitmap, box.x, box.y, box.width, box.height);
        } finally { bitmap.close(); }
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        result => result ? resolve(result) : reject(new Error("Could not encode print JPEG")), "image/jpeg", 0.98));
      files[`Signature-Day-A4-300dpi/${filename}`] = jpeg300Dpi(new Uint8Array(await blob.arrayBuffer()));
    }
    return zipSync(files, { level: 0 }); // JPEGs are already compressed; insertion order is page order.
  } finally {
    canvas.width = canvas.height = 0;
    await Promise.allSettled([...documents.values()].map(pdf => pdf.destroy()));
  }
}
