import {requestContext} from './request-context';
import {SHOP} from './shopify';
import {loader,action} from '../../../app/routes/signature-day.native-cod';
import {PILOT_ID} from './merchant-pilot';
import {forwardLegacyProxy} from './legacy-proxy';
export const ROUTE_PILOT_ID='d1f11f48-cbbb-4e91-9f1e-aa87feaecc51';
/** Calls the unmodified production route with a fixed uncharged verification cart. */
export async function prepareNativeRoutePilot(request:Request){
 const context=requestContext();context.env={...context.env,CHECKOUT_ENABLED:'true'};
 const config=await (await loader({request:new Request(request.url),params:{},context:{}})).json();
 if(config.checkoutAvailable!==true)throw Error('Customer mode is not ready');
 const rows=await context.database.query<{quote:{lines:Array<{variantId:string}>}}>('SELECT "quote" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2',[PILOT_ID,SHOP]);
 const variantId=rows[0]?.quote.lines[0]?.variantId;if(!variantId)throw Error('Verification product unavailable');
 const body={intent:'create_quote',requestKey:ROUTE_PILOT_ID,mode:'customer',themeId:config.themeId,collectAddressAtCheckout:true,discountCodes:[],
  lines:[{variantId,quantity:1,properties:[{name:'_Cartwala_Verification',value:'DO NOT PAY OR SHIP - CHECKOUT VERIFICATION'}]}]};
 const makeRequest=()=>new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const first=await action({request:makeRequest(),params:{},context:{}}),one=await first.json();
 if(first.status!==200||one.checkoutAvailable!==true)return Response.json({verified:false,status:first.status,error:one.error},{status:503});
 const second=await action({request:makeRequest(),params:{},context:{}}),two=await second.json();
 const same=second.status===200&&two.checkoutAvailable===true&&one.checkoutUrl===two.checkoutUrl&&JSON.stringify(one.amounts)===JSON.stringify(two.amounts);
 return Response.json({verified:same,sameCheckout:same,checkoutUrl:same?one.checkoutUrl:undefined,amounts:one.amounts,payments:0,shipments:0,
  note:'A single uncharged verification draft only. Do not pay or ship it.'},{status:same?200:503,headers:{'Cache-Control':'no-store'}});
}
export async function verifyLegacyRoutes(request:Request){
 const context=requestContext();context.env={...context.env,LEGACY_PROXY_ENABLED:'true'};
 const base=new URL(request.url);base.pathname='/signature-day/reviews';
 const reviews=await forwardLegacyProxy(new Request(base));
 base.pathname='/signature-day';
 const invalid=await forwardLegacyProxy(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
 const body=await invalid.json().catch(()=>null) as {error?:string}|null;
 return {reviewsHttpStatus:reviews.status,invalidPostHttpStatus:invalid.status,invalidPayloadRejected:invalid.status===400&&body?.error==='Incomplete preview or print files',uploads:0,payments:0};
}
