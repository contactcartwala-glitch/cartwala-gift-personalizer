import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { deleteShopifyFiles } from "./shopify-files.server";
import { originalArchiveIds, originalsDeleteAfter } from "./photo-originals";

type SavedOrder = {
  id: string;
  displayFulfillmentStatus: string;
  closedAt: string | null;
  cancelledAt: string | null;
  fulfillments: Array<{ createdAt: string; status: string }>;
  lineItems: {
    nodes: Array<{ customAttributes: Array<{ key: string; value: string }> }>;
    pageInfo: { hasNextPage: boolean };
  };
};
type OriginalOrdersPayload = { errors?: Array<{ message: string }>; data?: {
  orders?: { nodes: SavedOrder[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  order?: SavedOrder;
} };
const completedAt = (order: SavedOrder) => {
  if (order.cancelledAt) return new Date(order.cancelledAt);
  if (order.displayFulfillmentStatus !== "FULFILLED") return null;
  const dates = order.fulfillments
    .filter((f) => f.status === "SUCCESS")
    .map((f) => Date.parse(f.createdAt));
  if (order.closedAt) dates.push(Date.parse(order.closedAt));
  const latest = dates.filter(Number.isFinite);
  return latest.length ? new Date(Math.max(...latest)) : null;
};
const fields = `id displayFulfillmentStatus closedAt cancelledAt fulfillments { createdAt status }
  lineItems(first:100) { nodes { customAttributes { key value } } pageInfo { hasNextPage } }`;
export async function cleanupPhotoOriginals(dryRun = false, now = new Date()) {
  const shops = await prisma.photoOriginalArchive.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });
  const result = { shops: shops.length, eligible: 0, deleted: 0, failed: 0 };
  for (const { shop } of shops) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const archives = await prisma.photoOriginalArchive.findMany({
        where: { shop, deletedAt: null },
        include: { orders: true },
      });
      const byId = new Map(archives.map((archive) => [archive.id, archive]));
      const orders: SavedOrder[] = [];
      let after: string | null = null;
      do {
        const response: Response = await admin.graphql(
          `#graphql
          query CartwalaOriginalRetentionOrders($after: String, $query: String!) {
            orders(first:50,after:$after,query:$query,sortKey:CREATED_AT,reverse:true) {
              nodes { ${fields} } pageInfo { hasNextPage endCursor }
            }
          }`,
          {
            variables: {
              after,
              query: `created_at:>=${new Date(now.getTime() - 60 * 86400000).toISOString()}`,
            },
          },
        );
        const json: OriginalOrdersPayload = await response.json();
        if (json.errors?.length || !json.data?.orders)
          throw new Error("Original retention order lookup failed.");
        orders.push(...json.data.orders.nodes);
        if (orders.length > 5000)
          throw new Error("Order scan exceeded its safe limit.");
        after = json.data.orders.pageInfo.hasNextPage
          ? json.data.orders.pageInfo.endCursor
          : null;
      } while (after);
      const seenOrders = new Set(orders.map((order) => order.id));
      const linkedIds = [
        ...new Set(
          archives.flatMap((archive) =>
            archive.orders.map((order) => order.orderId),
          ),
        ),
      ];
      for (const id of linkedIds.filter((id) => !seenOrders.has(id))) {
        const response: Response = await admin.graphql(
          `#graphql query CartwalaOriginalRetentionOrder($id: ID!) { order(id:$id) { ${fields} } }`,
          { variables: { id } },
        );
        const json: OriginalOrdersPayload = await response.json();
        if (json.errors?.length || !json.data?.order)
          throw new Error(
            "A linked order could not be checked. No originals will be deleted for this shop.",
          );
        orders.push(json.data.order);
      }
      for (const order of orders) {
        if (order.lineItems.pageInfo.hasNextPage)
          throw new Error("Order items are incomplete; originals retained.");
        const ids = [
          ...new Set(
            order.lineItems.nodes.flatMap((line) =>
              originalArchiveIds(line.customAttributes),
            ),
          ),
        ];
        for (const archiveId of ids)
          if (byId.has(archiveId)) {
            const date = completedAt(order);
            await prisma.photoOriginalArchiveOrder.upsert({
              where: { archiveId_orderId: { archiveId, orderId: order.id } },
              create: { archiveId, orderId: order.id, completedAt: date },
              update: { completedAt: date },
            });
          }
      }
      const refreshed = await prisma.photoOriginalArchive.findMany({
        where: { shop },
        include: { orders: true },
      });
      for (const archive of refreshed) {
        const deadline = originalsDeleteAfter(archive);
        const retryDelete = Boolean(archive.deletedAt && archive.fileId);
        if (!retryDelete && (archive.deletedAt || !deadline || deadline > now))
          continue;
        result.eligible++;
        if (dryRun) continue;
        if (!retryDelete) {
          const claimed = await prisma.photoOriginalArchive.updateMany({
            where: {
              id: archive.id,
              shop,
              deletedAt: null,
              lastUsedAt: archive.lastUsedAt,
            },
            data: {
              deletedAt: now,
              url: null,
              hash: `${archive.hash}:deleted:${archive.id}`,
            },
          });
          if (!claimed.count) continue;
        }
        if (archive.fileId) {
          const deleted = await deleteShopifyFiles(admin, [archive.fileId]);
          if (!deleted.includes(archive.fileId))
            throw new Error("Original file deletion did not complete.");
        }
        await prisma.photoOriginalArchive.update({
          where: { id: archive.id },
          data: { fileId: null },
        });
        result.deleted++;
      }
    } catch (error) {
      result.failed++;
      console.error(
        "Original photo retention failed for shop",
        shop,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
  return result;
}
