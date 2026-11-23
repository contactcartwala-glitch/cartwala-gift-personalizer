import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { zipSync } = require("fflate");
const compil = file => ts.transpileModule(readFileSync(new URL("../"+file, import.meta.url),"utf8"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const layout={};
new Function("exports",compil("app/lib/polaroid-print-layout.ts"))(layout);
const code = compil("app/routes/app.polaroid-print-part.tsx");
const cartwala = "0k9icg-ns.myshopify.com";
const order = "gid://shopify/Order/1", line = "gid://shopify/LineItem/2";
const asset = "https://cdn.shopify.com/s/files/1/0803/7931/4361/uploads/synthetic.zip";
const printRow = {id:line,product:{id:"gid://shopify/Product/15411775504569"},customAttributes:[
  {key:"Print style", value:"Glossy Polaroid Prints"}, {key:"Print files 1",value:asset},
]};
const zip = zipSync({"fixture.txt":new Uint8Array([1,2,3])});
const run = async ({shop=cartwala,nodes=[printRow],part="1",failure,body=zip,declared}={})=>{
  const calls=[];
  const req = new Request("https://fixture.invalid/app/polaroid-print-part?"+
    new URLSearchParams({order,line,part}));
  const auth={authenticate:{admin:async()=>{
    if(failure==="auth") throw new Response("Unauthenticated",{status:401});
    return {session:{shop},admin:{graphql:async(q,v)=>{
      calls.push({q,v}); return Response.json({data:{order:{lineItems:{nodes}}}});
    }}};
  }}};
  const exports={};
  const network=async (url,opts)=>{
    calls.push({url,opts});
    if(failure==="upstream") throw new Error("Unavailable");
    return new Response(body,{headers:declared?{"content-length":String(declared)}:{}});
  };
  new Function("exports","require","fetch",code)(exports,
    id=>id.includes("shopify.server")?auth:layout,network);
  try{return {response:await exports.loader({request:req}),calls}}
  catch(response){return {response,calls}}
};
test("Shopify authenticated exact order, line and part return bounded ZIP",async()=>{
  const {response,calls}=await run();
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"application/zip");
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),zip);
  assert.deepEqual(calls[0].v,{variables:{order}});
  assert.equal(calls[1].url,asset);
  assert.equal(calls[1].opts.redirect,"error");
});
test("logged-out, other shop and malformed part never look up or fetch",async()=>{
  for(const [opts,status] of [[{failure:"auth"},401],[{shop:"other.myshopify.com"},404],[{part:"0"},400]]){
    const {response,calls}=await run(opts);
    assert.equal(response.status,status); assert.equal(calls.length,0);
  }
});
test("missing order line, mismatched product or absent part never fetch",async()=>{
  for(const opts of [{nodes:[]},{nodes:[{...printRow,product:{id:"gid://shopify/Product/3"}}]},{part:"2"}]){
    const {response,calls}=await run(opts);
    assert.equal(response.status,404); assert.equal(calls.length,1);
  }
});
test("bounds and upstream failures are explicit and return no ZIP",async()=>{
  for(const [opts,status] of [[{failure:"upstream"},502],[{body:"Not a ZIP"},502],[{declared:130000000},413]]){
    const {response}=await run(opts); assert.equal(response.status,status);
    assert.notEqual(response.headers.get("content-type"),"application/zip");
  }
});
