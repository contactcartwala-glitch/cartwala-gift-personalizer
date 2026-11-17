import {requestContext} from './request-context';
import {authenticate,unauthenticated,SHOP} from './shopify';
import {readNativeCodOrder,verifyNativeCodPayment,nativeCodGraphql,nativeCodQuoteReference,type NativeCodContext} from '../../../app/lib/native-cod-payment.server';
/** Re-read an already-paid COD receipt; never invoke reconciliation or mutate an order. */
export async function verifyExistingReceipt(request:Request){
 const context=requestContext();await authenticate.public.appProxy(request);
 await context.database.query('BEGIN READ ONLY',[]);
 try{
  const sessions=await context.database.query<{nonExpiring:boolean}>(`SELECT "expires" IS NULL AS "nonExpiring" FROM "Session" WHERE "id"=$1 AND "shop"=$2 AND "isOnline"=false`,[`offline_${SHOP}`,SHOP]);
  const selected=new URL(request.url).searchParams.get('id');
  if(selected&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(selected))throw Error('Invalid receipt reference');
  const rows=await context.database.query<{quote:NativeCodContext;draftId:string;orderId:string|null}>(`SELECT "quote","draftId","orderId" FROM "NativeCodCheckout" WHERE "shop"=$1 AND "quote"->>'test'='false' AND "draftId" IS NOT NULL AND ($2::text IS NULL OR "id"=$2) ORDER BY "createdAt" DESC LIMIT 5`,[SHOP,selected]);
  const {admin}=await unauthenticated.admin(SHOP);
  for(const row of rows){
   try{const draft=(await nativeCodGraphql(admin,'query PilotPaidDraft($id:ID!){draftOrder(id:$id){id order{id}}}',{id:row.draftId})).draftOrder;
    if(draft?.id!==row.draftId||!draft.order?.id)continue;
    const frozen={...row.quote,shop:SHOP,draftId:row.draftId,orderId:draft.order.id};
    const order=await readNativeCodOrder(admin,frozen),phase=order.displayFinancialStatus==='PARTIALLY_PAID'?'completed':'advance';
    const verified=verifyNativeCodPayment(frozen,order,phase);
    return {readOnly:true,receiptVerified:true,receiptPhase:phase,paidPaise:verified.paidPaise,plannedRemainingCodPaise:nativeCodQuoteReference(frozen).amounts.collectOnDeliveryPaise,sessionNonExpiring:sessions[0]?.nonExpiring===true,payments:0,shopifyWrites:0};
   }catch{/* Cancelled or subsequently modified old pilot orders must not be changed. */}
  }
  return {readOnly:true,receiptVerified:false,completedCandidates:rows.length,sessionNonExpiring:sessions[0]?.nonExpiring===true,payments:0,shopifyWrites:0};
 }finally{await context.database.query('ROLLBACK',[]);}
}
