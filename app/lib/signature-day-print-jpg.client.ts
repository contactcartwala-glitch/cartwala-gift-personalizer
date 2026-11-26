import { zipSync } from "fflate";
import { A4_JPG, fitA4, jpeg300Dpi, signatureJpgPlan } from "./signature-day-jpg-plan";
// eslint-disable-next-line import/default
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export async function buildSignatureDayJpgZip(design: Parameters<typeof signatureJpgPlan>[0], onProgress?: (done: number,total: number) => void) {
  const plan = signatureJpgPlan(design);
  if (!plan.length) throw new Error("No saved print pages were found for this design.");
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = workerUrl;
  // Process one source PDF at a time. Keeping all PDFs and decoded page images
  // alive until the end exhausted browser memory on large real orders.
  const groups = new Map<string, typeof plan>();
  for (const entry of plan) {
    const fileUrl = entry.url.split("#")[0];
    const group = groups.get(fileUrl) || [];
    group.push(entry); groups.set(fileUrl,group);
  }
  const encoded = new Map<string,Uint8Array>();
  const canvas = document.createElement("canvas");
  canvas.width = A4_JPG.width; canvas.height = A4_JPG.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare print images");
  let done = 0;
  onProgress?.(done,plan.length);
  try {
    for (const [fileUrl, entries] of groups) {
      const response = await fetch(`/app/print-asset?url=${encodeURIComponent(fileUrl)}`);
      if (!response.ok) throw new Error("A saved print file could not be loaded. Please retry.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const isPdf = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
      const pdf = isPdf ? await getDocument({ data: bytes, isEvalSupported:false }).promise : null;
      try {
        for (const {url,filename} of entries) {
          try {
            context.fillStyle = "#fff";
            context.fillRect(0,0,canvas.width,canvas.height);
            if (pdf) {
              const fragment = url.split("#")[1] || "";
              const number = Number(/(?:^|&)page=(\d+)/.exec(fragment)?.[1] || 1);
              if (number < 1 || number > pdf.numPages) throw new Error("A saved A4 print page is missing.");
              const page = await pdf.getPage(number);
              try {
                const original = page.getViewport({scale:1});
                const box = fitA4(original.width,original.height);
                await page.render({canvas,canvasContext:context,viewport:page.getViewport({scale:box.scale}),
                  transform:[1,0,0,1,box.x,box.y],background:"rgb(255,255,255)"}).promise;
              } finally {page.cleanup();}
            } else {
              const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
              try {
                const box = fitA4(bitmap.width,bitmap.height);
                context.drawImage(bitmap,box.x,box.y,box.width,box.height);
              } finally {bitmap.close();}
            }
            const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(
              result => result ? resolve(result) : reject(new Error("Could not encode print JPEG")),"image/jpeg",.98));
            encoded.set(filename,jpeg300Dpi(new Uint8Array(await blob.arrayBuffer())));
            onProgress?.(++done,plan.length);
          } catch (error) {
            throw new Error(`${filename}: ${error instanceof Error ? error.message : "Print image could not be prepared"}`);
          }
        }
      } finally {await pdf?.destroy();}
    }
    const files: Record<string,Uint8Array> = {};
    // Preserve size, shirt and Front/Back order even when source PDFs interleave.
    for (const {filename} of plan) files[`Signature-Day-A4-300dpi/${filename}`] = encoded.get(filename)!;
    return zipSync(files,{level:0});
  } finally {canvas.width = canvas.height = 0;}
}
