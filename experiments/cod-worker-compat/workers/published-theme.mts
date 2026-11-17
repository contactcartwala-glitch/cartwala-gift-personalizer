import {requestContext} from './request-context';
import {unauthenticated,SHOP} from './shopify';
import {nativeCodGraphql} from '../../../app/lib/native-cod-payment.server';
export const PUBLISHED_THEME_QUERY='query CartwalaPublishedTheme { themes(first:2,roles:[MAIN]) { nodes { id role } pageInfo { hasNextPage } } }';
export function parsePublishedTheme(head: string): string | null {
  const entries = Array.from(head.matchAll(/\bShopify\.theme\s*=\s*(\{[^\r\n]*?\})\s*;/g));
  if (entries.length !== 1) return null;
  try {
    const theme = JSON.parse(entries[0][1]);
    return theme.role === 'main' && Number.isSafeInteger(theme.id) && theme.id > 0 ? String(theme.id) : null;
  } catch {return null;}
}
async function inspectPublishedTheme(): Promise<string | null> {
  try{
    const {admin}=await unauthenticated.admin(SHOP);
    const connection=(await nativeCodGraphql(admin,PUBLISHED_THEME_QUERY,{})).themes;
    if(connection?.pageInfo?.hasNextPage!==false||!Array.isArray(connection.nodes)||connection.nodes.length!==1)return null;
    const theme=connection.nodes[0],id=typeof theme.id==='string'?theme.id.match(/^gid:\/\/shopify\/OnlineStoreTheme\/([1-9]\d*)$/)?.[1]:undefined;
    return theme.role==='MAIN'&&id&&Number.isSafeInteger(Number(id))?id:null;
  }catch{return null;}
}
export async function probeCodThemeApi(){
  const {admin}=await unauthenticated.admin(SHOP);
  const installation=(await nativeCodGraphql(admin,'query CartwalaThemeScope { currentAppInstallation { accessScopes { handle } } }',{})).currentAppInstallation;
  const ready=Array.isArray(installation?.accessScopes)&&installation.accessScopes.some((scope:{handle:string})=>scope.handle==='read_themes');
  return {readOnly:true,permissionReady:ready,missingScopes:ready?[]:['read_themes'],publishedThemeId:ready?await inspectPublishedTheme():null,payments:0,shopifyWrites:0};
}
/** Bounded public-storefront diagnostics; never returns HTML or visitor data. */
export async function probeCodPublishedTheme(path:'/'|'/cart') {
  const started=Date.now();let bytes=0,status=0;
  try {
    const response = await fetch('https://cartwala.in'+path, {cache:'no-store',redirect:'manual',
      signal:AbortSignal.timeout(4500),headers:{Accept:'text/html'}});
    status=response.status;
    if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html') || !response.body) return {themeId:null,status,bytes,elapsed:Date.now()-started,reason:'response'};
    const reader = response.body.getReader(), decoder = new TextDecoder(); let html = '';
    try {
      while (bytes < 384000) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength; if (bytes > 384000) return {themeId:null,status,bytes,elapsed:Date.now()-started,reason:'size'};
        html += decoder.decode(chunk.value,{stream:true});
        const end = html.indexOf('</head>'); if (end !== -1) {const themeId=parsePublishedTheme(html.slice(0,end));return {themeId,status,bytes,elapsed:Date.now()-started,reason:themeId?'verified':'parse'};}
      }
    } finally {await reader.cancel().catch(() => {});}
  } catch {return {themeId:null,status,bytes,elapsed:Date.now()-started,reason:'fetch_or_timeout'};}
  return {themeId:null,status,bytes,elapsed:Date.now()-started,reason:'head_missing'};
}
/** No promises or socket-backed responses cross Worker request boundaries. */
export function readCodPublishedTheme(force = false): Promise<string | null> {
  const context = requestContext();
  if (force || !context.publishedTheme) context.publishedTheme = inspectPublishedTheme();
  return context.publishedTheme;
}
