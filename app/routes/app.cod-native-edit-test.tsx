import { Form, useActionData, useLoaderData, useNavigation, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { EDIT_TEST_SHOP, readNativeEditTest, runNativeEditTest } from "../lib/native-cod-edit-test.server";
const db = { query: <T,>(sql:string,params:unknown[])=>prisma.$queryRawUnsafe<T[]>(sql,...params) };
export const loader = async ({request}:LoaderFunctionArgs)=>{
  const {session}=await authenticate.admin(request);
  if(session.shop!==EDIT_TEST_SHOP)throw new Response("Not found",{status:404});
  return {rows:await readNativeEditTest(db,session.shop)};
};
export const action = async ({request}:ActionFunctionArgs)=>{
  const {session}=await authenticate.admin(request);
  if(session.shop!==EDIT_TEST_SHOP)throw new Response("Not found",{status:404});
  if(request.method!=="POST")throw new Response("Method not allowed",{status:405});
  const intent=(await request.formData()).get("intent");
  if(intent!=="create"&&intent!=="edit"&&intent!=="check")return {ok:false,message:"Invalid action"};
  try{const {admin}=await unauthenticated.admin(session.shop); const result=await runNativeEditTest(db,admin,session.shop,intent);
    return {ok:true,message:`TEST ${result.phase}: total ₹${result.totalPaise/100}, simulated received ₹130, remaining ₹${result.outstandingPaise/100}. No real payment.`};
  }catch{return {ok:false,message:"TEST not confirmed. Check existing attempt; never create a replacement or repeat an uncertain edit."};}
};
export default function NativeEditTest(){
  const data=useLoaderData<typeof loader>(),result=useActionData<typeof action>(),busy=useNavigation().state!=="idle";
  return <s-page heading="Native Advance COD — same-order edit TEST"><s-section heading="Operator test, no real payment">
    <p>One simulated TEST receipt: initial ₹130 PAID → same order ₹450 total, ₹130 received, ₹320 PARTIALLY_PAID.</p>
    <p>No customer/address, stock, receipt or shipment. This does not prove a real native gateway payment. Customer Advance COD stays disabled.</p>
    <p>Create first, inspect its automatic NimbusPost import, then apply the balance once and inspect that same courier record.</p>
    {data.rows.map(row=><p key={row.id}>{row.id}: {row.state} — {JSON.stringify(row.observed)} {row.orderId&&<a href={`shopify:admin/orders/${row.orderId.split('/').pop()}`}>View TEST order</a>}</p>)}
    {result&&<p role={result.ok?'status':'alert'}>{result.message}</p>}
    <Form method="post"><button name="intent" value="create" disabled={busy||data.rows.length>0}>Create initial ₹130 TEST</button>{' '}
      <button name="intent" value="edit" disabled={busy||!data.rows.some(r=>r.orderId)||data.rows.length>1}>Add ₹320 balance once</button>{' '}
      <button name="intent" value="check" disabled={busy}>Check existing TEST</button></Form>
  </s-section></s-page>;
}
