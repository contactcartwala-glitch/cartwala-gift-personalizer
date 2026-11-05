import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { originalArchiveIds } from "../lib/photo-originals";
import { mergeOriginalArchives } from "../lib/photo-original-zip.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const query = new URL(request.url).searchParams;
  const orderId = query.get("orderId"),
    lineId = query.get("lineItemId");
  try {
    const response = await admin.graphql(
      `#graphql
      query CartwalaOriginalOrder($id: ID!) { order(id: $id) { name lineItems(first:100) { nodes { id customAttributes { key value } } } } }`,
      { variables: { id: orderId } },
    );
    const json = await response.json() as { errors?: unknown[]; data?: { order?: { name: string;
      lineItems: { nodes: Array<{ id: string; customAttributes: Array<{ key: string; value: string }> }> } } } };
    if (json.errors?.length) throw new Error("Order access failed.");
    const line = json.data?.order?.lineItems?.nodes?.find(
      (item: { id: string }) => item.id === lineId,
    );
    const ids = originalArchiveIds(line?.customAttributes || []);
    if (!ids.length)
      throw new Error("Original photos were not saved for this order.");
    const rows = await prisma.photoOriginalArchive.findMany({
      where: { shop: session.shop, id: { in: ids } },
    });
    if (
      rows.length !== ids.length ||
      rows.some((row) => row.deletedAt || !row.url)
    )
      throw new Error(
        "Original photos are unavailable or their retention period has ended.",
      );
    const archives: Uint8Array[] = [];
    for (const id of ids) {
      const url = rows.find((row) => row.id === id)!.url!;
      if (new URL(url).hostname !== "cdn.shopify.com")
        throw new Error("Invalid original file host.");
      const upstream = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      if (!upstream.ok)
        throw new Error("Could not load original photos. Please retry.");
      if (Number(upstream.headers.get("content-length")) > 20 * 1024 * 1024)
        throw new Error("Original file is too large.");
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024)
        throw new Error("Original file is too large.");
      archives.push(bytes);
    }
    const result = mergeOriginalArchives(archives);
    const name = String(json.data?.order?.name || orderId).replace(/[^a-z0-9_-]/gi, "");
    return new Response(new Uint8Array(result), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Cartwala-${name}-Original-Photos.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not download originals",
      },
      { status: 400 },
    );
  }
};
