import type {ActionFunctionArgs} from "react-router";
import prisma from "../db.server";
import {authenticate,unauthenticated} from "../shopify.server";
import {reconcileNativeCheckout} from "../lib/native-cod-checkout.server";
const db={query:<T,>(sql:string,params:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...params)};
export const action=async({request}:ActionFunctionArgs)=>{
 const {shop,topic,payload}=await authenticate.webhook(request);
 if(!["ORDERS_PAID","ORDERS_CANCELLED","REFUNDS_CREATE"].includes(topic))return new Response(null,{status:400});
 const event=payload as {admin_graphql_api_id?:string;order_id?:number|string};
 const orderId=topic==="REFUNDS_CREATE"?`gid://shopify/Order/${event.order_id}`:event.admin_graphql_api_id;
 if(!orderId||!/^gid:\/\/shopify\/Order\/[1-9]\d*$/.test(orderId))return new Response(null,{status:400});
 // Resolve event identity through the app's durable draft link; no amounts or paid flags from the payload are trusted.
 const rows=await db.query<{id:string}>(`SELECT "id" FROM "NativeCodCheckout" WHERE "shop"=$1 AND "orderId"=$2`,[shop,orderId]);
 let id=rows[0]?.id;
 if(!id&&topic==="ORDERS_PAID"){
  const attributes=(payload as {note_attributes?:Array<{name:string;value:string}>}).note_attributes??[];
  if(!attributes.some(p=>p.name==="_cartwala_order_kind"&&p.value==="native_cod_advance"))return new Response();
  const values=attributes.filter(p=>p.name==="_cartwala_cod_intent");
  if(values.length!==1||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(values[0].value))return new Response(null,{status:400});
  const saved=await db.query<{id:string}>(`SELECT "id" FROM "NativeCodCheckout" WHERE "id"=$1 AND "shop"=$2`,[values[0].value,shop]);id=saved[0]?.id;
 }
 if(!id)return new Response();
 try{const {admin}=await unauthenticated.admin(shop);const result=await reconcileNativeCheckout(db,admin,shop,id,orderId);
  return new Response(null,{status:topic==="ORDERS_PAID"&&result.state!=="completed"?503:200});
 }catch{return new Response(null,{status:503});}
};
