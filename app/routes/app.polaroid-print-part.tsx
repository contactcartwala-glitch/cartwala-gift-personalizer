import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { CARTWALA_SHOP, isCartwalaPhotoPrint, polaroidZipUrls } from "../lib/polaroid-print-layout";

const MAX_BYTES = 12 * 1024 * 1024;
const unavailable = (status: number) => new Response("Print file unavailable", {
  status, headers: { "Cache-Control": "no-store" },
});

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  if (session.shop !== CARTWALA_SHOP) return unavailable(404);
  const params = new URL(request.url).searchParams;
  const orderId = params.get("order") || "";
  const lineId = params.get("line") || "";
  const part = params.get("part") || "";
  if (!/^gid:\/\/shopify\/Order\/\d{1,24}$/.test(orderId) ||
      !/^gid:\/\/shopify\/LineItem\/\d{1,24}$/.test(lineId) ||
      !/^[1-9]\d?$/.test(part)) return unavailable(400);
  try {
    // Resolve the asset from the authenticated shop's own order record, not a URL supplied by the client.
    const response = await admin.graphql(
      `#graphql
        query CartwalaPhotoPrintPart($order: ID!) {
          order(id: $order) {
            lineItems(first: 100) { nodes { id product { id } customAttributes { key value } } }
          }
        }`,
      { variables: { order: orderId } },
    );
    if (!response.ok) return unavailable(502);
    const payload = await response.json() as {
      errors?: unknown[];
      data?: { order?: { lineItems?: { nodes?: Array<{
        id: string; product?: { id: string };
        customAttributes: Array<{ key: string; value: string }>;
      }> } } };
    };
    if (payload.errors?.length) return unavailable(502);
    const line = payload.data?.order?.lineItems?.nodes?.find(
      (candidate: { id: string }) => candidate.id === lineId,
    );
    if (!line || !Array.isArray(line.customAttributes)) return unavailable(404);
    const attrs = Object.fromEntries(line.customAttributes.map(
      ({ key, value }: { key: string; value: string }) => [key, value],
    ));
    if (!isCartwalaPhotoPrint(attrs, line.product?.id)) return unavailable(404);
    const archive = polaroidZipUrls(attrs).find(({ index }) => index === Number(part));
    if (!archive) return unavailable(404);
    const upstream = await fetch(archive.url, {
      redirect: "error", signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) return unavailable(502);
    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) {
      await upstream.body.cancel();
      return unavailable(413);
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return unavailable(413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) {
      return unavailable(502);
    }
    return new Response(bytes, { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return unavailable(502);
  }
}
