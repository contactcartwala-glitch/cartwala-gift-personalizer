import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
const MAX_BYTES = 256 * 1024 * 1024;
const TTL = 15 * 60 * 1000;
const files = new Map<string, { path: string; name: string; mime: string; shop: string; size: number; expires: number }>();
let directory: Promise<string> | undefined;
const formats: Record<string, { mime: string; magic: number[] }> = {
  pdf: { mime: "application/pdf", magic: [37,80,68,70] },
  zip: { mime: "application/zip", magic: [80,75,3,4] },
  jpg: { mime: "image/jpeg", magic: [255,216,255] },
  jpeg: { mime: "image/jpeg", magic: [255,216,255] },
  png: { mime: "image/png", magic: [137,80,78,71,13,10,26,10] },
  webp: { mime: "image/webp", magic: [82,73,70,70] },
  psd: { mime: "image/vnd.adobe.photoshop", magic: [56,66,80,83] },
};
async function cleanup() {
  await Promise.all([...files].filter(([, f]) => f.expires <= Date.now()).map(async ([key,f]) => {
    files.delete(key); await rm(f.path, { force: true });
  }));
}
const timer = setInterval(() => { void cleanup().catch(() => {}); }, 60_000);
timer.unref();
export async function preparePrintDownload(request: Request, shop: string) {
  await cleanup();
  const name = (new URL(request.url).searchParams.get("name") || "").replace(/[^a-zA-Z0-9._-]/g,"-").slice(0,180);
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const format = formats[extension];
  if (!format || !request.body) return new Response("Unsupported print file", { status:400 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return new Response("Print file exceeds 256 MB", { status:413 });
  if ([...files.values()].filter(f => f.shop === shop).length >= 32) return new Response("Download limit reached. Please retry in 15 minutes.", { status:429 });
  if ([...files.values()].reduce((sum, file) => sum + file.size, 0) + MAX_BYTES > 768 * 1024 * 1024)
    return new Response("Temporary download storage is full. Please retry in 15 minutes.", { status:429 });
  directory ??= mkdtemp(join(tmpdir(),"cartwala-print-downloads-"));
  const token = randomBytes(32).toString("hex"), path = join(await directory, token);
  let size = 0;
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    callback(size > MAX_BYTES ? new Error("Print file exceeds 256 MB") : null, chunk);
  }});
  try {
    await pipeline(Readable.fromWeb(request.body as never), limit, createWriteStream(path, { flags:"wx",mode:0o600 }));
    const file = await open(path,"r");
    const header = Buffer.alloc(12);
    try { await file.read(header,0,12,0); } finally { await file.close(); }
    if (!format.magic.every((b,i) => header[i] === b) || (extension === "webp" && header.toString("ascii",8,12) !== "WEBP")) {
      await rm(path,{force:true}); return new Response("Invalid print file format",{status:400});
    }
    files.set(token,{path,name,mime:format.mime,shop,size,expires:Date.now()+TTL});
    return Response.json({ href:`/app/print-download?file=${token}`,name,size,expiresInSeconds:TTL/1000 },{headers:{"Cache-Control":"no-store"}});
  } catch {
    await rm(path,{force:true});
    return new Response(size > MAX_BYTES ? "Print file exceeds 256 MB" : "Could not prepare the download",{status:size > MAX_BYTES ? 413 : 500});
  }
}
export async function readPreparedPrintDownload(request: Request) {
  const token = new URL(request.url).searchParams.get("file") || "";
  const file = /^[a-f0-9]{64}$/.test(token) ? files.get(token) : undefined;
  if (!file || file.expires <= Date.now()) return new Response("Download expired. Prepare the print file again.",{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream,{headers:{
    "Content-Type":file.mime,"Content-Length":String(file.size),
    "Content-Disposition":`attachment; filename="${file.name}"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  }});
}
