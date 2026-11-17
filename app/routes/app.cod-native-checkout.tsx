import {randomUUID} from "node:crypto";
import {Form,useLoaderData,useActionData,useNavigation,type LoaderFunctionArgs,type ActionFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate,unauthenticated} from "../shopify.server";
import {loadCodThemeReview,COD_REVIEW_SHOP} from "../lib/cod-theme-review.server";
import {calculateCodQuote} from "../lib/partial-cod-quote.server";
import {ensureNativeCodHooks} from "../lib/native-cod-hooks.server";
import {prepareNativeCodPlan} from "../lib/native-cod-plan.server";
import {createNativeCheckout,nativeCheckoutLink,reconcileNativeCheckout,readNativeCheckout} from "../lib/native-cod-checkout.server";
const db={query:<T,>(sql:string,params:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...params)};
const restrict=(shop:string)=>{if(shop!==COD_REVIEW_SHOP)throw new Response("Not found",{status:404});};
export const loader=async({request}:LoaderFunctionArgs)=>{const {session}=await authenticate.admin(request);restrict(session.shop);
 const rows=await db.query<{id:string;state:string;orderId:string|null;draftId:string|null}>(`SELECT "id","state","orderId","draftId" FROM "NativeCodCheckout" WHERE "shop"=$1 ORDER BY "createdAt" DESC LIMIT 10`,[session.shop]);
 return {id:randomUUID(),settings:await loadCodThemeReview(session.shop),rows};};
