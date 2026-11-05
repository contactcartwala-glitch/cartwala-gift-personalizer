import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { recoverConfiguredCodBatch } from "../lib/partial-cod-paytm-runtime.server";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const loader = () => new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "POST" } });
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return loader();
  const secret = process.env.COD_RECOVERY_JOB_TOKEN || "";
  const actual = request.headers.get("authorization") || "", expected = `Bearer ${secret}`;
  if (Buffer.byteLength(secret) < 32 || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
    return new Response("Unauthorized", { status: 401, headers });
  try { return Response.json(await recoverConfiguredCodBatch(), { headers }); }
  catch { return new Response("Recovery is unavailable", { status: 503, headers }); }
};
