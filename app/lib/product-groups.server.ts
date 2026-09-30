import db from "../db.server";
import type { GroupState, ProductGroup } from "./product-groups";
import { comparePrice, directionFor, emptyGroup, emptyTemplate, matches, normalizeValue, rowKey, validateGroup } from "./product-groups";
import type { authenticate } from "../shopify.server";
type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
export type CatalogProduct = { id: string; title: string; handle: string; tags: string[]; collectionIds: string[]; image: string; config: Record<string, unknown> | null; variants: Array<{ id: string; price: string; compareAtPrice: string | null; selectedOptions: Array<{ name: string; value: string }> }>; truncated: boolean; collectionsTruncated: boolean };
export const CATALOG_QUERY = `#graphql
query GroupCatalog($after: String) {
 products(first: 100, after: $after) {
  nodes { id title handle tags featuredImage { url }
   collections(first: 100) { nodes { id } pageInfo { hasNextPage } }
   variants(first: 250) { nodes { id price compareAtPrice selectedOptions { name value } } pageInfo { hasNextPage } }
   groupConfig: metafield(namespace: "$app", key: "group_config") { jsonValue }
  } pageInfo { hasNextPage endCursor }
 }
}`;
export const PRODUCT_QUERY = `#graphql
query GroupProduct($id: ID!) {
 product(id:$id) { id title handle tags featuredImage { url }
  collections(first:100) { nodes { id } pageInfo { hasNextPage } }
  variants(first:250) { nodes { id price compareAtPrice selectedOptions { name value } } pageInfo { hasNextPage } }
  groupConfig: metafield(namespace:"$app",key:"group_config") { jsonValue }
 }
}`;
export const SETTINGS_QUERY = `#graphql
query GroupSettings {
 shop { id name currencyCode groups: metafield(namespace: "$app", key: "product_groups") { jsonValue compareDigest } }
 collections(first: 250) { nodes { id title handle
  legacy: metafield(namespace: "cartwala_acrylic", key: "price_matrix") { jsonValue }
  room: metafield(namespace: "$app", key: "acrylic_room") { reference { ... on MediaImage { image { url } } } }
 } pageInfo { hasNextPage } }
}`;
export const SET_META = `#graphql
mutation GroupMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields) { userErrors { message } } }`;
export const BULK_PRICES = `#graphql
mutation GroupVariantPrices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId:$productId,variants:$variants) { userErrors { message } } }`;
export const BOOTSTRAP = `#graphql
mutation GroupVariants($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
 productSet(identifier:$identifier,input:$input,synchronous:true) { userErrors { message } product { id } }
}`;
async function query<T>(admin: Admin, operation: string, variables: Record<string, unknown> = {}): Promise<T> {
 const r=await admin.graphql(operation,{variables});const j=await r.json() as {data?:T;errors?:Array<{message:string}>};
 if(j.errors?.length || !j.data)throw new Error(j.errors?.[0]?.message||"Shopify did not return data.");return j.data;
}
async function setMeta(admin: Admin, values: Record<string,unknown>[]) {
 const d=await query<{metafieldsSet:{userErrors:Array<{message:string}>}}>(admin,SET_META,{metafields:values});if(d.metafieldsSet.userErrors.length)throw new Error(d.metafieldsSet.userErrors[0].message);
}
export async function loadCatalog(admin: Admin): Promise<CatalogProduct[]> {
 const products: CatalogProduct[]=[];let after:string|null=null;
 do { const d: {products:{nodes:Array<{id:string;title:string;handle:string;tags:string[];featuredImage:{url:string}|null;collections:{nodes:{id:string}[];pageInfo:{hasNextPage:boolean}};variants:{nodes:CatalogProduct["variants"];pageInfo:{hasNextPage:boolean}};groupConfig:{jsonValue:Record<string,unknown>}|null}>;pageInfo:{hasNextPage:boolean;endCursor:string|null}}}=await query(admin,CATALOG_QUERY,{after});
 products.push(...d.products.nodes.map(p=>({id:p.id,title:p.title,handle:p.handle,tags:p.tags,image:p.featuredImage?.url||"",collectionIds:p.collections.nodes.map(c=>c.id),collectionsTruncated:p.collections.pageInfo.hasNextPage,variants:p.variants.nodes,truncated:p.variants.pageInfo.hasNextPage,config:p.groupConfig?.jsonValue||null})));
 after=d.products.pageInfo.hasNextPage?d.products.pageInfo.endCursor:null;if(d.products.pageInfo.hasNextPage&&!after)throw new Error("Product pagination failed.");
 }while(after);return products;
}
export async function loadGroupProduct(admin: Admin, id: string): Promise<CatalogProduct | null> {
 const d=await query<{product:{id:string;title:string;handle:string;tags:string[];featuredImage:{url:string}|null;collections:{nodes:{id:string}[];pageInfo:{hasNextPage:boolean}};variants:{nodes:CatalogProduct["variants"];pageInfo:{hasNextPage:boolean}};groupConfig:{jsonValue:Record<string,unknown>}|null}|null}>(admin,PRODUCT_QUERY,{id});
 const p=d.product;if(!p)return null;return {id:p.id,title:p.title,handle:p.handle,tags:p.tags,image:p.featuredImage?.url||"",collectionIds:p.collections.nodes.map(c=>c.id),collectionsTruncated:p.collections.pageInfo.hasNextPage,variants:p.variants.nodes,truncated:p.variants.pageInfo.hasNextPage,config:p.groupConfig?.jsonValue||null};
}
const DEFAULT_ROOM="https://cdn.shopify.com/extensions/01a0f10f-2c0c-7f1b-8519-f2854ed801ae/cartwala-gift-personalizer-239/assets/cartwala-acrylic-room.jpg";
export async function loadGroupSettings(admin: Admin, catalog: CatalogProduct[] = []) {
 const d=await query<{shop:{id:string;name:string;currencyCode:string;groups:{jsonValue:GroupState;compareDigest:string}|null};collections:{nodes:Array<{id:string;title:string;handle:string;legacy:{jsonValue:{version:number;multiplier?:number;sizes:Array<{size:string;price3?:number;price5?:number;cost3?:number;cost5?:number}>}}|null;room:{reference:{image:{url:string}}}|null}>;pageInfo:{hasNextPage:boolean}}}>(admin,SETTINGS_QUERY);
 const stored=await db.productGroupSettings.findUnique({where:{shopId:d.shop.id}});
 let state:GroupState=(stored?.state as unknown as GroupState)||d.shop.groups?.jsonValue||{version:1,groups:[],published:[],history:[]};
 if(state.version!==1 || !Array.isArray(state.groups) || !Array.isArray(state.published))throw new Error("Unsupported product group settings.");
 if(!stored && !d.shop.groups){
  const legacy=d.collections.nodes.find(c=>c.legacy?.jsonValue?.sizes?.length);
  if(legacy){
   const g=emptyGroup("acrylic-frames");Object.assign(g,{name:legacy.title,tags:["cw-acrylic-frame","cw-acrylic-portrait","cw-acrylic-landscape"],options:["Size","Acrylic"],previewMode:"automatic",customization:"plain",direction:"customer",portraitTag:"cw-acrylic-portrait",landscapeTag:"cw-acrylic-landscape",background:legacy.room?.reference?.image?.url||DEFAULT_ROOM,createVariants:true});
   g.rows=legacy.legacy!.jsonValue.sizes.flatMap((r,index)=>[3,5].map(mm=>{
    const size=r.size+" inches",material=mm===3?"3mm without studs":"5mm with studs";
    const old=catalog.flatMap(p=>p.variants).find(v=>v.selectedOptions.some(o=>o.name==="Size"&&normalizeValue(o.value)===normalizeValue(size))&&v.selectedOptions.some(o=>o.name==="Acrylic"&&o.value===material));
    const raw=mm===3?r.price3:r.price5,price=raw??Number(mm===3?r.cost3:r.cost5)*Number(legacy.legacy!.jsonValue.multiplier||1);const dims=r.size.split(/[×x]/).map(Number);
    const templates={Portrait:emptyTemplate(),Landscape:emptyTemplate()};for(const dir of ["Portrait","Landscape"] as const){const t=templates[dir];t.width=(dir==="Portrait"?dims[0]:dims[1])/60*78;t.height=(dir==="Portrait"?dims[1]:dims[0])/60*78;t.studs=mm===5;}
    return {id:`legacy-${index}-${mm}`,values:[size,material],price,compare:old?.compareAtPrice?Number(old.compareAtPrice):null,width:dims[0],height:dims[1],templates};
   }));
   validateGroup(g);state={version:1,groups:[g],published:[structuredClone(g)],history:[]};
  }
 }
 return {shopId:d.shop.id,shopName:d.shop.name,currency:d.shop.currencyCode,digest:stored?String(stored.revision):null,state,collections:d.collections.nodes.map(c=>({id:c.id,title:c.title})),collectionsTruncated:d.collections.pageInfo.hasNextPage};
}
export function checkpoint(state: GroupState,name:string) { state.history=[{at:new Date().toISOString(),name,groups:structuredClone(state.groups),published:structuredClone(state.published)},...state.history].slice(0,10); }
export async function saveGroupSettings(admin: Admin, settings: Awaited<ReturnType<typeof loadGroupSettings>>) {
 if(settings.state.groups.length>50)throw new Error("Maximum 50 groups per store.");
 const value=JSON.stringify(settings.state);if(value.length>1800000)throw new Error("Group settings are too large. Reduce history or images.");
 if(settings.digest===null) {
  try { await db.productGroupSettings.create({data:{shopId:settings.shopId,state:JSON.parse(value),revision:1}}); }
  catch(error) { if((error as {code?:string}).code==="P2002")throw new Error("Another session saved these settings. Refresh before saving again.");throw error; }
 } else {
  const saved=await db.productGroupSettings.updateMany({where:{shopId:settings.shopId,revision:Number(settings.digest)},data:{state:JSON.parse(value),revision:{increment:1}}});
  if(!saved.count)throw new Error("Another session saved these settings. Refresh before saving again.");
 }
}
export function matchingGroups(groups: ProductGroup[],p:CatalogProduct) { return groups.filter(g=>matches(g,p)); }
export function syncPreview(groups:ProductGroup[],catalog:CatalogProduct[]) {
 return catalog.filter(p=>matchingGroups(groups,p).length||p.config?.groupId).map(p=>({id:p.id,title:p.title,groups:matchingGroups(groups,p).map(g=>g.name),override:matchingGroups(groups,p).some(g=>g.keepPriceIds.includes(p.id))}));
}
async function bootstrap(admin:Admin,g:ProductGroup,p:CatalogProduct) {
 if(!g.createVariants || p.variants.length!==1 || p.variants[0].selectedOptions.some(o=>o.name!=="Title"))return p;
 const fixed=directionFor(g,p.tags),directions=g.direction==="customer"&&!fixed?["Portrait","Landscape"]:[null];
 const productOptions=g.options.map((name,index)=>({name,position:index+1,values:[...new Set(g.rows.map(r=>r.values[index]))].map(name=>({name}))}));
 if(directions.length===2)productOptions.push({name:g.orientationOption,position:productOptions.length+1,values:directions.map(name=>({name:name!}))});
 const variants=g.rows.flatMap(r=>directions.map(direction=>({optionValues:[...g.options.map((optionName,i)=>({optionName,name:r.values[i]})),...(direction?[{optionName:g.orientationOption,name:direction}]:[])],price:r.price,compareAtPrice:comparePrice(g,r),inventoryItem:{tracked:false,requiresShipping:true}})));
 const d=await query<{productSet:{userErrors:Array<{message:string}>}}>(admin,BOOTSTRAP,{identifier:{id:p.id},input:{productOptions,variants}});if(d.productSet.userErrors.length)throw new Error(d.productSet.userErrors[0].message);
 const fresh=await loadGroupProduct(admin,p.id);if(!fresh)throw new Error("Product vanished during variant setup.");return fresh;
}
export async function syncGroupProduct(admin:Admin,groups:ProductGroup[],original:CatalogProduct) {
 const gs=matchingGroups(groups,original);
 if(gs.length>1)return {status:"conflict",message:"Matches more than one group: "+gs.map(g=>g.name).join(", ")};
 if(!gs.length){if(original.config?.groupId)await setMeta(admin,[{ownerId:original.id,namespace:"$app",key:"group_config",type:"json",value:JSON.stringify({managed:true,disabled:true})}]);return {status:"unchanged",message:""};}
 const g=gs[0];if(original.truncated || (original.collectionsTruncated&&g.collectionIds.length))return {status:"error",message:"Product has more variants or collections than supported."};
 let p=await bootstrap(admin,g,original);const fixed=directionFor(g,p.tags),updates:Record<string,unknown>[]=[];
 const previews: Record<string,unknown>={};const seen=new Set<string>();
 for(const v of p.variants){
  const options=new Map(v.selectedOptions.map(o=>[o.name.toLowerCase(),o.value]));const values=g.options.map(name=>options.get(name.toLowerCase())||"");const row=g.rows.find(r=>rowKey(r.values)===rowKey(values));
  const extra=v.selectedOptions.filter(o=>!g.options.some(n=>n.toLowerCase()===o.name.toLowerCase())&&o.name.toLowerCase()!==g.orientationOption.toLowerCase());
  if(!row||extra.length)return {status:"error",message:"Variant options do not match the price table. Existing variants were kept."};
  const direction=fixed||(options.get(g.orientationOption.toLowerCase())==="Landscape"?"Landscape":"Portrait"),key=row.id+"|"+direction;
  if(seen.has(key))return {status:"error",message:"Duplicate variant matching. Check option names."};seen.add(key);
  const template=row.templates[direction];const width=direction==="Landscape"?row.height:row.width,height=direction==="Landscape"?row.width:row.height;
  previews[v.id.split("/").pop()!]={...template,background:template.background||g.background,widthInches:width,heightInches:height,direction};
  const compare=comparePrice(g,row);if(!g.keepPriceIds.includes(p.id)&&(Number(v.price)!==row.price||(v.compareAtPrice===null?null:Number(v.compareAtPrice))!==compare))updates.push({id:v.id,price:row.price,compareAtPrice:compare});
 }
 const expected=g.rows.length*(g.direction==="customer"&&!fixed?2:1);if(p.variants.length!==expected)return {status:"error",message:"Missing variant combinations. Complete the variants or enable new-product setup."};
 const config={managed:true,groupId:g.id,groupName:g.name,previewMode:g.previewMode,customization:g.customization,fixedDirection:fixed,orientationOption:g.orientationOption,previews};
 if(Buffer.byteLength(JSON.stringify(config),"utf8")>120000)throw new Error("Preview settings exceed Shopify’s size limit. Use shorter image URLs or fewer rows.");
 if(updates.length){const d=await query<{productVariantsBulkUpdate:{userErrors:Array<{message:string}>}}>(admin,BULK_PRICES,{productId:p.id,variants:updates});if(d.productVariantsBulkUpdate.userErrors.length)throw new Error(d.productVariantsBulkUpdate.userErrors[0].message);}
 if(JSON.stringify(p.config)!==JSON.stringify(config))await setMeta(admin,[{ownerId:p.id,namespace:"$app",key:"group_config",type:"json",value:JSON.stringify(config)}]);
 return {status:updates.length||JSON.stringify(p.config)!==JSON.stringify(config)?"updated":"unchanged",message:""};
}
export async function syncGroups(admin:Admin,groups:ProductGroup[],catalog:CatalogProduct[]) {
 const report={updated:0,unchanged:0,errors:[] as string[],conflicts:[] as string[]};
 for(const p of catalog){if(!matchingGroups(groups,p).length&&!p.config?.groupId)continue;try{const r=await syncGroupProduct(admin,groups,p);if(r.status==="updated")report.updated++;else if(r.status==="unchanged")report.unchanged++;else if(r.status==="conflict")report.conflicts.push(p.title+": "+r.message);else report.errors.push(p.title+": "+r.message);}catch(e){report.errors.push(p.title+": "+(e instanceof Error?e.message:String(e)));}}
 return report;
}
