import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { checkpoint, loadCatalog, loadCatalogSummary, loadGroupSettings, saveGroupSettings, syncGroups } from "../lib/product-groups.server";
import { comparePrice, emptyGroup, emptyTemplate, matches, parseCsv, validateGroup, tagErrors, duplicateSizeRow, parseSizeInput, createTagSetup, renameRowValue, type Direction, type GroupRow, type ProductGroup } from "../lib/product-groups";
import { inspectMockupPng } from "../lib/png-mockup.server";
import { uploadImageAsset } from "../lib/shopify-files.server";

export const shouldRevalidate:ShouldRevalidateFunction=({formData,defaultShouldRevalidate})=>formData?.get("intent")==="upload"?false:defaultShouldRevalidate;

export const loader=async({request}:LoaderFunctionArgs)=>{
 const {admin}=await authenticate.admin(request);const catalog=await loadCatalogSummary(admin),settings=await loadGroupSettings(admin,catalog);
 const fresh=()=>({...emptyGroup(crypto.randomUUID()),options:["Size"]});const id=new URL(request.url).searchParams.get("group");const selected=id==="new"?fresh():settings.state.groups.find(g=>g.id===id)||settings.state.groups[0]||fresh();
 return {settings,catalog,selected,index:!id,selectedTab:new URL(request.url).searchParams.get("tab")==="mockups"?"mockups":"sizes"};
};
export const action=async({request}:ActionFunctionArgs)=>{
 const {admin}=await authenticate.admin(request);
 try{
  const form=await request.formData(),intent=String(form.get("intent")),catalog=await (["create-tag","upload"].includes(intent)?loadCatalogSummary(admin):loadCatalog(admin)),settings=await loadGroupSettings(admin,catalog);
  if(intent==="create-tag"){
   const group=createTagSetup(crypto.randomUUID(),String(form.get("tagName")||""),String(form.get("description")||""),settings.state.groups);
   settings.state.groups=[...settings.state.groups,group];
   await saveGroupSettings(admin,settings);
   return {ok:true,message:"Tag created. Add sizes, prices and optional PNG images when needed.",group,report:null};
  }
  if(intent==="continue-sync"){
   if(String(form.get("revision"))!==String(settings.digest))throw new Error("Setup changed during the update. Click Save & update to run the latest settings.");
   const cursor=String(form.get("cursor")||"");if(!/^gid:\/\/shopify\/Product\/\d+$/.test(cursor))throw new Error("Invalid update cursor.");
   const report={...await syncGroups(admin,settings.state.published,catalog,cursor),revision:String(settings.digest)};
   return {ok:!report.errors.length&&!report.conflicts.length,message:report.nextCursor?"Updating products…":"Product update finished.",group:null,report};
  }
  if(intent==="restore"){
   const entry=settings.state.history.find(h=>h.at===form.get("history"));if(!entry)throw new Error("History entry not found.");checkpoint(settings.state,"Before restore");settings.state.groups=structuredClone(entry.groups);
   await saveGroupSettings(admin,settings);return {ok:true,message:"Previous settings restored as drafts. Review and Apply to update products.",group:null,report:null};
  }
  let group=JSON.parse(String(form.get("group")||"null")) as ProductGroup;
  if(intent==="csv"){
   const file=form.get("csv");if(!(file instanceof File)||file.size>1024*1024)throw new Error("Choose a CSV smaller than 1 MB.");
   const data=parseCsv(await file.text()),header=data.shift()||[];const required=[...group.options,"Selling price","Crossed-out price","Width","Height"];
   if(JSON.stringify(header)!==JSON.stringify(required))throw new Error("Use the exported CSV columns without renaming them.");
   const old=new Map(group.rows.map(r=>[r.values.join("|"),r]));group.rows=data.map((cells)=>{const values=cells.slice(0,group.options.length),n=group.options.length,previous=old.get(values.join("|"));return {id:previous?.id||crypto.randomUUID(),values,price:Number(cells[n]),compare:cells[n+1]?Number(cells[n+1]):null,width:Number(cells[n+2]),height:Number(cells[n+3]),templates:previous?.templates||{Portrait:emptyTemplate(),Landscape:emptyTemplate()}};});
  }

  if(intent==="upload"){
   const file=form.get("asset");if(!(file instanceof File)||!file.size||file.type!=="image/png")throw new Error("Choose a transparent PNG mockup.");
   const row=group.rows.find(r=>r.id===form.get("row")),direction=form.get("direction")==="Landscape"?"Landscape":"Portrait";
   if(!row)throw new Error("Choose a size and type first.");
   const ratio=direction==="Portrait"?row.width/row.height:row.height/row.width;
   const bounds=inspectMockupPng(await file.arrayBuffer(),ratio);
   const asset=await uploadImageAsset(admin,file);
   row.templates[direction]={...emptyTemplate(),...bounds,mockup:asset.url,mockupName:file.name.slice(0,150),studs:false};
   return {ok:true,message:"PNG uploaded. Click Save after all your changes are ready.",group:null,report:null,uploaded:{rowId:row.id,direction,template:row.templates[direction]}};
  }
  group=validateGroup(group);
  if(intent!=="duplicate"){const errors=tagErrors(group,settings.state.groups);if(Object.keys(errors).length)throw new Error(Object.values(errors)[0]);}
  if(!["save","apply","upload","csv","archive","duplicate"].includes(intent))throw new Error("Unknown action.");
  checkpoint(settings.state,`${intent}: ${group.name}`);
  if(intent==="duplicate"){group={...structuredClone(group),id:crypto.randomUUID(),name:group.name+" copy",tags:[],portraitTag:"",landscapeTag:"",collectionIds:[],productIds:[]};return {ok:true,message:"Copy created on this page. Choose a tag, then click Save.",group,report:null};}
  else if(intent==="archive") {settings.state.groups=settings.state.groups.filter(g=>g.id!==group.id);settings.state.published=settings.state.published.filter(g=>g.id!==group.id);}
  else settings.state.groups=[...settings.state.groups.filter(g=>g.id!==group.id),group];
  if(["save","apply"].includes(intent))settings.state.published=[...settings.state.published.filter(g=>g.id!==group.id),structuredClone(group)];
  await saveGroupSettings(admin,settings);
  const report=["save","apply","archive"].includes(intent)?{...await syncGroups(admin,settings.state.published,catalog),revision:String(Number(settings.digest||0)+1)}:null;
  const ok=!report||(!report.errors.length&&!report.conflicts.length);
  return {ok,message:report?(ok?(report.nextCursor?"Settings saved. Updating matching products…":"Saved and updated matching products."):"Settings saved. Some products need attention; review the results and Apply again."):intent==="upload"?"PNG uploaded. Click Save when ready.":intent==="duplicate"?"Group duplicated. Choose its tags or products before saving.":"Settings saved.",group:intent==="archive"?null:group,report};
 }catch(e){return {ok:false,message:e instanceof Error?e.message:String(e),group:null,report:null};}
};
export default function ProductGroups(){
 const {settings,catalog,selected,index,selectedTab}=useLoaderData<typeof loader>(),result=useActionData<typeof action>(),nav=useNavigation(),busy=nav.state!=="idle";
 const syncFetcher=useFetcher<typeof action>(),uploadFetcher=useFetcher<typeof action>(),uploading=uploadFetcher.state!=="idle";
 useEffect(()=>{const response=uploadFetcher.data;if(!response)return;if(response.ok&&"uploaded" in response&&response.uploaded){const u=response.uploaded;setGroup(g=>({...g,previewMode:"png",rows:g.rows.map(r=>r.id===u.rowId?{...r,templates:{...r.templates,[u.direction]:u.template}}:r)}));setDirty(true);if(fileRef.current)fileRef.current.value="";}setCopyMessage(response.message);},[uploadFetcher.data]);
 const [syncing,setSyncing]=useState(false),[progress,setProgress]=useState<{updated:number;unchanged:number;remaining:number;errors:string[]}|null>(null);
 const manual=(g:ProductGroup):ProductGroup=>({...g,compareMode:"manual",percentage:0,rows:g.rows.map(r=>({...r,compare:comparePrice(g,r)}))});
 const [group,setGroup]=useState(()=>manual(selected)),[,setTab]=useState(selectedTab),[,setRowId]=useState(selected.rows[0]?.id||""),[dirty,setDirty]=useState(false),[copyMessage,setCopyMessage]=useState(""),[newSize,setNewSize]=useState(""),[newType,setNewType]=useState(""),[newPrice,setNewPrice]=useState(""),[newOldPrice,setNewOldPrice]=useState(""),[search,setSearch]=useState(""),[sizeError,setSizeError]=useState(""),[attemptedSave,setAttemptedSave]=useState(false),[uploadTarget,setUploadTarget]=useState<{rowId:string;direction:Direction}|null>(null);
 const activeGroup=useRef(selected.id),fileRef=useRef<HTMLInputElement>(null),tagFormRef=useRef<HTMLFormElement>(null);
 useEffect(()=>{setTab(selectedTab);},[selectedTab,selected.id]);
 useEffect(()=>{if(index&&result?.ok&&result.message.startsWith("Tag created"))tagFormRef.current?.reset();},[index,result]);
 const continueSync=(report:NonNullable<typeof result>["report"])=>{if(report?.nextCursor){setSyncing(true);syncFetcher.submit({intent:"continue-sync",cursor:report.nextCursor,revision:report.revision},{method:"post"});}else setSyncing(false);};
 useEffect(()=>{if(result?.report){setProgress({updated:result.report.updated,unchanged:result.report.unchanged,remaining:result.report.remaining,errors:[...result.report.errors,...result.report.conflicts]});continueSync(result.report);}},[result]);
 useEffect(()=>{const response=syncFetcher.data;if(!response)return;if(response.report){const r=response.report;setProgress(p=>({updated:(p?.updated||0)+r.updated,unchanged:(p?.unchanged||0)+r.unchanged,remaining:r.remaining,errors:[...(p?.errors||[]),...r.errors,...r.conflicts]}));continueSync(r);}else{setSyncing(false);setProgress(p=>({...p!,remaining:0,errors:[...(p?.errors||[]),response.message]}));}},[syncFetcher.data]);

 useEffect(()=>{if(result&&!result.ok&&!result.group)return;const g=manual(result?.group||selected);setGroup(g);setDirty(!!result?.group&&result.message.startsWith("Copy created"));if(result?.ok)setCopyMessage("");setRowId(current=>g.rows.some(r=>r.id===current)?current:g.rows[0]?.id||"");if(activeGroup.current!==g.id){activeGroup.current=g.id;setTab(selectedTab);}if(result?.ok&&fileRef.current)fileRef.current.value="";},[selected,result,selectedTab]);
 const change=(patch:Partial<ProductGroup>)=>{setGroup(g=>({...g,...patch}));setDirty(true);};
 const setRow=(id:string,patch:Partial<GroupRow>)=>change({rows:group.rows.map(r=>r.id===id?{...r,...patch}:r)});
 const matched=catalog.filter(p=>matches(group,p)),conflicts=matched.filter(p=>settings.state.published.some(g=>g.id!==group.id&&matches(g,p)));
 const basicTag=group.tags[0]||"",portraitTag=group.portraitTag||"",landscapeTag=group.landscapeTag||"",errors=tagErrors(group,settings.state.groups);
 const renameOption=(old:string,name:string)=>change({options:group.options.map(n=>n===old?name:n),valueAliases:{...group.valueAliases,[name]:group.valueAliases?.[old]||group.valueAliases?.[name]||{}},optionAliases:{...group.optionAliases,[name]:[...new Set([old,...(group.optionAliases?.[old]||[]),...(group.optionAliases?.[name]||[])])].filter(n=>n!==name)}});
 const renameValue=(id:string,index:number,name:string)=>change({rows:renameRowValue(group,id,index,name)});
 const copyTag=async(tag:string)=>{try{await navigator.clipboard.writeText(tag);setCopyMessage("Tag copied. Paste it into the product’s Tags in Shopify.");}catch{setCopyMessage("Select the tag text and copy it.");}};
 const addSize=()=>{
  const dims=parseSizeInput(newSize);
  const fail=(message:string,id:string)=>{setSizeError(message);document.getElementById(id)?.focus();};
  if(!dims){fail("Enter a size like 10x15, 10 × 15 or 10 by 15.","pg-new-size");return;}
  const {width,height}=dims;
  const price=newPrice.trim()?Number(newPrice):0,compare=newOldPrice.trim()?Number(newOldPrice):null;
  if(newPrice.trim()&&(!Number.isFinite(price)||price<=0)){fail("Enter a positive selling price, or leave it empty and add it later.","pg-new-price");return;}
  if(compare!==null&&(!Number.isFinite(compare)||compare<=0||(price>0&&compare<=price))){fail("Old price must be positive and higher than the selling price.","pg-new-old-price");return;}
  const options=group.options.length===1&&newType.trim()?[group.options[0],"Type"]:group.options;
  const existingRows=group.rows.map(r=>r.values.length<options.length?{...r,values:[...r.values,"Standard"],previousValues:r.previousValues?.map(values=>[...values,"Standard"])}:r);
  const values=options.length===1?[`${width}×${height} inches`]:[`${width}×${height} inches`,newType.trim()||"Standard"];
  if(existingRows.some(r=>r.values.join("|")===values.join("|"))){fail("This size and type already exists. Edit its price or images below.","pg-new-size");return;}
  const id=crypto.randomUUID();
  change({options,rows:[...existingRows,{id,values,price,compare,width,height,templates:{Portrait:emptyTemplate(),Landscape:emptyTemplate()}}]});
  setRowId(id);setSizeError("");setCopyMessage(`${width}×${height} added. ${price?"":"Enter its selling price before Save. "}You can upload PNGs now.`);
  setNewSize("");setNewPrice("");setNewOldPrice("");
 };
 const uploadPNG=(r:GroupRow,dir:Direction,file:File)=>{
  if(uploading||busy||syncing)return;
  setUploadTarget({rowId:r.id,direction:dir});
  const data=new FormData();data.set("intent","upload");data.set("group",JSON.stringify(group));data.set("row",r.id);data.set("direction",dir);data.set("asset",file);
  uploadFetcher.submit(data,{method:"post",encType:"multipart/form-data"});
 };
 const duplicate=(r:GroupRow)=>{
  const id=crypto.randomUUID();setGroup(duplicateSizeRow(group,r.id,id));setDirty(true);
  setCopyMessage("Copy added. Change its type or size, then upload its PNGs.");
  setTimeout(()=>document.getElementById("pg-type-"+id)?.focus(),0);
 };
 const editSize=(r:GroupRow,value:string)=>{
  const dims=parseSizeInput(value);
  if(!dims){setCopyMessage("Enter a size like 10x15.");return;}
  const name=`${dims.width}×${dims.height} inches`;
  change({rows:renameRowValue(group,r.id,0,name).map(item=>item.id===r.id?{...item,...dims}:item)});
 };
 const saveCheck=(event:React.FormEvent<HTMLFormElement>)=>{
  const intent=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
  if(intent!=="apply")return;
  setAttemptedSave(true);
  const tagIssue=Object.values(errors)[0],missing=group.rows.find(r=>!r.price||r.price<=0);
  if(tagIssue||missing){event.preventDefault();setCopyMessage(tagIssue||"Enter the selling price in the highlighted size.");setTimeout(()=>document.getElementById(tagIssue?"pg-main-tag":"pg-price-"+missing!.id)?.focus(),0);return;}
  try{validateGroup(structuredClone(group));}catch(error){event.preventDefault();setCopyMessage(error instanceof Error?error.message:"Check the highlighted fields.");}
 };

 if(index){
  const visible=settings.state.groups.filter(g=>(g.name+" "+[...g.tags,g.portraitTag,g.landscapeTag].join(" ")).toLowerCase().includes(search.trim().toLowerCase()));
  return <s-page heading="Tags" inlineSize="large"><style>{styles}</style>
   <div className="pg-tags-page">
    <header className="pg-tags-heading"><h1>Tags</h1><p>Create once. Reuse on any product.</p></header>
    {result&&<div role="status" className={`pg-message ${result.ok?"success":"error"}`}>{result.message}{result.ok&&result.group&&<Link className="pg-link-button" to={`?group=${result.group.id}`}>Add sizes & images →</Link>}</div>}
    <div className="pg-tags-columns">
     <section className="pg-card pg-new-tag"><h2>Add new tag</h2><Form method="post" ref={tagFormRef}><input type="hidden" name="intent" value="create-tag"/>
      <label htmlFor="new-tag-name">Name<input id="new-tag-name" name="tagName" placeholder="Example: acrylic-frames" maxLength={255} required disabled={busy}/></label>
      <small>Use this same tag on your products.</small>
      <label htmlFor="new-tag-description">Description (optional)<textarea id="new-tag-description" name="description" placeholder="A short note for you" maxLength={1500} rows={3} disabled={busy}/></label>
      <p>After creating the tag, add your sizes, prices and optional PNG mockups.</p>
      <button className="pg-link-button" type="submit" disabled={busy}>{busy?"Creating…":"Create tag"}</button>
     </Form></section>
     <section className="pg-card pg-tag-list"><div className="pg-tag-list-toolbar"><h2>Your tags <small>{settings.state.groups.length} saved</small></h2><label>Search tags<input value={search} placeholder="Type 2–3 letters" onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="pg-table-scroll"><table><thead><tr><th>Name</th><th>Images</th><th>Sizes</th><th>Products</th></tr></thead><tbody>
       {visible.map(g=>{
        const previews=g.rows.flatMap(r=>(["Portrait","Landscape"] as const).map(dir=>({url:r.templates[dir].mockup,label:r.values.join(" · ")+" · "+dir}))).filter(t=>t.url);
        const edit=`?group=${g.id}`;
        return <tr key={g.id}><td><Link className="pg-tag-name" to={edit}>{g.name}</Link><small className="pg-tag-code">{g.tags[0]}</small>{g.description&&<small>{g.description}</small>}<div className="pg-row-actions"><Link to={edit}>Edit</Link><span>·</span><Link to={edit+"&tab=mockups"}>Images</Link></div>{(g.portraitTag||g.landscapeTag)&&<small>Direction tags: {[g.portraitTag,g.landscapeTag].filter(Boolean).join(", ")}</small>}</td>
         <td>{previews.length?<Link to={edit+"&tab=mockups"} className="pg-tag-previews" aria-label={`Edit PNG images for ${g.name}`}>{previews.slice(0,2).map(t=><img key={t.url+t.label} src={t.url} alt={t.label} loading="lazy"/>)}<small>{previews.length} PNGs</small></Link>:<Link className="pg-add-image" to={edit+"&tab=mockups"}>＋ Add PNGs<small>Optional</small></Link>}</td>
         <td>{new Set(g.rows.map(r=>r.values[0])).size||"—"}</td><td>{catalog.filter(p=>matches(g,p)).length}</td></tr>;
       })}
      </tbody></table></div>
      {!visible.length&&<p className="pg-empty">{search?"No matching tags. Try another name.":"Create your first tag on the left."}</p>}
     </section>
    </div>
   </div>
  </s-page>;
 }
 return <s-page heading="Tag settings" inlineSize="large"><style>{styles}</style>
 <div className="pg-layout"><aside><Link to=".">← All tags</Link><h2>Your tags</h2>{settings.state.groups.map(g=><Link key={g.id} to={`?group=${g.id}`} className={g.id===group.id?"selected":""}>{g.name}</Link>)}<Link to=".">＋ New tag</Link><p>Set up sizes and mockups once. Reuse them for every design.</p></aside><main>
 {result&&<div role="status" className={`pg-message ${result.ok?"success":"error"}`}><strong>{result.message}</strong>{result.report&&<><p>{result.report.updated} updated · {result.report.unchanged} already correct</p>{[...result.report.errors,...result.report.conflicts].map((text,i)=><p key={i}>{text}</p>)}</>}</div>}
 {progress&&<div role="status" className="pg-message"><strong>{syncing?`Updating products… ${progress.remaining} remaining`:"Product update finished"}</strong><p>{progress.updated} updated · {progress.unchanged} already correct</p>{syncing&&<small>Keep this page open until the update finishes.</small>}{progress.errors.map((error,i)=><p key={i}>{error}</p>)}</div>}
 <Form method="post" encType="multipart/form-data" onSubmit={saveCheck}><fieldset className="pg-form-fields" disabled={busy||syncing||uploading}><input type="hidden" name="group" value={JSON.stringify(group)}/>
 <header className="pg-toolbar"><div><h1>{group.name}</h1><small>{dirty?"Unsaved changes":`${matched.length} matching products`}</small></div><div className="pg-actions"><button className="primary" name="intent" value="apply" disabled={busy||!!conflicts.length}>{busy?"Saving…":uploading?"Uploading PNG…":syncing?"Updating products…":"Save"}</button></div></header>

 <section className="pg-card pg-simple-tag"><div className="pg-fields"><label>Tag name<input id="pg-main-tag" value={basicTag} onChange={e=>change({tags:[e.target.value,...group.tags.slice(1)]})}/>{errors.plain&&<small className="pg-field-error">{errors.plain}</small>}</label><label>Direction<select value={group.direction} onChange={e=>change({direction:e.target.value as ProductGroup["direction"]})}><option value="customer">Customer chooses Portrait / Landscape</option><option value="portrait">Portrait only</option><option value="landscape">Landscape only</option><option value="product">Use product design</option></select></label></div><button type="button" onClick={()=>copyTag(basicTag)}>Copy tag</button><p>One tag. All your sizes, prices and PNGs below.</p></section>

 {copyMessage&&<p role="status" className="pg-message">{copyMessage}</p>}


 <section className="pg-card"><h2>Sizes, prices & images</h2><p>Add a size. Enter its price. Upload the PNGs you need. Click Save after all changes.</p>
 <section className="pg-add-size"><h3>＋ Add size</h3>{sizeError&&<p role="alert" className="pg-field-error" id="pg-size-error">{sizeError}</p>}<div className="pg-fields"><label>Size in inches<input id="pg-new-size" placeholder="Example: 10x15" value={newSize} onChange={e=>setNewSize(e.target.value)} aria-describedby={sizeError?"pg-size-error":undefined}/></label><label>{group.options[1]||"Type"} (optional)<input placeholder="Example: 3mm without studs" value={newType} onChange={e=>setNewType(e.target.value)}/></label></div><button type="button" className="primary" onClick={addSize}>＋ Add size</button><small>Price and PNGs can be added in the new box below.</small></section>
 <div className="pg-inline-cards">{group.rows.map(r=><section className="pg-inline-card" key={r.id}>
  <header><h3>{r.values.join(" · ")}</h3><div className="pg-actions"><button type="button" onClick={()=>duplicate(r)}>Duplicate</button><button type="button" className="text-button" onClick={()=>{if(confirm("Remove this size and type? Click Save to keep the change."))change({rows:group.rows.filter(item=>item.id!==r.id)});}}>Remove</button></div></header>
  <div className="pg-fields"><label>Size in inches<input key={r.values[0]} defaultValue={r.values[0]} onBlur={e=>{if(!parseSizeInput(e.target.value))e.target.value=r.values[0];else editSize(r,e.target.value);}}/></label>{group.options.slice(1).map((name,i)=><label key={i}>{name}<input id={"pg-type-"+r.id} value={r.values[i+1]} onChange={e=>renameValue(r.id,i+1,e.target.value)} onBlur={()=>renameValue(r.id,i+1,r.values[i+1].trim())}/></label>)}</div>
  <div className="pg-fields"><label>Selling price ({settings.currency})<input id={"pg-price-"+r.id} type="number" min=".01" step=".01" inputMode="decimal" value={r.price||""} placeholder="Enter your price" aria-invalid={attemptedSave&&!r.price} onChange={e=>setRow(r.id,{price:Number(e.target.value)})}/>{attemptedSave&&!r.price&&<small className="pg-field-error">Enter the selling price before Save.</small>}</label><label>Old price (optional)<input type="number" min=".01" step=".01" value={r.compare??""} placeholder="Leave empty if not needed" onChange={e=>setRow(r.id,{compare:e.target.value?Number(e.target.value):null})}/></label></div>
  <div className="pg-inline-uploads">{(["Portrait","Landscape"] as const).map(dir=>{
   const t=r.templates[dir],target=uploadTarget?.rowId===r.id&&uploadTarget.direction===dir;
   return <section className="pg-inline-upload" key={dir}><h4>{dir} PNG <small>Optional</small></h4>
    {t.mockup?<div className="pg-png-preview" style={{aspectRatio:String(t.mockupAspect||1)}}><div className="pg-demo-design" style={{left:`${t.x-t.width/2}%`,top:`${t.y-t.height/2}%`,width:`${t.width}%`,height:`${t.height}%`}}>Your design</div><img src={t.mockup} alt={r.values.join(" ")+" "+dir+" mockup"}/></div>:<div className="pg-upload-empty">＋<span>Upload your {dir.toLowerCase()} PNG here</span></div>}
    <label className="pg-file-button">{target&&uploading?"Uploading PNG…":t.mockup?"Replace PNG":"Upload PNG"}<input type="file" accept="image/png,.png" aria-label={`${r.values.join(" ")} ${dir} PNG`} disabled={uploading||busy||syncing} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)uploadPNG(r,dir,file);e.currentTarget.value="";}}/></label>
    {t.mockup&&<><small className="pg-file-name">{t.mockupName||"PNG uploaded"} · ✓</small><button type="button" className="text-button" onClick={()=>{if(confirm("Remove this PNG? Click Save to keep the change."))setRow(r.id,{templates:{...r.templates,[dir]:emptyTemplate()}});}}>Remove PNG</button></>}
    {target&&!uploading&&uploadFetcher.data&&!uploadFetcher.data.ok&&<p role="alert" className="pg-field-error">{uploadFetcher.data.message}</p>}
   </section>;
  })}</div>
 </section>)}</div>
 {!group.rows.length&&<p className="pg-empty">Enter a size above and click Add size. Its price and image boxes appear here.</p>}
 <div className="pg-bottom-save"><button className="primary" name="intent" value="apply" disabled={busy||syncing||uploading}>{busy?"Saving…":"Save"}</button><small>Save all sizes, prices and images together.</small></div>
 </section>
 <details className="pg-card"><summary>More options</summary>
  {<section className="pg-card"><h2>Names & extra options</h2><label>Display name<input value={group.name} onChange={e=>change({name:e.target.value})}/></label><label>Description (optional)<textarea rows={3} maxLength={1500} value={group.description||""} onChange={e=>change({description:e.target.value})}/></label><h3>Customer option names</h3><p>Choose the names customers see. For acrylic frames, use Size, Thickness and Orientation.</p><div className="pg-fields">{group.options.map((name,i)=><label key={i}>Option {i+1} name<input value={name} onChange={e=>renameOption(name,e.target.value)} onBlur={()=>renameOption(name,name.trim())}/></label>)}<label>Direction option name<input value={group.orientationOption} onChange={e=>{const name=e.target.value;change({orientationOption:name,optionAliases:{...group.optionAliases,[name]:[group.orientationOption,...(group.optionAliases?.[group.orientationOption]||[])].filter(n=>n!==name)}});}}/></label></div><label className="pg-check"><input type="checkbox" checked={group.options.length>1} onChange={e=>{if(e.target.checked)change({options:[...group.options,"Type"],rows:group.rows.map(r=>({...r,values:[...r.values,"Standard"],previousValues:r.previousValues?.map(values=>[...values,"Standard"])}))});else if(new Set(group.rows.map(r=>r.values[0])).size!==group.rows.length)setCopyMessage("This setup has multiple types for a size. Keep the option, or remove the extra rows first.");else change({options:[group.options[0]],rows:group.rows.map(r=>({...r,values:[r.values[0]],previousValues:r.previousValues?.map(values=>[values[0]])}))});}}/>Add another option, such as Thickness, Color or Material</label></section>}
 <p>PNG images are optional. Include the sofa, frame and studs in your PNG, with one transparent rectangle for the design.</p>
 <label className="pg-check"><input type="checkbox" checked={group.previewMode!=="off"} onChange={e=>change({previewMode:e.target.checked?"png":"off"})}/>Use uploaded PNGs on products</label>
 </details>


 {<details className="pg-card"><summary>Direction tags & advanced settings</summary><h2>Set up once. Reuse with a tag.</h2><p>Name one tag and Save. Add that tag to any product in Shopify. All saved sizes, prices and optional PNG images apply automatically. You do not need to select products here.</p>
 <details><summary>Separate direction tags (optional)</summary><p>Only use these if the same setup needs separate portrait and landscape product tags.</p><div className="pg-tag"><label>Portrait design<input aria-invalid={!!errors.portrait} value={portraitTag} placeholder="Choose your own tag" onChange={e=>change({portraitTag:e.target.value})}/>{errors.portrait&&<small className="pg-field-error">{errors.portrait}</small>}</label><button type="button" disabled={!portraitTag} onClick={()=>copyTag(portraitTag)}>Copy tag</button></div>
 <div className="pg-tag"><label>Landscape design<input aria-invalid={!!errors.landscape} value={landscapeTag} placeholder="Choose your own tag" onChange={e=>change({landscapeTag:e.target.value})}/>{errors.landscape&&<small className="pg-field-error">{errors.landscape}</small>}</label><button type="button" disabled={!landscapeTag} onClick={()=>copyTag(landscapeTag)}>Copy tag</button></div>
 </details><label>Direction for the main tag<select value={group.direction} onChange={e=>change({direction:e.target.value as ProductGroup["direction"]})}><option value="customer">Customer chooses Portrait / Landscape</option><option value="portrait">Portrait only</option><option value="landscape">Landscape only</option><option value="product">Use the product design</option></select></label>
 <p>Return here only to change the shared sizes, prices or mockups. Every tagged product uses those shared settings.</p>
 <p>Images are optional. Prices update even where no PNG is uploaded. Print downloads contain the design at the ordered size.</p>
 <details><summary>{matched.length} matching products</summary>{matched.map(p=><p key={p.id}>{p.title}{conflicts.some(c=>c.id===p.id)?" — matches another setup; use one setup per product":""}</p>)}</details>
 <details><summary>Other setup options</summary><label>Product customization<select value={group.customization} onChange={e=>change({customization:e.target.value as ProductGroup["customization"]})}><option value="plain">Allow plain photo upload; keep uploaded product designs</option><option value="existing">Use existing product designs</option><option value="design">Use fixed design artwork</option></select></label><label className="pg-check"><input type="checkbox" checked={group.createVariants} onChange={e=>change({createVariants:e.target.checked})}/>Automatically create sizes for tagged products, including newly added sizes</label><p>Existing variants keep their IDs. New sizes are added only when the product options match this setup.</p><button name="intent" value="duplicate" disabled={busy}>Duplicate setup</button></details>
 </details>}
 </fieldset></Form></main></div></s-page>;
}
const styles=`.pg-inline-cards{display:grid;gap:24px;margin:24px 0}.pg-inline-card{border:1px solid #ccc;border-radius:14px;padding:22px;background:#fff}.pg-inline-card>header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #eee;padding-bottom:16px}.pg-inline-card h3{margin:0;font-size:22px}.pg-inline-uploads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:20px}.pg-inline-upload{border:1px solid #ddd;background:#fafafa;border-radius:12px;padding:18px;min-width:0}.pg-inline-upload h4{font-size:18px;margin:0 0 14px}.pg-upload-empty{height:190px;border:2px dashed #ccc;border-radius:10px;display:flex;flex-direction:column;justify-content:center;align-items:center;font-size:40px;color:#777}.pg-upload-empty span{font-size:14px;text-align:center}.pg-file-button{position:relative;display:block!important;text-align:center;background:#222;color:#fff;border-radius:9px;padding:14px;margin-top:14px;cursor:pointer;overflow:hidden}.pg-layout .pg-file-button input[type=file]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;padding:0}.pg-file-button:focus-within{outline:2px solid #2563eb;outline-offset:3px}.pg-file-name{overflow-wrap:anywhere}.pg-bottom-save{display:flex;align-items:center;gap:16px;border-top:1px solid #ddd;padding-top:20px}.pg-inline-upload .pg-png-preview{width:100%;max-width:360px;margin:auto}.pg-inline-card [aria-invalid=true]{border-color:#b42318!important}@media(max-width:700px){.pg-inline-uploads{grid-template-columns:1fr}.pg-inline-card>header{align-items:start;flex-direction:column}.pg-inline-card{padding:16px}.pg-inline-card .pg-fields{grid-template-columns:1fr}}.pg-add-size{padding:20px;background:#f6f7f8;border:1px solid #ddd;border-radius:12px;margin:20px 0}.pg-add-size h3{margin:0;font-size:20px}.pg-add-size>p{color:#666}.pg-add-size .pg-field-error{color:#b42318}.pg-add-size small{margin-top:12px}
.pg-tags-page{max-width:1440px;margin:24px auto;font:15px/1.5 Arial,sans-serif;color:#202223}.pg-tags-page *{box-sizing:border-box}.pg-tags-heading h1{font-size:28px;margin:0}.pg-tags-heading p{color:#666;margin:4px 0 22px}.pg-tags-columns{display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px}.pg-tags-columns .pg-card{margin:0}.pg-tags-page label{display:block;font-weight:600;margin:18px 0 6px}.pg-tags-page input,.pg-tags-page textarea,.pg-layout textarea{display:block;width:100%;padding:12px;border:1px solid #aaa;border-radius:8px;font:inherit;margin-top:6px;min-height:44px}.pg-tags-page small{display:block;color:#666;font-size:13px;font-weight:400}.pg-new-tag{align-self:start}.pg-new-tag p{font-size:14px;color:#666}.pg-new-tag button{font:inherit;min-height:44px;cursor:pointer}.pg-tags-page .pg-message{margin-bottom:18px}.pg-tags-page .pg-message a{display:inline-block;margin:10px}.pg-tag-list-toolbar{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:16px}.pg-tag-list-toolbar label{margin:0;max-width:320px;flex:1}.pg-tags-page table{width:100%;border-collapse:collapse;text-align:left}.pg-tags-page th,.pg-tags-page td{padding:16px 12px;border-bottom:1px solid #e5e5e5;vertical-align:middle}.pg-tags-page th{background:#f7f7f7}.pg-tag-name{font-weight:700;font-size:17px;color:#1d5c8d;text-decoration:none}.pg-tag-code{overflow-wrap:anywhere}.pg-row-actions{display:flex;gap:8px;margin-top:8px}.pg-row-actions a,.pg-add-image{color:#1d5c8d;text-decoration:none}.pg-tag-previews{display:flex;align-items:center;gap:6px;flex-wrap:wrap;max-width:180px;text-decoration:none}.pg-tag-previews img{width:64px;height:64px;object-fit:contain;background:#f4f4f4;border:1px solid #ddd;border-radius:8px}.pg-tag-previews small{flex-basis:100%}.pg-tags-page input:focus-visible,.pg-tags-page textarea:focus-visible,.pg-tags-page a:focus-visible,.pg-tags-page button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}@media(max-width:1100px){.pg-tags-columns{grid-template-columns:260px minmax(0,1fr)}.pg-tag-list-toolbar{display:block}.pg-tag-list-toolbar label{max-width:none;margin-top:12px}}@media(max-width:800px){.pg-tags-columns{grid-template-columns:1fr}.pg-tags-page{margin:16px auto}.pg-tag-list{min-width:0}.pg-tags-page th,.pg-tags-page td{padding:12px 8px}.pg-tag-previews img{width:46px;height:46px}.pg-tag-name{font-size:15px}}
.pg-index{max-width:1400px;margin:24px auto;font:15px/1.5 Arial,sans-serif;color:#202223}.pg-index input{display:block;width:100%;padding:12px;margin:8px 0 20px;border:1px solid #aaa;border-radius:8px}.pg-table-scroll{overflow:auto}.pg-index table{width:100%;border-collapse:collapse;text-align:left}.pg-index th,.pg-index td{padding:18px;border-bottom:1px solid #ddd;vertical-align:middle}.pg-index small{display:block}.pg-field-error{color:#b42318!important}.pg-tag label{flex:1;min-width:220px}.pg-form-fields{border:0;padding:0;margin:0;min-width:0}.pg-layout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:24px;max-width:1400px;margin:auto;color:#202223;font:15px/1.5 Arial,sans-serif}.pg-layout *{box-sizing:border-box}.pg-layout aside{align-self:start;background:white;border:1px solid #ddd;padding:18px;border-radius:14px}.pg-layout aside h2{font-size:16px;margin:0 0 12px}.pg-layout aside a{display:block;padding:12px;color:inherit;text-decoration:none;border-radius:8px}.pg-layout .selected{background:#fff1e5!important;border-color:#ed6a0c!important}.pg-layout aside p{font-size:13px;color:#666}.pg-layout main{min-width:0}.pg-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px;background:white;border:1px solid #ddd;border-radius:14px;position:sticky;top:8px;z-index:5}.pg-toolbar h1{font-size:21px;margin:0}.pg-layout small{display:block;color:#666;font-size:13px;font-weight:400;margin-top:5px}.pg-layout button,.pg-link-button{font:inherit;cursor:pointer;border:1px solid #aaa;border-radius:9px;background:white;padding:10px 14px;min-height:44px;text-decoration:none;color:#222}.pg-layout .primary,.pg-link-button{background:#222;color:white;border-color:#222}.pg-layout button:disabled{opacity:.5;cursor:wait}.pg-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pg-layout nav{display:flex;gap:10px;margin:20px 0;flex-wrap:wrap}.pg-layout nav button[aria-current=page]{background:#fff1e5;border-color:#ed6a0c;font-weight:700}.pg-card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:24px;margin:18px 0}.pg-card h2{font-size:23px;margin:0}.pg-card>p{color:#616161}.pg-size-list,.pg-mockup-matrix{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:20px 0}.pg-size{border:1px solid #ddd;border-radius:13px;overflow:hidden;min-width:0}.pg-size>h3{margin:0;padding:16px 20px;background:#f7f7f7;font-size:21px}.pg-price-row,.pg-mockup-row{padding:18px;border-top:1px solid #e6e6e6}.pg-price-row>strong,.pg-mockup-row>strong{font-size:17px}.pg-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0}.pg-layout label{display:block;font-weight:600}.pg-layout input:not([type=checkbox]),.pg-layout select{display:block;width:100%;min-width:0;margin-top:6px;padding:12px;border:1px solid #999;border-radius:9px;background:#fff;min-height:46px;font:inherit}.pg-price-row input{font-size:21px!important}.pg-layout button:focus-visible,.pg-layout input:focus-visible,.pg-layout select:focus-visible{outline:2px solid #2563eb;outline-offset:2px}.pg-layout details{border-top:1px solid #eee;padding:16px 0}.pg-layout summary{cursor:pointer;font-weight:600}.pg-layout .text-button{border:0;padding:8px;background:none;color:#53616f;font-size:13px}.pg-next{margin-top:20px}.pg-message{padding:14px 18px;background:#f1f5f9;border-radius:10px;overflow-wrap:anywhere}.pg-message.error{background:#fff1e5}.pg-message.success{background:#edf7ed}.pg-mockup-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:150px!important;border-style:dashed!important}.pg-mockup-tile img{width:100%;height:110px;object-fit:contain;background:repeating-conic-gradient(#eee 0% 25%,white 0% 50%) 0/16px 16px}.pg-upload-icon{font-size:32px;color:#888}.pg-upload-panel{background:#fafafa;border:1px solid #ddd;border-radius:14px;padding:22px;margin-top:24px}.pg-upload-panel>button{margin-top:16px}.pg-png-preview{position:relative;max-width:460px;overflow:hidden;background:#eee}.pg-png-preview>img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.pg-demo-design{position:absolute;display:grid;place-items:center;text-align:center;background:linear-gradient(145deg,#dbeafe,#fae8ff);color:#435174;font-weight:600;overflow:hidden}.pg-tag{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#f6f7f8;border-radius:12px;padding:20px;margin:24px 0}.pg-tag code{font-size:18px;user-select:all;overflow-wrap:anywhere}.pg-check{margin:18px 0}.pg-empty{text-align:center;padding:24px}@media(max-width:1100px){.pg-size-list,.pg-mockup-matrix{grid-template-columns:1fr}}@media(max-width:800px){.pg-layout{grid-template-columns:1fr}.pg-layout aside{display:flex;align-items:center;gap:8px;overflow:auto;padding:10px}.pg-layout aside h2,.pg-layout aside p{display:none}.pg-layout aside a{white-space:nowrap}.pg-toolbar{position:static;flex-wrap:wrap}.pg-card{padding:18px}}@media(max-width:420px){.pg-fields{grid-template-columns:1fr}.pg-mockup-row .pg-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.pg-layout nav{gap:6px}.pg-layout nav button{font-size:13px;padding:9px}.pg-toolbar h1{font-size:18px}}`;
