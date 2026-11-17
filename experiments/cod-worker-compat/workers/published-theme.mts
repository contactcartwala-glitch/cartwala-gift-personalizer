import {requestContext} from './request-context';
export function parsePublishedTheme(head: string): string | null {
  const entries = Array.from(head.matchAll(/\bShopify\.theme\s*=\s*(\{[^\r\n]*?\})\s*;/g));
  if (entries.length !== 1) return null;
  try {
    const theme = JSON.parse(entries[0][1]);
    return theme.role === 'main' && Number.isSafeInteger(theme.id) && theme.id > 0 ? String(theme.id) : null;
  } catch {return null;}
}
async function inspectPublishedTheme(): Promise<string | null> {
  try {
    const response = await fetch('https://cartwala.in/cart', {cache:'no-store',redirect:'manual',
      signal:AbortSignal.timeout(4500),headers:{Accept:'text/html'}});
    if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html') || !response.body) return null;
    const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, html = '';
    try {
      while (bytes < 384000) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength; if (bytes > 384000) return null;
        html += decoder.decode(chunk.value,{stream:true});
        const end = html.indexOf('</head>'); if (end !== -1) return parsePublishedTheme(html.slice(0,end));
      }
    } finally {await reader.cancel().catch(() => {});}
  } catch {}
  return null;
}
/** No promises or socket-backed responses cross Worker request boundaries. */
export function readCodPublishedTheme(force = false): Promise<string | null> {
  const context = requestContext();
  if (force || !context.publishedTheme) context.publishedTheme = inspectPublishedTheme();
  return context.publishedTheme;
}
