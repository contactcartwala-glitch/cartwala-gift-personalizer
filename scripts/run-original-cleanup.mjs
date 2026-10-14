import process from "node:process";
import { createHmac } from "node:crypto";
const secret = process.env.SHOPIFY_API_SECRET;
if (!secret) throw new Error("App cleanup secret is unavailable");
const dryRun = process.argv.includes("--dry-run"),
  timestamp = String(Date.now());
const signature = createHmac("sha256", secret)
  .update(`${timestamp}:photo-original-cleanup:${dryRun ? "dry" : "delete"}`)
  .digest("hex");
const response = await fetch(
  `http://127.0.0.1:${process.env.PORT || 3000}/api/photo-original-cleanup${dryRun ? "?dryRun=1" : ""}`,
  {
    method: "POST",
    headers: {
      "x-cartwala-timestamp": timestamp,
      "x-cartwala-signature": signature,
    },
    signal: AbortSignal.timeout(300000),
  },
);
const result = await response.json();
console.log(JSON.stringify(result));
if (!response.ok) process.exitCode = 1;