export const action=async({request}:ActionFunctionArgs)=>{
 const {session}=await authenticate.admin(request);restrict(session.shop);
 if(request.method!=="POST")throw new Response("Method not allowed",{status:405});
 const form=await request.formData(),intent=form.get("intent"),id=String(form.get("id")||"");
 const values=Object.fromEntries(["firstName","lastName","address1","address2","city","provinceCode","zip","phone","quantity"].map(k=>[k,String(form.get(k)||"").slice(0,255)]));
 let stage="validation";
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return {ok:false,message:"Invalid checkout reference"};
 try{
  const {admin}=await unauthenticated.admin(session.shop);
  if(intent==="check"){
   const result=await reconcileNativeCheckout(db,admin,session.shop,id);
   return {ok:result.state==="completed",message:result.state==="completed"?"Online payment verified. The same order now shows the full value and remaining COD balance.":result.state==="awaiting_payment"?"Payment has not completed. Use the existing checkout link; do not create a replacement.":"Needs review. Do not pay again or dispatch."};
  }
  if(intent==="link"){
   const row=await readNativeCheckout(db,session.shop,id),link=await nativeCheckoutLink(db,admin,session.shop,id);
   return link.paid?{ok:true,message:"Payment created an order. Check this checkout to verify its COD balance."}:{ok:true,message:"Existing native checkout is ready.",url:link.url,id:row.id};
  }
  if(intent!=="create")throw new Error("Invalid action");
  const settings=await loadCodThemeReview(session.shop);
  if(!settings.enabled)throw new Error("Advance COD is OFF");
  const properties=JSON.parse(String(form.get("properties")||"[]"));
  const input={lines:[{variantId:String(form.get("variantId")||""),quantity:Number(form.get("quantity")),properties}],
   address:Object.fromEntries(["firstName","lastName","address1","address2","city","provinceCode","zip","phone"].map(k=>[k,String(form.get(k)||"")])),discountCodes:[]};
  const rawPhone=String(input.address.phone||"").replace(/[\s()-]/g,"");
  const phone=/^[6-9]\d{9}$/.test(rawPhone)?`+91${rawPhone}`:/^91[6-9]\d{9}$/.test(rawPhone)?`+${rawPhone}`:rawPhone;
  const address={...input.address,phone,provinceCode:String(input.address.provinceCode||"").trim().toUpperCase(),countryCode:"IN"};
  stage="quote";
  const frozen=await calculateCodQuote(admin,{...input,address},settings.advancePercent,settings.codFeePaise);
  stage="tax_plan";
  const plan=await prepareNativeCodPlan(admin,{id,shop:session.shop,appClientId:"3879fe641910f37451baf743e76059ee",accounting:frozen.accountingSnapshot,
   address:frozen.shippingAddress,percent:settings.advancePercent,feePaise:settings.codFeePaise});
  // Operator-only native payment pilot. Label the eventual order so staff do not dispatch it.
  plan.input.tags=[`CW-NATIVE-${id}`,"Advance COD","CARTWALA PILOT - DO NOT SHIP"];
  stage="events";
  await ensureNativeCodHooks(admin);
  stage="draft";
  const link=await createNativeCheckout(db,admin,plan);
  if(link.paid)return {ok:true,message:"Use Check payment for the existing checkout."};
  return {ok:true,message:`Native checkout prepared: full order ₹${(frozen.amounts.totalPaise/100).toFixed(2)}; pay ₹${(frozen.amounts.payableNowPaise/100).toFixed(2)} now; ₹${(frozen.amounts.collectOnDeliveryPaise/100).toFixed(2)} on delivery. Opening the link does not charge you.`,url:link.url,id};
 }catch(error){
  const known=error instanceof Error&&["Invalid checkout details","Missing checkout details","Enter a valid Indian delivery address and phone","Invalid cart line","Advance COD is OFF","Shopify could not calculate this cart. Check the products, address and discount code.","This cart cannot use Advance COD. Use prepaid checkout."].includes(error.message)?error.message:null;
  console.error("Native COD pilot did not complete",{stage});
  return {ok:false,id,values,message:known?`${known}. Check your address, state and phone. Your entered details are kept below.`:`Checkout stopped at ${stage}. Recheck this same reference; no new payment should be started. Your entered details are kept below.`};
 }
};
export default function NativeCheckout(){const data=useLoaderData<typeof loader>(),result=useActionData<typeof action>(),busy=useNavigation().state!=="idle";
 return <s-page heading="Advance COD — native checkout pilot"><s-section heading="Merchant payment test">
 <p>Uses the active Shopify payment gateway. No Paytm-specific integration. Customer Advance COD remains disabled.</p>
 <p>Saved settings: {data.settings.enabled?"ON":"OFF"}, advance {data.settings.advancePercent}%, charge ₹{data.settings.codFeePaise/100}. This pilot uses real payment when you choose to pay. Do not ship the pilot order.</p>
 {result&&<p role={result.ok?"status":"alert"}>{result.message}</p>}
 {result&&"url" in result&&result.url&&<p><a href={result.url} target="_blank" rel="noreferrer">Open native payment checkout</a></p>}
 <Form method="post" key={result&&"values" in result?`retry-${result.id}`:data.id}><input type="hidden" name="id" value={result&&"values" in result?result.id:data.id}/>
 <p>Selected test product: ₹400 Heart Shape LED Magic Mirror.</p><input type="hidden" name="variantId" value="gid://shopify/ProductVariant/49065013412025"/>
 <p><label>Quantity <input name="quantity" type="number" min="1" max="1000" defaultValue={result&&"values" in result?result.values?.quantity||"1":"1"} required/></label></p>
 <input type="hidden" name="properties" value="[]"/>
 {[["firstName","First name"],["lastName","Last name"],["address1","Address"],["address2","Apartment (optional)"],["city","City"],["zip","PIN code"],["phone","Phone (10 digits or +91…) "]].map(([name,label])=><p key={name}><label>{label} <input name={name} defaultValue={result&&"values" in result?result.values?.[name]||"":""} required={!["lastName","address2"].includes(name)} /></label></p>)}
 <p><label>State <select name="provinceCode" defaultValue={result&&"values" in result?result.values?.provinceCode||"TS":"TS"} required>
 {[["AN","Andaman and Nicobar Islands"],["AP","Andhra Pradesh"],["AR","Arunachal Pradesh"],["AS","Assam"],["BR","Bihar"],["CH","Chandigarh"],["CG","Chhattisgarh"],["DH","Dadra and Nagar Haveli and Daman and Diu"],["DL","Delhi"],["GA","Goa"],["GJ","Gujarat"],["HR","Haryana"],["HP","Himachal Pradesh"],["JK","Jammu and Kashmir"],["JH","Jharkhand"],["KA","Karnataka"],["KL","Kerala"],["LA","Ladakh"],["LD","Lakshadweep"],["MP","Madhya Pradesh"],["MH","Maharashtra"],["MN","Manipur"],["ML","Meghalaya"],["MZ","Mizoram"],["NL","Nagaland"],["OD","Odisha"],["PY","Puducherry"],["PB","Punjab"],["RJ","Rajasthan"],["SK","Sikkim"],["TN","Tamil Nadu"],["TS","Telangana"],["TR","Tripura"],["UP","Uttar Pradesh"],["UK","Uttarakhand"],["WB","West Bengal"]].map(([code,name])=><option key={code} value={code}>{name}</option>)}
 </select></label></p>
 <button name="intent" value="create" disabled={busy||!data.settings.enabled}>Prepare checkout — no charge yet</button></Form>
 </s-section><s-section heading="Existing checkouts">
 {data.rows.map(row=><Form method="post" key={row.id}><input type="hidden" name="id" value={row.id}/><p>{row.id}: {row.state} {row.orderId&&<a href={`shopify:admin/orders/${row.orderId.split('/').pop()}`}>View order</a>}</p>
 <button name="intent" value="link" disabled={busy}>Open existing checkout</button>{' '}<button name="intent" value="check" disabled={busy}>Check payment and COD balance</button></Form>)}
 </s-section></s-page>;
}
