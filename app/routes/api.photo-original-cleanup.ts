import { createHmac, timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { cleanupPhotoOriginals } from "../lib/photo-original-retention.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const timestamp = request.headers.get("x-cartwala-timestamp") || "";
  const provided = request.headers.get("x-cartwala-signature") || "";
  const secret = process.env.SHOPIFY_API_SECRET;
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  if (
    !secret ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 120000 ||
    !/^[a-f0-9]{64}$/.test(provided)
  )
    return new Response("Unauthorized", { status: 401 });
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:photo-original-cleanup:${dryRun ? "dry" : "delete"}`)
    .digest("hex");
  if (
    !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))
  )
    return new Response("Unauthorized", { status: 401 });
  const result = await cleanupPhotoOriginals(dryRun);
  return Response.json(result, {
    status: result.failed ? 500 : 200,
    headers: { "Cache-Control": "no-store" },
  });
};
