// Check the normal, cookie-free Cartwala storefront, never a merchant preview URL.
const cartUrl = "https://cartwala.in/cart";
const maxHeadBytes = 384_000;
let cached: {id:string;expires:number}|undefined;
let inFlight: Promise<string|null>|undefined;

export function parsePublishedTheme(head:string):string|null {
  const entries = Array.from(head.matchAll(/\bShopify\.theme\s*=\s*(\{[^\r\n]*?\})\s*;/g));
  if(entries.length!==1)return null;
  try {
    const theme=JSON.parse(entries[0][1]);
    return theme.role==="main" && Number.isSafeInteger(theme.id) && theme.id>0 ? String(theme.id) : null;
  } catch {return null;}
}
async function inspectPublishedTheme():Promise<string|null> {
  try {
    const response = await fetch(cartUrl,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(4500),headers:{Accept:"text/html"}});
    if(!response.ok||!response.headers.get("Content-Type")?.includes("text/html")||!response.body)return null;
    const reader=response.body.getReader(), decoder=new TextDecoder();
    let bytes=0, html="";
    try {
      while(bytes<maxHeadBytes){
        const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.length;if(bytes>maxHeadBytes)return null;
        html+=decoder.decode(chunk.value,{stream:true});
        const end=html.indexOf("</head>");if(end!==-1)return parsePublishedTheme(html.slice(0,end));
      }
    } finally {await reader.cancel().catch(()=>undefined);}
  } catch {/* A missing, redirected or unresponsive storefront fails closed. */}
  return null;
}
export async function readCodPublishedTheme(force=false):Promise<string|null> {
  if(!force && cached && cached.expires>Date.now())return cached.id;
  if(inFlight)return inFlight;
  inFlight=inspectPublishedTheme();
  try {
    const id=await inFlight;
    cached=id?{id,expires:Date.now()+15_000}:undefined;
    return id;
  } finally {inFlight=undefined;}
}
