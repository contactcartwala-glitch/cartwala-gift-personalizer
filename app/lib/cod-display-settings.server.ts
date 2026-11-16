import {COD_REVIEW_SHOP, loadCodThemeReview, type CodThemeReview} from './cod-theme-review.server';
type Admin = {graphql(query:string, options?:{variables:Record<string,unknown>}):Promise<Response>};
// Shared, typed Shop data: the Cartwala app writes it; Liquid only displays it.
// It never authorizes a payment. The quote route still validates live DB settings.
export async function syncCodDisplaySettings(admin:Admin, shop:string, settings:CodThemeReview, discountCodesAvailable:boolean) {
 if(shop!==COD_REVIEW_SHOP)throw new Error('Not found');
 const read=await admin.graphql(`{shop{id metafield(namespace:"cartwala_cod",key:"public_settings"){value compareDigest}}}`);
 const result=await read.json();if(result.errors||!result.data?.shop)throw new Error('Storefront settings could not be read.');
 const owner=result.data.shop, field=owner.metafield;
 const value=JSON.stringify({schemaVersion:1,shop,...settings,discountCodesAvailable});
 if(field?.value===value)return;
 if(field){const previous=JSON.parse(field.value);if(previous.revision>settings.revision)return;}
 const fresh=await loadCodThemeReview(shop);
 if(fresh.revision!==settings.revision)throw new Error('Settings changed. Reload to sync the latest values.');
 const response=await admin.graphql(`mutation CodDisplay($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{message}}}`,{variables:{metafields:[{ownerId:owner.id,namespace:'cartwala_cod',key:'public_settings',type:'json',value,compareDigest:field?.compareDigest??null}]}});
 const body=await response.json();
 if(body.errors||!body.data?.metafieldsSet||body.data.metafieldsSet.userErrors.length)throw new Error('Storefront settings sync pending. Reload Advance COD settings to retry.');
}
