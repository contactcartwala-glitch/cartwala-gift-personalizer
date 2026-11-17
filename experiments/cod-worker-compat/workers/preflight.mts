import {authenticate, unauthenticated, SHOP, APP_KEY} from './shopify';
import {requestContext} from './request-context';
import {nativeCodPermissions, type NativeCodContext} from '../../../app/lib/native-cod-payment.server';
/** Authenticated, read-only check. Never returns session tokens, URLs, order IDs, or customer data. */
export async function readOnlyPreflight(request: Request): Promise<Response> {
  const context = requestContext();
  await authenticate.public.appProxy(request);
  await context.database.query('BEGIN READ ONLY', []);
  try {
    const settings = await context.database.query<{revision:number}>(
      'SELECT "revision" FROM "CodThemeReviewSettings" WHERE "shop"=$1', [SHOP]);
    if (settings.length !== 1) throw new Error('Existing COD settings required');
    // Table access is verified without exposing any existing checkout information.
    await context.database.query('SELECT "id" FROM "NativeCodCheckout" WHERE "shop"=$1 LIMIT 0', [SHOP]);
    const {admin} = await unauthenticated.admin(SHOP);
    const missingScopes = await nativeCodPermissions(admin, {shop:SHOP,appClientId:APP_KEY} as NativeCodContext);
    return Response.json({readOnly:true, databaseReady:true, sessionReady:true,
      appIdentityVerified:true, permissionsReady:missingScopes.length===0, missingScopes,
      checkoutEnabled:false}, {headers:{'Cache-Control':'no-store'}});
  } finally {await context.database.query('ROLLBACK', []);}
}
