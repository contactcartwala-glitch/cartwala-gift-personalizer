import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { verifyDepositSnapshot, type DepositSnapshot } from "./partial-cod-payment";

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
const VERIFY_DEPOSIT = `query VerifyCodDeposit($id: ID!, $draftId: ID!) {
 draftOrder(id: $draftId) { order { id } }
 order(id: $id) {
 id cancelledAt displayFinancialStatus test
 customAttributes { key value }
 totalPriceSet { shopMoney { amount currencyCode } }
 totalReceivedSet { shopMoney { amount currencyCode } }
 totalRefundedSet { shopMoney { amount currencyCode } }
 transactions { id kind status test amountSet { shopMoney { amount currencyCode } } }
 }
}`;

export async function recordPaidDeposit(admin: Admin, shop: string, intentId: string, orderId: string) {
  const intent = await prisma.partialCodIntent.findFirst({ where: { id: intentId, shop } });
  if (!intent?.depositDraftId) throw new Error("Unknown deposit intent");
  const response = await admin.graphql(VERIFY_DEPOSIT, { variables: { id: orderId, draftId: intent.depositDraftId } });
  const json = await response.json() as {
    errors?: unknown[];
    data?: { order: DepositSnapshot | null; draftOrder: { order: { id: string } | null } | null };
  };
  if (!response.ok || json.errors?.length || !json.data?.order) throw new Error("Could not verify payment with Shopify");
  const proof = verifyDepositSnapshot({
    intentId, orderPaise: intent.orderPaise,
    linkedDraftOrderId: json.data.draftOrder?.order?.id ?? null,
  }, json.data.order);
  const fingerprint = `${shop}:${proof.fingerprint}`;
  await prisma.$transaction(async tx => {
    const changed = await tx.partialCodIntent.updateMany({
      where: { id: intentId, shop, state: "awaiting_payment", depositOrderId: null },
      data: { state: "paid", depositOrderId: proof.orderId, paymentFingerprint: fingerprint },
    });
    if (changed.count !== 1) {
      const existing = await tx.partialCodIntent.findUnique({ where: { id: intentId } });
      if (!existing || !["paid", "cod_order_created"].includes(existing.state) ||
          existing.depositOrderId !== proof.orderId || existing.paymentFingerprint !== fingerprint) {
        throw new Error("Deposit is closed or conflicts with recorded payment");
      }
    }
    await tx.partialCodOutbox.upsert({ where: { intentId }, create: { intentId }, update: {} });
  });
}

export async function claimCodOrderJob(intentId: string) {
  const claimToken = crypto.randomUUID();
  const result = await prisma.partialCodOutbox.updateMany({
    where: { intentId, state: "ready", intent: { state: "paid" } },
    data: { state: "processing", claimToken },
  });
  return result.count === 1 ? claimToken : null;
}

export async function markCodJobUncertain(intentId: string, claimToken: string) {
  await prisma.partialCodOutbox.updateMany({
    where: { intentId, claimToken, state: "processing" }, data: { state: "uncertain" },
  });
}

export async function finishCodOrderJob(intentId: string, claimToken: string, orderId: string) {
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(orderId)) throw new Error("Invalid COD order ID");
  await prisma.$transaction(async tx => {
    const changed = await tx.partialCodOutbox.updateMany({
      where: { intentId, claimToken, state: "processing", intent: { state: "paid" } },
      data: { state: "completed", result: { orderId } },
    });
    if (changed.count !== 1) throw new Error("COD job is no longer owned by this worker");
    await tx.partialCodIntent.update({ where: { id: intentId }, data: { state: "cod_order_created", codOrderId: orderId } });
  });
}

