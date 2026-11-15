import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate,unauthenticated} from "../shopify.server";
import {COD_REVIEW_SHOP,COD_REVIEW_THEME,loadCodThemeReview} from "../lib/cod-theme-review.server";
import {nativeCodAvailability} from "../lib/native-cod-feature";
import {readCodPublishedTheme} from "../lib/cod-published-theme.server";
import {calculateCodQuote} from "../lib/partial-cod-quote.server";
import {prepareNativeCodPlan} from "../lib/native-cod-plan.server";
import {ensureNativeCodHooks} from "../lib/native-cod-hooks.server";
import {createNativeCheckout,reconcileNativeCheckout,nativeCheckoutLink,readNativeCheckout} from "../lib/native-cod-checkout.server";
import {nativeCodQuoteReference} from "../lib/native-cod-payment.server";
import {authorizeNativeCodDiscount,hasNativeCodDiscountAccess} from "../lib/native-cod-discount.server";
import {issueCodAccess,readCodAccess} from "../lib/partial-cod-access.server";
const db={query:<T,>(sql:string,p:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...p)};
const headers={"Cache-Control":"no-store"};
export const loader=async({request}:LoaderFunctionArgs)=>{
 const {session}=await authenticate.public.appProxy(request);
 if(!session||session.shop!==COD_REVIEW_SHOP)return Response.json({checkoutAvailable:false},{status:404,headers});
 const settings=await loadCodThemeReview(session.shop);
 const [publishedTheme,discountCodesAvailable]=await Promise.all([
  settings.enabled?readCodPublishedTheme():Promise.resolve(null),
  settings.enabled?unauthenticated.admin(session.shop).then(({admin})=>hasNativeCodDiscountAccess(admin,session.shop)).catch(()=>false):Promise.resolve(false),
 ]);
 const availability=nativeCodAvailability(settings,COD_REVIEW_THEME,publishedTheme);
 return Response.json({...settings,...availability,themeId:COD_REVIEW_THEME,collectAddressAtCheckout:true,discountCodesAvailable},{headers});
};
export const action=async({request}:ActionFunctionArgs)=>{
 const {session}=await authenticate.public.appProxy(request);
 if(!session||session.shop!==COD_REVIEW_SHOP)return Response.json({error:"Unavailable"},{status:404,headers});
 if(request.method!=="POST"||request.headers.get("content-type")?.split(';')[0].trim()!=="application/json")return Response.json({error:"Invalid request"},{status:415,headers});
 let quoteNotCreated=false;
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
  const eligibleMode=async(current:typeof settings,verifyFresh=false)=>{
   if(!current.enabled||input.themeId!==COD_REVIEW_THEME)return null;
   const allowed=nativeCodAvailability(current,COD_REVIEW_THEME,await readCodPublishedTheme(verifyFresh));
   if(input.mode==="customer"&&allowed.checkoutAvailable)return "customer";
   if(input.mode==="preview"&&allowed.previewCheckoutAvailable)return "preview";
   return null;
  };
  if(input.intent==="preview_discount"){
   if(!await eligibleMode(settings))return Response.json({error:"Unavailable"},{status:503,headers});
   try{
    const code=await authorizeNativeCodDiscount(admin,input.discountCode);
    const frozen=await calculateCodQuote(admin,{lines:input.lines},settings.advancePercent,settings.codFeePaise,true,code);
    if(!frozen.accountingSnapshot.taxesIncluded)throw new Error();
    return Response.json({discount:frozen.discount,advancePercent:settings.advancePercent,amounts:frozen.amounts},{headers});
   }catch{return Response.json({error:"This discount cannot be applied to Advance COD. Try it in full payment checkout."},{status:400,headers});}
  }
  if(input.intent!=="create_quote")throw new Error();
  if(typeof input.requestKey!=="string"||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.requestKey))throw new Error();
  const id=input.requestKey;
  const existing=await db.query(`SELECT "id" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2`,[id,session.shop]);
  if(existing.length){
   const row=await readNativeCheckout(db,session.shop,id),link=await nativeCheckoutLink(db,admin,session.shop,id);
   if(link.paid)return Response.json({checkoutAvailable:false,state:"check_existing_payment",access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||"")},{headers});
   return Response.json({checkoutAvailable:true,checkoutUrl:link.url,access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||""),advancePercent:row.quote.advancePercent,discount:row.quote.discount,amounts:nativeCodQuoteReference(row.quote).amounts},{headers});
  }
  const mode=await eligibleMode(settings);
  if(!mode)return Response.json({error:"Advance COD unavailable. Use full prepaid checkout.",quoteNotCreated:true},{status:503,headers});
  quoteNotCreated=true;
  const recent=await db.query<{count:bigint}>(`SELECT COUNT(*) AS "count" FROM "NativeCodCheckout" WHERE "shop"=$1 AND "createdAt">CURRENT_TIMESTAMP-INTERVAL '1 minute'`,[session.shop]);
  if(Number(recent[0]?.count??60)>=60)return Response.json({error:"Try again shortly",quoteNotCreated:true},{status:429,headers});
  const collectAddressAtCheckout=input.collectAddressAtCheckout===true;
  const code=input.discountCode===undefined?undefined:await authorizeNativeCodDiscount(admin,input.discountCode);
  const frozen=await calculateCodQuote(admin,{...input,discountCodes:[]},settings.advancePercent,settings.codFeePaise,collectAddressAtCheckout,code);
  if(code && (input.expectedGoodsPaise!==frozen.amounts.orderPaise || input.expectedAdvancePercent!==settings.advancePercent ||
      input.expectedFeePaise!==settings.codFeePaise || input.expectedDiscountPaise!==frozen.discount?.discountPaise))
   return Response.json({error:"Discount or amounts changed. Apply the code again.",quoteNotCreated:true,discountChanged:true},{status:409,headers});
  const plan=await prepareNativeCodPlan(admin,{id,shop:session.shop,appClientId:"3879fe641910f37451baf743e76059ee",accounting:frozen.accountingSnapshot,address:frozen.shippingAddress,collectAddressAtCheckout,discount:frozen.discount,percent:settings.advancePercent,feePaise:settings.codFeePaise});
  if(mode==="preview"){
   const tags=plan.input.tags;if(!Array.isArray(tags)||tags.some(t=>typeof t!=="string"))throw new Error();
   plan.input.tags=[...tags,"CARTWALA PREVIEW - DO NOT SHIP"];
  }
  // Hook setup must already be idempotent and confirmed before exposing a payable invoice.
  await ensureNativeCodHooks(admin);
  const fresh=await loadCodThemeReview(session.shop);
  if(fresh.revision!==settings.revision||await eligibleMode(fresh,true)!==mode)
   return Response.json({error:"Checkout settings changed. Return to the cart and try again.",quoteNotCreated:true},{status:409,headers});
  quoteNotCreated=false;
  const link=await createNativeCheckout(db,admin,plan);if(link.paid)throw new Error();
  return Response.json({checkoutAvailable:true,checkoutUrl:link.url,access:issueCodAccess(session.shop,id,process.env.SHOPIFY_API_SECRET||""),advancePercent:settings.advancePercent,discount:frozen.discount,amounts:frozen.amounts},{headers});
 }catch{return Response.json({quoteNotCreated,error:"Checkout could not be confirmed. Check the existing payment before paying again; use full prepaid for unsupported carts."},{status:400,headers});}
};
