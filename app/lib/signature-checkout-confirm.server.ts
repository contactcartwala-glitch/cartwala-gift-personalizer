// Read-only pre-cart confirmation. Called only after signed app-proxy authentication.
const SHOP = '0k9icg-ns.myshopify.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Artwork = { previews: {front:string;back?:string}[]; prints: {front:string;back?:string}[]; sources:string[]; sizes:string[]; backPrint:boolean };
type Row = { id:string; previewUrls:unknown; printUrls:unknown; sourceUrls:unknown; shirtSizes:unknown; backPrint:boolean };
export type SignatureCheckoutVariant = {id:string;product:{handle:string};selectedOptions:{value:string}[];price:string};
type Dependencies = {
  find: (shop:string,id:string)=>Promise<Row[]>;
  variants: (ids:string[])=>Promise<(SignatureCheckoutVariant|null)[]>;
  head: (url:string)=>Promise<Response>;
};
const reply=(status:number,code:string)=>Response.json({code},{status,headers:{'Cache-Control':'no-store'}});
const sides=(items:{front:string;back?:string}[])=>items.map(p=>[p.front,p.back||null]);
export async function confirmSignatureCheckout(shop:string,input:Record<string,unknown>,data:Artwork,deps:Dependencies) {
  if(shop!==SHOP)return reply(403,'WRONG_SHOP');
  if(typeof input.designId!=='string'||!UUID.test(input.designId))return reply(400,'INVALID_DESIGN');
  const ids=input.variantIds;
  if(!Array.isArray(ids)||ids.length!==data.sizes.length||!ids.every(id=>typeof id==='string'&&/^\d+$/.test(id)))return reply(400,'INVALID_VARIANTS');
  const gids=ids.map(id=>'gid://shopify/ProductVariant/'+id);
  try {
    const variants=await deps.variants([...new Set(gids)]);
    const tier=data.sizes.length>10?'11+ shirts':'1-10 shirts';
    const price=(data.sizes.length>10?130:150)+(data.backPrint?30:0);
    if(gids.some((id,i)=>{const v=variants.find(v=>v?.id===id);return !v||v.product.handle!=='signature-day-t-shirts'||
      v.selectedOptions[0]?.value.toUpperCase()!==data.sizes[i]||v.selectedOptions[1]?.value.toLowerCase()!==(data.backPrint?'front + back':'front only')||v.selectedOptions[2]?.value.replace(/\u2013/g,'-')!==tier||Number(v.price)!==price;}))return reply(400,'INVALID_VARIANTS');
    const [row]=await deps.find(shop,input.designId);
    if(!row)return reply(409,'DESIGN_NOT_CANONICAL');
    if(JSON.stringify([sides(row.previewUrls as Artwork['previews']),sides(row.printUrls as Artwork['prints']),row.sourceUrls,row.shirtSizes,row.backPrint])!==
      JSON.stringify([sides(data.previews),sides(data.prints),data.sources,data.sizes,data.backPrint]))return reply(409,'ARTWORK_CHANGED');
    const nonPrint=new Set([...data.sources,...data.previews.flatMap(p=>[p.front,p.back].filter(Boolean))]);
    const refs=data.prints.flatMap(p=>[p.front,...(data.backPrint&&p.back?[p.back]:[])]);
    if(refs.some(ref=>nonPrint.has(ref)))return reply(409,'ARTIFACT_UNAVAILABLE');
    const urls=[...new Set(refs.map(ref=>{
      const u=new URL(ref);
      if(u.protocol!=='https:'||u.username||u.password||u.hostname!=='cdn.shopify.com'||!u.pathname.startsWith('/s/files/')||
        (u.hash&&!/^#page=[1-9]\d*$/.test(u.hash)))throw Error('Invalid print ref');
      u.hash='';return u.href;
    }))];
    // HEAD only, bounded concurrency; no image bytes or customer payloads returned.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{
      while(cursor<urls.length){const url=urls[cursor++],response=await deps.head(url);
        if(!response.ok||!/^image\/(jpeg|png|webp)(;|$)|^application\/pdf(;|$)/i.test(response.headers.get('content-type')||'')||
          Number(response.headers.get('content-length')||0)>60*1024*1024)throw Error('Unavailable');}
    }));
    return Response.json({confirmed:true,designId:row.id,protocol:'cartwala-canonical-v1'},{headers:{'Cache-Control':'no-store'}});
  } catch {return reply(503,'CONFIRMATION_UNAVAILABLE');}
}
