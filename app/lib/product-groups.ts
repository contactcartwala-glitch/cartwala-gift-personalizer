export type Direction = "Portrait" | "Landscape";
export type PreviewTemplate = { image: string; background: string; overlay: string; x: number; y: number; width: number; height: number; studs: boolean; mockup?: string; mockupAspect?: number; mockupName?: string };
export type GroupRow = { id: string; values: string[]; previousValues?: string[][]; price: number; compare: number | null; width: number; height: number; templates: Record<Direction, PreviewTemplate> };
export type ProductGroup = { id: string; name: string; description?: string; tags: string[]; collectionIds: string[]; productIds: string[]; excludedIds: string[]; keepPriceIds: string[]; options: string[]; optionAliases?: Record<string,string[]>; valueAliases?: Record<string,Record<string,string[]>>; rows: GroupRow[]; compareMode: "manual" | "percent" | "none"; percentage: number; previewMode: "manual" | "automatic" | "off" | "png"; customization: "plain" | "design" | "existing"; direction: "customer" | "portrait" | "landscape" | "product"; orientationOption: string; portraitTag: string; landscapeTag: string; background: string; createVariants: boolean };
export type GroupState = { version: 1; appliedImportId?: string; optionNamesVersion?: number; groups: ProductGroup[]; published: ProductGroup[]; history: Array<{ at: string; name: string; groups: ProductGroup[]; published: ProductGroup[] }> };
export const emptyTemplate = (): PreviewTemplate => ({ image: "", background: "", overlay: "", x: 50, y: 34, width: 30, height: 45, studs: false });
export const emptyGroup = (id: string): ProductGroup => ({ id, name: "New Product Group", tags: [], collectionIds: [], productIds: [], excludedIds: [], keepPriceIds: [], options: ["Size", "Material"], rows: [], compareMode: "manual", percentage: 0, previewMode: "png", customization: "plain", direction: "customer", orientationOption: "Orientation", portraitTag: "", landscapeTag: "", background: "", createVariants: true });
export const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s*(inches|inch|in|")\s*$/i, "").replace(/\s*[x×]\s*/g, "×");
export const rowKey = (values: string[]) => values.map(normalizeValue).join("|");
/** Editing a row never renames the same value in another size. */
export function renameRowValue(group:ProductGroup,id:string,index:number,name:string):GroupRow[] {
 return group.rows.map(r=>{
  if(r.id!==id||r.values[index]===name)return r;
  const previousValues=[...(r.previousValues||[])];
  if(r.values.every(v=>v.trim())&&!previousValues.some(values=>rowKey(values)===rowKey(r.values)))previousValues.push([...r.values]);
  return {...r,values:r.values.map((v,i)=>i===index?name:v),previousValues};
 });
}
export function comparePrice(group: ProductGroup, row: GroupRow): number | null {
  if (group.compareMode === "none") return null;
  return group.compareMode === "percent" ? Math.round(row.price * (1 + group.percentage / 100) * 100) / 100 : row.compare;
}
export function matches(group: ProductGroup, product: { id: string; tags: string[]; collectionIds: string[] }): boolean {
  return !group.excludedIds.includes(product.id) && (group.productIds.includes(product.id) || [...group.tags,group.portraitTag,group.landscapeTag].filter(Boolean).some(tag => product.tags.includes(tag.trim())) || group.collectionIds.some(id => product.collectionIds.includes(id)));
}
export function directionFor(group: ProductGroup, tags: string[]): Direction | null {
  const plain=group.tags.some(tag=>tag!==group.portraitTag&&tag!==group.landscapeTag&&tags.includes(tag));
  if(plain&&[group.portraitTag,group.landscapeTag].filter(Boolean).some(tag=>tags.includes(tag)))throw new Error("Use only one setup tag: plain photo, portrait or landscape.");
  const p = !!group.portraitTag && tags.includes(group.portraitTag), l = !!group.landscapeTag && tags.includes(group.landscapeTag);
  if (p && l) throw new Error("Both direction tags are present. Keep only one.");
  if (p) return "Portrait"; if (l) return "Landscape";
  if (group.direction === "portrait") return "Portrait";
  if (group.direction === "landscape") return "Landscape";
  return null;
}
export function validateGroup(value: unknown): ProductGroup {
  const g = value as ProductGroup;
  if (!g || !/^[a-zA-Z0-9_-]{1,80}$/.test(g.id) || !g.name?.trim()) throw new Error("Enter a group name.");
  g.description=String(g.description||"").trim().slice(0,1500);
  for (const key of ["tags", "collectionIds", "productIds", "excludedIds", "keepPriceIds", "options"] as const) {
    if (!Array.isArray(g[key]) || g[key].some(v => typeof v !== "string" || v.length > 255) || g[key].length > 1000) throw new Error(`Check ${key}.`);
    g[key] = [...new Set(g[key].map(v => v.trim()).filter(Boolean))];
  }
  if (!g.tags.length && !g.collectionIds.length && !g.productIds.length) throw new Error("Choose at least one tag, collection or product.");
  if (!g.options.length || g.options.length > 3 || new Set(g.options.map(v => v.toLowerCase())).size !== g.options.length) throw new Error("Use one to three different option names.");
  if (!["manual", "percent", "none"].includes(g.compareMode) || !["manual", "automatic", "off", "png"].includes(g.previewMode) || !["plain", "design", "existing"].includes(g.customization) || !["customer", "portrait", "landscape", "product"].includes(g.direction)) throw new Error("Check group settings.");
  if (!Number.isFinite(g.percentage) || g.percentage < 0 || g.percentage > 1000) throw new Error("Percentage must be between 0 and 1000.");
  if (g.direction === "customer" && (g.options.length > 2 || !g.orientationOption?.trim() || g.options.some(n=>n.toLowerCase()===g.orientationOption.toLowerCase()))) throw new Error("Customer orientation requires a separate option and at most two other options.");
  if(g.optionAliases){if(typeof g.optionAliases!=="object"||Array.isArray(g.optionAliases))throw new Error("Check option names.");g.optionAliases=Object.fromEntries(Object.entries(g.optionAliases).filter(([name])=>[...g.options,g.orientationOption].includes(name)).map(([name,aliases])=>{if(!Array.isArray(aliases)||aliases.length>100||aliases.some(v=>typeof v!=="string"||v.length>255))throw new Error("Check previous option names.");return [name,[...new Set(aliases.map(v=>v.trim()).filter(Boolean))]];}));}
  if(g.valueAliases){if(typeof g.valueAliases!=="object"||Array.isArray(g.valueAliases))throw new Error("Check option values.");const entries=Object.entries(g.valueAliases).filter(([name])=>g.options.includes(name));if(entries.length>3)throw new Error("Check option values.");for(const [,values] of entries){if(!values||typeof values!=="object"||Array.isArray(values)||Object.keys(values).length>500)throw new Error("Check option values.");for(const [target,aliases] of Object.entries(values)){if(target.length>255||!Array.isArray(aliases)||aliases.length>100||aliases.some(v=>typeof v!=="string"||v.length>255))throw new Error("Check previous option values.");}}g.valueAliases=Object.fromEntries(entries.map(([name,values])=>[name,Object.fromEntries(Object.entries(values).filter(([target])=>g.rows.some(r=>r.values[g.options.indexOf(name)]===target)).map(([target,aliases])=>[target,[...new Set(aliases.map(v=>v.trim()).filter(Boolean))]]))]));}
  const url = (v: string) => { if (v && (!/^https:\/\//.test(v) || v.length > 2048)) throw new Error("Images must use an HTTPS URL."); };
  url(g.background);
  if (!Array.isArray(g.rows) || !g.rows.length || g.rows.length > 100) throw new Error("Add between 1 and 100 price rows.");
  const keys = new Set<string>();
  for (const r of g.rows) {
    if (!r.id || !Array.isArray(r.values) || r.values.length !== g.options.length || r.values.some(v => typeof v !== "string" || !v.trim())) throw new Error("Every row needs a value for each option.");
    r.values = r.values.map(v => v.trim()); const key = rowKey(r.values);
    if(r.previousValues){
      if(!Array.isArray(r.previousValues)||r.previousValues.length>500||r.previousValues.some(values=>!Array.isArray(values)||values.length!==g.options.length||values.some(v=>typeof v!=="string"||!v.trim()||v.length>255)))throw new Error("Check previous row values.");
      const previous=new Map(r.previousValues.map(values=>{const clean=values.map(v=>v.trim());return [rowKey(clean),clean] as const;}));previous.delete(key);r.previousValues=[...previous.values()];
    }
    if (keys.has(key)) throw new Error("Two rows have the same option values."); keys.add(key);
    const money = (n: number) => Number.isFinite(n) && n > 0 && n <= 10000000 && Math.abs(n*100-Math.round(n*100)) < .00001;
    if (!money(r.price) || (r.compare !== null && !money(r.compare))) throw new Error("Prices must be positive with up to two decimals.");
    const compare = comparePrice(g,r); if (compare !== null && compare <= r.price) throw new Error("Crossed-out price must be higher than selling price, or leave it empty.");
    if (![r.width,r.height].every(n => Number.isFinite(n) && n > 0 && n <= 1000)) throw new Error("Enter valid physical width and height.");
    for (const direction of ["Portrait", "Landscape"] as const) {
      const t = r.templates?.[direction]; if (!t) throw new Error("Both preview directions need settings.");
      [t.image,t.background,t.overlay,t.mockup||""].forEach(url);
      if(t.mockup&&(!Number.isFinite(t.mockupAspect)||t.mockupAspect!<=0))throw new Error("Upload the mockup PNG again.");
      if (![t.x,t.y,t.width,t.height].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !t.width || !t.height || t.x-t.width/2 < 0 || t.x+t.width/2 > 100 || t.y-t.height/2 < 0 || t.y+t.height/2 > 100) throw new Error("Keep the photo box inside its background.");
    }
  }
  return g;
}
export function escapeCsv(value: unknown) { return '"' + String(value ?? "").replace(/"/g,'""') + '"'; }
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i=0;i<input.length;i++) { const c=input[i]; if(c==='"') { if(quoted && input[i+1]==='"'){cell+='"';i++;}else quoted=!quoted; } else if(c===','&&!quoted){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell="";}else cell+=c; }
  if(quoted)throw new Error("CSV has an unclosed quote.");row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
}

export function tagErrors(group:ProductGroup,groups:ProductGroup[]):Record<string,string> {
 const errors:Record<string,string>={}, normalize=(v:string)=>v.trim().toLowerCase();
 const fields={plain:group.tags[0]||"",portrait:group.portraitTag||"",landscape:group.landscapeTag||""};
 for(const [key,tag] of Object.entries(fields)){
  if(!tag.trim()){if(key==="plain")errors[key]="Enter a tag name.";continue;}
  if(Object.entries(fields).some(([other,value])=>other!==key&&normalize(value)===normalize(tag)))errors[key]="Use a different tag for each choice.";
  const used=groups.find(g=>g.id!==group.id&&[...g.tags,g.portraitTag,g.landscapeTag].filter(Boolean).some(t=>normalize(t)===normalize(tag)));
  if(used)errors[key]=`This tag is already used by ${used.name}. Choose another tag.`;
 }
 return errors;
}

export function setupTags(groups:ProductGroup[]):Array<{tag:string;name:string;direction:string}> {
 return groups.flatMap(g=>[{tag:g.tags[0]||"",name:g.name,direction:g.direction==="portrait"?"Portrait":g.direction==="landscape"?"Landscape":"Customer chooses"}, {tag:g.portraitTag,name:g.name,direction:"Portrait"}, {tag:g.landscapeTag,name:g.name,direction:"Landscape"}].filter(item=>item.tag.trim()));
}
export function replaceSetupTag(current:string[], groups:ProductGroup[], tag:string):string[] {
 const known=new Set(setupTags(groups).map(item=>item.tag));
 if(tag&&!known.has(tag))throw new Error("This setup tag is not saved. Save the setup first.");
 return [...current.filter(value=>!known.has(value)),...(tag?[tag]:[])];
}

/** Register once; sizes and mockups can be added later without choosing products. */
export function createTagSetup(id:string,name:string,description:string,groups:ProductGroup[]):ProductGroup {
 const tag=name.trim();
 if(!tag||tag.length>255||tag.includes(","))throw new Error("Enter a tag name up to 255 characters, without commas.");
 const g={...emptyGroup(id),name:tag,description:description.trim().slice(0,1500),tags:[tag],options:["Size"]};
 const errors=tagErrors(g,groups);
 if(Object.keys(errors).length)throw new Error(Object.values(errors)[0]);
 return g;
}

export function parseSizeInput(value:string):{width:number;height:number}|null {
 const input=value.trim().toLowerCase().replace(/["″]/g,"").replace(/inches|inch|\bin\b/g,"").replace(/\s+by\s+/g,"x");
 const dims=input.match(/^\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*$/);
 if(!dims)return null;
 const width=Math.min(Number(dims[1]),Number(dims[2])),height=Math.max(Number(dims[1]),Number(dims[2]));
 return width>0&&height<=1000?{width,height}:null;
}

export function duplicateSizeRow(group:ProductGroup,id:string,newId:string):ProductGroup {
 const original=group.rows.find(r=>r.id===id);
 if(!original)throw new Error("Size not found.");
 const next=structuredClone(group);
 if(next.options.length===1){
  next.options.push("Type");
  next.rows=next.rows.map(r=>({...r,values:[...r.values,"Standard"],previousValues:r.previousValues?.map(values=>[...values,"Standard"])}));
 }
 const source=next.rows.find(r=>r.id===id)!;
 let number=1,values=[...source.values];
 do{values=[...source.values];values[values.length-1]=source.values[values.length-1]+" copy"+(number>1?" "+number:"");number++;}while(next.rows.some(r=>rowKey(r.values)===rowKey(values)));
 next.rows.push({...structuredClone(source),id:newId,values,previousValues:undefined,templates:{Portrait:emptyTemplate(),Landscape:emptyTemplate()}});
 return next;
}
