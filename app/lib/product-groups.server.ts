import db from "../db.server";
import preparedShopSetups from "../data/shop-setup-imports.json";
import type { GroupState, ProductGroup } from "./product-groups";
import { comparePrice, directionFor, emptyGroup, emptyTemplate, matches, normalizeValue, rowKey, validateGroup } from "./product-groups";
import type { authenticate } from "../shopify.server";
type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
export type CatalogProduct = { id: string; title: string; handle: string; tags: string[]; collectionIds: string[]; image: string; config: Record<string, unknown> | null; designRatio?: string; variants: Array<{ id: string; price: string; compareAtPrice: string | null; selectedOptions: Array<{ name: string; value: string }> }>; truncated: boolean; collectionsTruncated: boolean };
export const CATALOG_QUERY = `#graphql
query GroupCatalog($after: String) {
 products(first: 2, after: $after) {
  nodes { id title handle tags featuredImage { url }
   collections(first: 100) { nodes { id } pageInfo { hasNextPage } }
   variants(first: 250) { nodes { id price compareAtPrice selectedOptions { name value } } pageInfo { hasNextPage } }
   groupConfig: metafield(namespace: "$app", key: "group_config") { jsonValue }
   design: metafield(namespace: "cartwala_personalizer", key: "personalizer_config") { jsonValue }
   appDesign: metafield(namespace: "$app", key: "personalizer_config") { jsonValue }
  } pageInfo { hasNextPage endCursor }
 }
}`;
export const CATALOG_SUMMARY_QUERY = `#graphql
query GroupCatalogSummary($after: String) {
 products(first: 50, after: $after) {
  nodes { id title handle tags collections(first: 10) { nodes { id } pageInfo { hasNextPage } } }
  pageInfo { hasNextPage endCursor }
 }
}`;
/** Read-only setup pages need matching tags and collections, not every variant. */
export async function loadCatalogSummary(admin: Admin): Promise<CatalogProduct[]> {
 const products: CatalogProduct[]=[];let after:string|null=null;
 type SummaryPage={products:{nodes:Array<{id:string;title:string;handle:string;tags:string[];collections:{nodes:{id:string}[];pageInfo:{hasNextPage:boolean}}}>;pageInfo:{hasNextPage:boolean;endCursor:string|null}}};
 do {
  const d:SummaryPage=await query<SummaryPage>(admin,CATALOG_SUMMARY_QUERY,{after});
  for(const p of d.products.nodes){
   if(p.collections.pageInfo.hasNextPage){const full=await loadGroupProduct(admin,p.id);if(full)products.push(full);}
   else products.push({id:p.id,title:p.title,handle:p.handle,tags:p.tags,collectionIds:p.collections.nodes.map(c=>c.id),image:"",config:null,variants:[],truncated:false,collectionsTruncated:false});
  }
  after=d.products.pageInfo.hasNextPage?d.products.pageInfo.endCursor:null;
  if(d.products.pageInfo.hasNextPage&&!after)throw new Error("Product pagination failed.");
 }while(after);return products;
}
export const PRODUCT_QUERY = `#graphql
query GroupProduct($id: ID!) {
 product(id:$id) { id title handle tags featuredImage { url }
  collections(first:100) { nodes { id } pageInfo { hasNextPage } }
  variants(first:250) { nodes { id price compareAtPrice selectedOptions { name value } } pageInfo { hasNextPage } }
  groupConfig: metafield(namespace:"$app",key:"group_config") { jsonValue }
  design: metafield(namespace:"cartwala_personalizer",key:"personalizer_config") { jsonValue }
  appDesign: metafield(namespace:"$app",key:"personalizer_config") { jsonValue }
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
export const CREATE_VARIANTS = `#graphql
mutation GroupMissingVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
 productVariantsBulkCreate(productId:$productId,variants:$variants,strategy:DEFAULT) { userErrors { message } }
}`;
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
 do { const d: {products:{nodes:Array<{id:string;title:string;handle:string;tags:string[];featuredImage:{url:string}|null;collections:{nodes:{id:string}[];pageInfo:{hasNextPage:boolean}};variants:{nodes:CatalogProduct["variants"];pageInfo:{hasNextPage:boolean}};design?:{jsonValue:{canvasRatio?:string}}|null;appDesign?:{jsonValue:{canvasRatio?:string}}|null;groupConfig:{jsonValue:Record<string,unknown>}|null}>;pageInfo:{hasNextPage:boolean;endCursor:string|null}}}=await query(admin,CATALOG_QUERY,{after});
 products.push(...d.products.nodes.map(p=>({id:p.id,title:p.title,handle:p.handle,tags:p.tags,image:p.featuredImage?.url||"",collectionIds:p.collections.nodes.map(c=>c.id),collectionsTruncated:p.collections.pageInfo.hasNextPage,variants:p.variants.nodes,truncated:p.variants.pageInfo.hasNextPage,config:p.groupConfig?.jsonValue||null,designRatio:p.design?.jsonValue?.canvasRatio||p.appDesign?.jsonValue?.canvasRatio})));
 after=d.products.pageInfo.hasNextPage?d.products.pageInfo.endCursor:null;if(d.products.pageInfo.hasNextPage&&!after)throw new Error("Product pagination failed.");
 }while(after);return products;
}
export async function loadGroupProduct(admin: Admin, id: string): Promise<CatalogProduct | null> {
 const d=await query<{product:{id:string;title:string;handle:string;tags:string[];featuredImage:{url:string}|null;collections:{nodes:{id:string}[];pageInfo:{hasNextPage:boolean}};variants:{nodes:CatalogProduct["variants"];pageInfo:{hasNextPage:boolean}};design?:{jsonValue:{canvasRatio?:string}}|null;appDesign?:{jsonValue:{canvasRatio?:string}}|null;groupConfig:{jsonValue:Record<string,unknown>}|null}|null}>(admin,PRODUCT_QUERY,{id});
 const p=d.product;if(!p)return null;return {id:p.id,title:p.title,handle:p.handle,tags:p.tags,image:p.featuredImage?.url||"",collectionIds:p.collections.nodes.map(c=>c.id),collectionsTruncated:p.collections.pageInfo.hasNextPage,variants:p.variants.nodes,truncated:p.variants.pageInfo.hasNextPage,config:p.groupConfig?.jsonValue||null,designRatio:p.design?.jsonValue?.canvasRatio||p.appDesign?.jsonValue?.canvasRatio};
}
const DEFAULT_ROOM="https://cdn.shopify.com/extensions/01a0f10f-2c0c-7f1b-8519-f2854ed801ae/cartwala-gift-personalizer-239/assets/cartwala-acrylic-room.jpg";
export type GroupSettings={shopId:string;shopName:string;currency:string;digest:string|null;state:GroupState;collections:Array<{id:string;title:string}>;collectionsTruncated:boolean};
export async function loadGroupSettings(admin: Admin, catalog: CatalogProduct[] = []):Promise<GroupSettings> {
 const d=await query<{shop:{id:string;name:string;currencyCode:string;groups:{jsonValue:GroupState;compareDigest:string}|null};collections:{nodes:Array<{id:string;title:string;handle:string;legacy:{jsonValue:{version:number;multiplier?:number;sizes:Array<{size:string;price3?:number;price5?:number;cost3?:number;cost5?:number}>}}|null;room:{reference:{image:{url:string}}}|null}>;pageInfo:{hasNextPage:boolean}}}>(admin,SETTINGS_QUERY);
 const stored=await db.productGroupSettings.findUnique({where:{shopId:d.shop.id}});
 let digest=stored?String(stored.revision):null;
 let state:GroupState=(stored?.state as unknown as GroupState)||d.shop.groups?.jsonValue||{version:1,groups:[],published:[],history:[]};
 if(state.version!==1 || !Array.isArray(state.groups) || !Array.isArray(state.published))throw new Error("Unsupported product group settings.");
 if(!stored && !d.shop.groups){
  const legacy=d.collections.nodes.find(c=>c.legacy?.jsonValue?.sizes?.length);
  if(legacy){
   // Preserve original prices during a first-time legacy import only.
   if(catalog.length&&catalog.every(p=>!p.variants.length))catalog=await loadCatalog(admin);
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
 // Consume a versioned shared setup import once; preserve unrelated setups.
 const prepared=(preparedShopSetups as unknown as Record<string,GroupState&{importId:string}>|undefined)?.[d.shop.id];
 const incoming=(d.shop.groups?.jsonValue || prepared) as (GroupState&{importId?:string})|undefined;
 if(incoming?.importId&&incoming.importId!==state.appliedImportId){
  if(incoming.version!==1||!Array.isArray(incoming.groups)||!Array.isArray(incoming.published))throw new Error("Invalid shared setup import.");
  const imported=incoming.groups.map(g=>validateGroup(structuredClone(g))),published=incoming.published.map(g=>validateGroup(structuredClone(g)));
  if(published.some(g=>!imported.some(draft=>draft.id===g.id)))throw new Error("Imported published setup has no matching draft.");
  checkpoint(state,"Before shared setup import");
  state={...state,groups:[...state.groups.filter(g=>!imported.some(i=>i.id===g.id)),...imported],published:[...state.published.filter(g=>!imported.some(i=>i.id===g.id)),...published],appliedImportId:incoming.importId};
  await saveGroupSettings(admin,{shopId:d.shop.id,shopName:d.shop.name,currency:d.shop.currencyCode,digest,state,collections:[],collectionsTruncated:false});
  digest=String(Number(digest||0)+1);
 }
 // Approved label migration: keep every manually added row, price and PNG.
 if(d.shop.id==="gid://shopify/Shop/80379314361"&&state.optionNamesVersion!==1){
  for(const g of [...state.groups,...state.published]){g.options=g.options.map(name=>{if(name!=="Acrylic")return name;g.optionAliases={...g.optionAliases,Thickness:[...(g.optionAliases?.Thickness||[]),"Acrylic"]};return "Thickness";});
   g.tags=g.tags.filter(t=>t!==g.portraitTag&&t!==g.landscapeTag);
  }
  state.optionNamesVersion=1;
  await saveGroupSettings(admin,{shopId:d.shop.id,shopName:d.shop.name,currency:d.shop.currencyCode,digest,state,collections:[],collectionsTruncated:false});digest=String(Number(digest||0)+1);
 }
 return {shopId:d.shop.id,shopName:d.shop.name,currency:d.shop.currencyCode,digest,state,collections:d.collections.nodes.map(c=>({id:c.id,title:c.title})),collectionsTruncated:d.collections.pageInfo.hasNextPage};
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
function productDirection(g:ProductGroup,p:CatalogProduct) {
 const tagged=directionFor(g,p.tags);if(tagged)return tagged;
 if(p.designRatio){const [w,h]=p.designRatio.split(":").map(Number);if(w>0&&h>0)return w>h?"Landscape" as const:"Portrait" as const;}
 return null;
}
async function bootstrap(admin:Admin,g:ProductGroup,p:CatalogProduct) {
 if(!g.createVariants || p.variants.length!==1 || p.variants[0].selectedOptions.some(o=>o.name!=="Title"))return p;
 const fixed=productDirection(g,p),directions=g.direction==="customer"&&!fixed?["Portrait","Landscape"]:[null];
 const productOptions=g.options.map((name,index)=>({name,position:index+1,values:[...new Set(g.rows.map(r=>r.values[index]))].map(name=>({name}))}));
 if(directions.length===2)productOptions.push({name:g.orientationOption,position:productOptions.length+1,values:directions.map(name=>({name:name!}))});
 const variants=g.rows.flatMap(r=>directions.map(direction=>({optionValues:[...g.options.map((optionName,i)=>({optionName,name:r.values[i]})),...(direction?[{optionName:g.orientationOption,name:direction}]:[])],price:r.price,compareAtPrice:comparePrice(g,r),inventoryItem:{tracked:false,requiresShipping:true}})));
 const d=await query<{productSet:{userErrors:Array<{message:string}>}}>(admin,BOOTSTRAP,{identifier:{id:p.id},input:{productOptions,variants}});if(d.productSet.userErrors.length)throw new Error(d.productSet.userErrors[0].message);
 const fresh=await loadGroupProduct(admin,p.id);if(!fresh)throw new Error("Product vanished during variant setup.");return fresh;
}
async function addMissingVariants(admin:Admin,g:ProductGroup,p:CatalogProduct) {
 if(!g.createVariants)return p;
 const optionNames=new Set(p.variants.flatMap(v=>v.selectedOptions.map(o=>o.name.toLowerCase())));
 if(g.options.some(name=>!optionNames.has(name.toLowerCase()))||[...optionNames].some(name=>!g.options.some(n=>n.toLowerCase()===name)&&name!==g.orientationOption.toLowerCase()))return p;
 if(p.variants.some(v=>{const opts=new Map(v.selectedOptions.map(o=>[o.name.toLowerCase(),o.value]));return !g.rows.some(r=>rowKey(r.values)===rowKey(g.options.map(name=>opts.get(name.toLowerCase())||"")));}))return p;
 const fixed=productDirection(g,p),hasDirection=optionNames.has(g.orientationOption.toLowerCase());
 const directions=hasDirection?(fixed?[fixed]:["Portrait","Landscape"]):[null];
 const existing=new Set(p.variants.map(v=>{const values=new Map(v.selectedOptions.map(o=>[o.name.toLowerCase(),o.value]));return rowKey(g.options.map(name=>values.get(name.toLowerCase())||""))+"|"+(hasDirection?values.get(g.orientationOption.toLowerCase()):"");}));
 const missing=g.rows.flatMap(row=>directions.filter(direction=>!existing.has(rowKey(row.values)+"|"+(direction||""))).map(direction=>({optionValues:[...g.options.map((optionName,index)=>({optionName,name:row.values[index]})),...(direction?[{optionName:g.orientationOption,name:direction}]:[])],price:row.price,compareAtPrice:comparePrice(g,row),inventoryItem:{tracked:false,requiresShipping:true}})));
 if(!missing.length)return p;
 if(p.variants.length+missing.length>250)throw new Error("This product would exceed 250 managed variants. Use a separate setup.");
 const created=await query<{productVariantsBulkCreate:{userErrors:Array<{message:string}>}}>(admin,CREATE_VARIANTS,{productId:p.id,variants:missing});
 if(created.productVariantsBulkCreate.userErrors.length)throw new Error(created.productVariantsBulkCreate.userErrors[0].message);
 const fresh=await loadGroupProduct(admin,p.id);if(!fresh)throw new Error("Product vanished while adding sizes.");return fresh;
}

/** Design saves immediately reuse the product's published tag setup. */
export async function syncProductSetup(admin:Admin,productId:string) {
 const product=await loadGroupProduct(admin,productId);if(!product)return "Product no longer exists.";
 const settings=await loadGroupSettings(admin,[product]);
 const result=await syncGroupProduct(admin,settings.state.published,product);
 return result.status==="error"||result.status==="conflict"?result.message:undefined;
}

export const OPTION_NAMES_QUERY=`query SetupOptionNames($id: ID!) { product(id:$id) { options { id name position optionValues { id name } } } }`;
export const OPTION_NAME_UPDATE=`mutation SetupOptionName($productId: ID!, $option: OptionUpdateInput!) { productOptionUpdate(productId:$productId,option:$option) { userErrors { message } } }`;
export const OPTION_VALUE_UPDATE=`mutation SetupOptionValue($productId: ID!, $option: OptionUpdateInput!, $values: [OptionValueUpdateInput!]) { productOptionUpdate(productId:$productId,option:$option,optionValuesToUpdate:$values) { userErrors { message } } }`;
export const ROW_VALUE_UPDATE=`mutation ScopedRowValues($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId:$productId,variants:$variants,allowPartialUpdates:false) { userErrors { message } } }`;
export async function renameRowVariants(admin:Admin,g:ProductGroup,p:CatalogProduct):Promise<CatalogProduct>{
 if(!g.rows.some(r=>r.previousValues?.length))return p;
 // A previous name must not belong to a different current row: avoid swapping identities.
 for(const r of g.rows)if(r.previousValues?.some(values=>g.rows.some(other=>other.id!==r.id&&rowKey(other.values)===rowKey(values))))throw new Error("Row names overlap. Use a different name for each type in this size.");
 const updates:Array<{id:string;optionValues:Array<{optionName:string;name:string}>}>=[];
 const planned=p.variants.map(v=>{
  const values=g.options.map(name=>v.selectedOptions.find(o=>o.name.toLowerCase()===name.toLowerCase())?.value||"");
  if(g.rows.some(r=>rowKey(r.values)===rowKey(values)))return v;
  const candidates=g.rows.filter(r=>r.previousValues?.some(previous=>rowKey(previous)===rowKey(values)));
  if(candidates.length>1)throw new Error("Previous row names overlap. Check this size's type names.");
  if(!candidates.length)return v;
  const row=candidates[0],selectedOptions=v.selectedOptions.map(o=>{const index=g.options.findIndex(name=>name.toLowerCase()===o.name.toLowerCase());return index<0?o:{...o,value:row.values[index]};});
  updates.push({id:v.id,optionValues:selectedOptions.map(o=>({optionName:o.name,name:o.value}))});
  return {...v,selectedOptions};
 });
 const combinations=planned.map(v=>v.selectedOptions.map(o=>o.name.toLowerCase()+"="+normalizeValue(o.value)).sort().join("|"));
 if(new Set(combinations).size!==combinations.length)throw new Error("This name would duplicate another variant. Choose a different name.");
 if(!updates.length)return p;
 const result=await query<{productVariantsBulkUpdate:{userErrors:Array<{message:string}>}}>(admin,ROW_VALUE_UPDATE,{productId:p.id,variants:updates});
 if(result.productVariantsBulkUpdate.userErrors.length)throw new Error(result.productVariantsBulkUpdate.userErrors[0].message);
 return {...p,variants:planned};
}
export async function renameOptions(admin:Admin,g:ProductGroup,p:CatalogProduct):Promise<CatalogProduct>{
 const changes=Object.entries(g.optionAliases||{}).filter(([target,aliases])=>!p.variants.some(v=>v.selectedOptions.some(o=>o.name===target))&&p.variants.some(v=>v.selectedOptions.some(o=>aliases.includes(o.name))));
 const valueChanges=Object.entries(g.valueAliases||{}).filter(([name,values])=>Object.entries(values).some(([target,aliases])=>p.variants.some(v=>v.selectedOptions.some(o=>(o.name===name||(g.optionAliases?.[name]||[]).includes(o.name))&&aliases.includes(o.value)&&o.value!==target))));
 if(!changes.length&&!valueChanges.length)return p;
 const d=await query<{product:{options:Array<{id:string;name:string;position:number;optionValues:Array<{id:string;name:string}>}>}|null}>(admin,OPTION_NAMES_QUERY,{id:p.id});
 for(const [target,aliases] of changes){const option=d.product?.options.find(o=>aliases.includes(o.name));if(!option)continue;
  const updated=await query<{productOptionUpdate:{userErrors:Array<{message:string}>}}>(admin,OPTION_NAME_UPDATE,{productId:p.id,option:{id:option.id,name:target}});
  if(updated.productOptionUpdate.userErrors.length)throw new Error(updated.productOptionUpdate.userErrors[0].message);
  p={...p,variants:p.variants.map(v=>({...v,selectedOptions:v.selectedOptions.map(o=>o.name===option.name?{...o,name:target}:o)}))};option.name=target;
 }
 for(const [name,values] of valueChanges){const option=d.product?.options.find(o=>o.name===name);if(!option)continue;
  const updates=Object.entries(values).flatMap(([target,aliases])=>option.optionValues.filter(v=>aliases.includes(v.name)&&v.name!==target).map(v=>({id:v.id,name:target,old:v.name})));
  if(!updates.length)continue;
  if(new Set(updates.map(u=>u.id)).size!==updates.length||new Set(updates.map(u=>u.name)).size!==updates.length||updates.some(u=>option.optionValues.some(v=>v.name===u.name&&v.id!==u.id)))throw new Error("Option values overlap. Use a different name.");
  const updated=await query<{productOptionUpdate:{userErrors:Array<{message:string}>}}>(admin,OPTION_VALUE_UPDATE,{productId:p.id,option:{id:option.id},values:updates.map(({id,name})=>({id,name}))});
  if(updated.productOptionUpdate.userErrors.length)throw new Error(updated.productOptionUpdate.userErrors[0].message);
  p={...p,variants:p.variants.map(v=>({...v,selectedOptions:v.selectedOptions.map(o=>o.name===name&&updates.some(u=>u.old===o.value)?{...o,value:updates.find(u=>u.old===o.value)!.name}:o)}))};
 }
 return p;
}
export async function syncGroupProduct(admin:Admin,groups:ProductGroup[],original:CatalogProduct) {
 const gs=matchingGroups(groups,original);
 if(gs.length>1)return {status:"conflict",message:"Matches more than one group: "+gs.map(g=>g.name).join(", ")};
 if(!gs.length){if(original.config?.groupId)await setMeta(admin,[{ownerId:original.id,namespace:"$app",key:"group_config",type:"json",value:JSON.stringify({managed:true,disabled:true})}]);return {status:"unchanged",message:""};}
 const g=gs[0];if(original.truncated || (original.collectionsTruncated&&g.collectionIds.length))return {status:"error",message:"Product has more variants or collections than supported."};
 if(original.designRatio){
  const [dw,dh]=original.designRatio.split(":").map(Number),direction=productDirection(g,original);
  for(const row of g.rows){if(g.previewMode!=="png"||!row.templates[direction||"Portrait"].mockup)continue;const width=direction==="Landscape"?row.height:row.width,height=direction==="Landscape"?row.width:row.height;
   if(!(dw>0&&dh>0)||Math.abs((width/height)/(dw/dh)-1)>.02)return {status:"error",message:"The uploaded design ratio does not match "+row.values.join(" / ")+". Use a separate size group for a different ratio."};
  }
 }
 let p=await renameOptions(admin,g,original);p=await renameRowVariants(admin,g,p);p=await bootstrap(admin,g,p);p=await addMissingVariants(admin,g,p);const fixed=productDirection(g,p),updates:Record<string,unknown>[]=[];
 const previews: Record<string,unknown>={};const seen=new Set<string>();
 for(const v of p.variants){
  const options=new Map(v.selectedOptions.map(o=>[o.name.toLowerCase(),o.value]));const values=g.options.map(name=>options.get(name.toLowerCase())||"");const row=g.rows.find(r=>rowKey(r.values)===rowKey(values));
  const extra=v.selectedOptions.filter(o=>!g.options.some(n=>n.toLowerCase()===o.name.toLowerCase())&&o.name.toLowerCase()!==g.orientationOption.toLowerCase());
  if(!row||extra.length)return {status:"error",message:"Variant options do not match the price table. Existing variants were kept."};
  const compare=comparePrice(g,row);if(!g.keepPriceIds.includes(p.id)&&(Number(v.price)!==row.price||(v.compareAtPrice===null?null:Number(v.compareAtPrice))!==compare))updates.push({id:v.id,price:row.price,compareAtPrice:compare});
  const variantDirection=options.get(g.orientationOption.toLowerCase());
  if(fixed&&variantDirection&&variantDirection!==fixed)continue;
  const direction=fixed||(variantDirection==="Landscape"?"Landscape":"Portrait"),key=row.id+"|"+direction;
  if(seen.has(key))return {status:"error",message:"Duplicate variant matching. Check option names."};seen.add(key);
  const template=row.templates[direction],width=direction==="Landscape"?row.height:row.width,height=direction==="Landscape"?row.width:row.height;
  if(p.designRatio&&g.previewMode==="png"&&template.mockup){const [dw,dh]=p.designRatio.split(":").map(Number);if(!(dw>0&&dh>0)||Math.abs((width/height)/(dw/dh)-1)>.02)return {status:"error",message:"The uploaded design ratio does not match "+row.values.join(" / ")+". Use a separate size group for a different ratio."};}
  previews[v.id.split("/").pop()!]={...template,background:template.background||g.background,widthInches:width,heightInches:height,direction};
 }
 const hasOrientation=p.variants.some(v=>v.selectedOptions.some(o=>o.name.toLowerCase()===g.orientationOption.toLowerCase()));
 const expected=g.rows.length*(hasOrientation&&!fixed?2:1);if(seen.size!==expected)return {status:"error",message:"Missing variant combinations. Complete the variants or enable new-product setup."};
 const config={managed:true,groupId:g.id,groupName:g.name,previewMode:g.previewMode,customization:p.designRatio?"design":g.customization,fixedDirection:fixed,orientationOption:g.orientationOption,previews};
 if(Buffer.byteLength(JSON.stringify(config),"utf8")>120000)throw new Error("Preview settings exceed Shopify’s size limit. Use shorter image URLs or fewer rows.");
 if(updates.length){const d=await query<{productVariantsBulkUpdate:{userErrors:Array<{message:string}>}}>(admin,BULK_PRICES,{productId:p.id,variants:updates});if(d.productVariantsBulkUpdate.userErrors.length)throw new Error(d.productVariantsBulkUpdate.userErrors[0].message);}
 if(JSON.stringify(p.config)!==JSON.stringify(config))await setMeta(admin,[{ownerId:p.id,namespace:"$app",key:"group_config",type:"json",value:JSON.stringify(config)}]);
 return {status:updates.length||JSON.stringify(p.config)!==JSON.stringify(config)?"updated":"unchanged",message:""};
}
export async function syncGroups(admin:Admin,groups:ProductGroup[],catalog:CatalogProduct[],after="",limit=15) {
 const idNumber=(id:string)=>BigInt(id.split("/").pop()||"0");
 const pending=catalog.filter(p=>(matchingGroups(groups,p).length||p.config?.groupId)&&(!after||idNumber(p.id)>idNumber(after))).sort((a,b)=>idNumber(a.id)<idNumber(b.id)?-1:1);
 const batch=pending.slice(0,limit);
 const report={updated:0,unchanged:0,errors:[] as string[],conflicts:[] as string[],nextCursor:pending.length>batch.length?batch[batch.length-1].id:"",remaining:Math.max(0,pending.length-batch.length)};
 for(const p of batch){try{const r=await syncGroupProduct(admin,groups,p);if(r.status==="updated")report.updated++;else if(r.status==="unchanged")report.unchanged++;else if(r.status==="conflict")report.conflicts.push(p.title+": "+r.message);else report.errors.push(p.title+": "+r.message);}catch(e){report.errors.push(p.title+": "+(e instanceof Error?e.message:String(e)));}}
 return report;
}
