import { createHash } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { readOriginalArchive } from "../lib/photo-original-zip.server";
import {
  uploadOriginalZipAsset,
  deleteShopifyFiles,
} from "../lib/shopify-files.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session)
    return Response.json({ error: "App is not installed" }, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 21 * 1024 * 1024)
    return Response.json(
      { error: "Original ZIP is too large" },
      { status: 413 },
    );
  let pendingId: string | null = null;
  try {
    const form = await request.formData(),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 20 * 1024 * 1024 ||
      file.size < 100
    )
      throw new Error("Original ZIP must be smaller than 20 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      archive = readOriginalArchive(bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const old = await prisma.photoOriginalArchive.findUnique({
      where: { shop_hash: { shop: session.shop, hash } },
    });
    if (old?.url && !old.deletedAt) {
      const reused = await prisma.photoOriginalArchive.updateMany({
        where: { id: old.id, deletedAt: null },
        data: { lastUsedAt: new Date() },
      });
      if (!reused.count)
        throw new Error("Originals changed. Please retry saving.");
      return Response.json(
        { archiveId: old.id, photoCount: old.photoCount },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (old)
      throw new Error(
        "Originals are still being saved. Please retry in a moment.",
      );
    const row = await prisma.photoOriginalArchive.create({
      data: {
        shop: session.shop,
        hash,
        byteSize: bytes.length,
        photoCount: archive.originals.length,
      },
    });
    pendingId = row.id;
    const safeFile = new File([bytes], `cartwala-originals-${row.id}.zip`, {
      type: "application/zip",
    });
    const asset = await uploadOriginalZipAsset(admin, safeFile);
    try {
      await prisma.photoOriginalArchive.update({
        where: { id: row.id },
        data: { fileId: asset.id, url: asset.url },
      });
    } catch (error) {
      await deleteShopifyFiles(admin, [asset.id]).catch(() => undefined);
      throw error;
    }
    pendingId = null;
    return Response.json(
      { archiveId: row.id, photoCount: row.photoCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (pendingId)
      await prisma.photoOriginalArchive
        .delete({ where: { id: pendingId } })
        .catch(() => undefined);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save original photos",
      },
      { status: 400 },
    );
  }
};
