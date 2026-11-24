import type { ActionFunctionArgs } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { validateDesign } from '../lib/signature-day.server';
import { confirmSignatureCheckout, type SignatureCheckoutVariant } from '../lib/signature-checkout-confirm.server';

// Separate read-only endpoint: an older writer must never mistake confirmation for save.
export const action = async ({request}:ActionFunctionArgs) => {
  const {admin,session}=await authenticate.public.appProxy(request);
  if(!admin||!session)return Response.json({code:'UNAUTHORIZED'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({code:'INVALID_REQUEST'},{status:415});
  try {
    const input=await request.json(),data=validateDesign(input);
    return await confirmSignatureCheckout(session.shop,input,data,{
      find:(shop,id)=>prisma.signatureDayDesign.findMany({where:{shop,id}}),
      variants:async ids=>{
        const response=await admin.graphql(`#graphql
          query SignatureCheckoutVariants($ids: [ID!]!) {
            nodes(ids: $ids) { ... on ProductVariant { id product { handle } selectedOptions { value } price } }
          }`,{variables:{ids}});
        const result=await response.json() as {errors?:unknown[];data?:{nodes:(SignatureCheckoutVariant|null)[]}};
        if(result.errors?.length||!Array.isArray(result.data?.nodes))throw Error('Variant lookup unavailable');
        return result.data.nodes;
      },
      head:url=>fetch(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(8000)}),
    });
  }catch{return Response.json({code:'INVALID_DESIGN'},{status:400,headers:{'Cache-Control':'no-store'}});}
};
