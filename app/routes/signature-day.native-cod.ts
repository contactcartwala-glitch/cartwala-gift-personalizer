import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate,unauthenticated} from "../shopify.server";
import {COD_REVIEW_SHOP,COD_REVIEW_THEME,loadCodThemeReview} from "../lib/cod-theme-review.server";
import {NATIVE_CUSTOMER_PAYMENTS_ENABLED} from "../lib/native-cod-feature";
import {calculateCodQuote} from "../lib/partial-cod-quote.server";
import {prepareNativeCodPlan} from "../lib/native-cod-plan.server";
import {ensureNativeCodHooks} from "../lib/native-cod-hooks.server";
import {createNativeCheckout,reconcileNativeCheckout,nativeCheckoutLink,readNativeCheckout} from "../lib/native-cod-checkout.server";
import {nativeCodQuoteReference} from "../lib/native-cod-payment.server";
import {issueCodAccess,readCodAccess} from "../lib/partial-cod-access.server";
const db={query:<T,>(sql:string,p:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...p)};
const headers={"Cache-Control":"no-store"};
export const loader=async({request}:LoaderFunctionArgs)=>{
 const {session}=await authenticate.public.appProxy(request);
 if(!session||session.shop!==COD_REVIEW_SHOP)return Response.json({checkoutAvailable:false},{status:404,headers});
 const settings=await loadCodThemeReview(session.shop);
 return Response.json({...settings,checkoutAvailable:NATIVE_CUSTOMER_PAYMENTS_ENABLED&&settings.enabled},{headers});
};
export const action=async({request}:ActionFunctionArgs)=>{
 const {session}=await authenticate.public.appProxy(request);
 if(!session||session.shop!==COD_REVIEW_SHOP)return Response.json({error:"Unavailable"},{status:404,headers});
 if(request.method!=="POST"||request.headers.get("content-type")?.split(';')[0].trim()!=="application/json")return Response.json({error:"Invalid request"},{status:415,headers});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>131072){await reader.cancel();throw new Error();}chunks.push(c.value);}}finally{reader.releaseLock();}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const {admin}=await unauthenticated.admin(session.shop);
  if(input.intent==="payment_status"){
   const id=readCodAccess(input.access,session.shop,process.env.SHOPIFY_API_SECRET||"");
   return Response.json(await reconcileNativeCheckout(db,admin,session.shop,id),{headers});
  }
  const settings=await loadCodThemeReview(session.shop);
  if(!NATIVE_CUSTOMER_PAYMENTS_ENABLED||!settings.enabled||input.themeId!==COD_REVIEW_THEME)return Response.json({error:"Advance COD unavailable. Use full prepaid checkout."},{status:503,headers});
  if(input.intent!=="create_quote")throw new Error();
  if(typeof input.requestKey!=="string"||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.requestKey))throw new Error();
  const id=input.requestKey;
  const existing=await db.query(`SELECT "id" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2`,[id,session.shop]);
  if(existing.length){
   const row=await readNativeCheckout(db,session.shop,id),link=await nativeCheckoutLink(db,admin,session.shop,id);
   if(link.paid)return Response.json({checkoutAvailable:false,state:"check_existing_payment",access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||"")},{headers});
   return Response.json({checkoutAvailable:true,checkoutUrl:link.url,access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||""),amounts:nativeCodQuoteReference(row.quote).amounts},{headers});
  }
  const recent=await db.query<{count:bigint}>(`SELECT COUNT(*) AS "count" FROM "NativeCodCheckout" WHERE "shop"=$1 AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '1 minute'`,[session.shop]);
  if(Number(recent[0]?.count??60)>=60)return Response.json({error:"Try again shortly"},{status:429,headers});
  const frozen=await calculateCodQuote(admin,input,settings.advancePercent,settings.codFeePaise);
  const plan=await prepareNativeCodPlan(admin,{id,shop:session.shop,appClientId:"3879fe641910f37451baf743e76059ee",accounting:frozen.accountingSnapshot,address:frozen.shippingAddress,percent:settings.advancePercent,feePaise:settings.codFeePaise});
  // Hook setup must already be idempotent and confirmed before exposing a payable invoice.
  await ensureNativeCodHooks(admin);
  const link=await createNativeCheckout(db,admin,plan);if(link.paid)throw new Error();
  return Response.json({checkoutAvailable:true,checkoutUrl:link.url,access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||""),amounts:frozen.amounts},{headers});
 }catch{return Response.json({error:"Checkout could not be confirmed. Check the existing payment before paying again; use full prepaid for unsupported carts."},{status:400,headers});}
};
