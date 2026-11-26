import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
const MAX_BYTES = 256 * 1024 * 1024;
const CHUNK_BYTES = 8 * 1024 * 1024;
const TTL = 15 * 60 * 1000;
type File = { path:string; name:string; mime:string; shop:string; size:number; expires:number };
type Upload = File & { expected:number; busy:boolean };
const files = new Map<string,File>();
const uploads = new Map<string,Upload>();
let directory: Promise<string> | undefined;
const formats: Record<string, { mime:string; magic:number[] }> = {
  pdf:{mime:"application/pdf",magic:[37,80,68,70]},zip:{mime:"application/zip",magic:[80,75,3,4]},
  jpg:{mime:"image/jpeg",magic:[255,216,255]},jpeg:{mime:"image/jpeg",magic:[255,216,255]},
  png:{mime:"image/png",magic:[137,80,78,71,13,10,26,10]},webp:{mime:"image/webp",magic:[82,73,70,70]},
  psd:{mime:"image/vnd.adobe.photoshop",magic:[56,66,80,83]},
};
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
async function cleanup() {
  for (const map of [files,uploads]) for (const [key,f] of map) if (f.expires <= Date.now()) {
    map.delete(key);await rm(f.path,{force:true});
  }
}
setInterval(()=>{void cleanup().catch(()=>{});},60_000).unref();
async function validFile(file:File) {
  const extension=file.name.split('.').pop()?.toLowerCase() || '', format=formats[extension];
  const handle=await open(file.path,'r'),header=Buffer.alloc(12);
  try {await handle.read(header,0,12,0);}finally{await handle.close();}
  return format && format.magic.every((b,i)=>header[i]===b) && (extension!=='webp'||header.toString('ascii',8,12)==='WEBP');
}
function completed(token:string,file:File) {
  return {href:`/app/print-download?file=${token}`,name:file.name,size:file.size,expiresInSeconds:TTL/1000};
}
async function finish(token:string,file:File) {
  if (!await validFile(file)) {await rm(file.path,{force:true});return new Response('Invalid print file format',{status:400});}
  file.expires=Date.now()+TTL;files.set(token,file);return json(completed(token,file));
}
async function streamBody(request:Request,path:string,append:boolean,max:number) {
  if(!request.body)throw new Error('Missing print bytes');
  let size=0;
  const limit=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;callback(size>max?new Error('File size limit exceeded'):null,chunk);}});
  await pipeline(Readable.fromWeb(request.body as never),limit,createWriteStream(path,{flags:append?'a':'wx',mode:0o600}));
  return size;
}
export async function preparePrintDownload(request:Request,shop:string) {
  await cleanup();
  const query=new URL(request.url).searchParams;
  const uploadId=query.get('upload');
  if(uploadId){
    const upload=/^[a-f0-9]{64}$/.test(uploadId)?uploads.get(uploadId):undefined;
    if(!upload||upload.shop!==shop)return new Response('Upload expired',{status:404});
    const offset=Number(query.get('offset'));
    if(upload.busy||!Number.isSafeInteger(offset)||offset!==upload.size)return json({offset:upload.size},409);
    upload.busy=true;
    try{
      const count=await streamBody(request,upload.path,true,Math.min(CHUNK_BYTES,upload.expected-upload.size));
      if(!count)throw new Error('Empty print chunk');
      upload.size+=count;upload.expires=Date.now()+TTL;
      if(upload.size===upload.expected){uploads.delete(uploadId);return finish(uploadId,upload);}
      return json({offset:upload.size});
    }catch{uploads.delete(uploadId);await rm(upload.path,{force:true});return new Response('Print upload interrupted. Please prepare the download again.',{status:400});}
    finally{upload.busy=false;}
  }
  const name=(query.get('name')||'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,180);
  const format=formats[name.split('.').pop()?.toLowerCase()||''];
  if(!format)return new Response('Unsupported print file',{status:400});
  const all=[...files.values(),...uploads.values()];
  if(all.filter(f=>f.shop===shop).length>=32 || all.reduce((n,f)=>n+f.size,0)+MAX_BYTES>768*1024*1024)
    return new Response('Temporary download storage is full. Please retry in 15 minutes.',{status:429});
  directory??=mkdtemp(join(tmpdir(),'cartwala-print-downloads-'));
  const token=randomBytes(32).toString('hex'),path=join(await directory,token);
  const file:File={path,name,mime:format.mime,shop,size:0,expires:Date.now()+TTL};
  if(query.get('start')==='1'){
    const expected=Number(query.get('size'));
    if(!Number.isSafeInteger(expected)||expected<1||expected>MAX_BYTES)return new Response('Print file exceeds 256 MB or is empty',{status:413});
    await writeFile(path,new Uint8Array(),{flag:'wx',mode:0o600});
    uploads.set(token,{...file,expected,busy:false});return json({upload:token,offset:0,chunkBytes:CHUNK_BYTES});
  }
  if(!request.body)return new Response('Missing print file',{status:400});
  if(Number(request.headers.get('content-length'))>MAX_BYTES)return new Response('Print file exceeds 256 MB',{status:413});
  try{file.size=await streamBody(request,path,false,MAX_BYTES);return await finish(token,file);}
  catch{await rm(path,{force:true});return new Response('Could not prepare the download',{status:400});}
}
export async function readPreparedPrintDownload(request:Request) {
  const token=new URL(request.url).searchParams.get('file')||'';
  const file=/^[a-f0-9]{64}$/.test(token)?files.get(token):undefined;
  if(!file||file.expires<=Date.now())return new Response('Download expired. Prepare the print file again.',{status:404,headers:{'Cache-Control':'no-store'}});
  return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream,{headers:{
    'Content-Type':file.mime,'Content-Length':String(file.size),'Content-Disposition':`attachment; filename="${file.name}"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  }});
}
