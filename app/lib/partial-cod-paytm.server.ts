import { createHash } from "node:crypto";
import PaytmChecksum from "paytmchecksum";
import { frozenCodFee } from "./partial-cod";

type JsonObject = Record<string, unknown>;
type ApiFetch = typeof fetch;
export type PaytmIntent = {
  id: string; shop: string; state: string; currency: string;
  orderPaise: number; advancePercent: number; codFeePaise?: number; payableNowPaise: number; collectPaise: number;
};
export type PaytmConfig = {
  mid: string; merchantKey: string; environment: "staging" | "production";
  appOrigin: string; allowLiveInitiation?: boolean;
};

const hosts = {
  staging: "https://securestage.paytmpayments.com",
  production: "https://secure.paytmpayments.com",
} as const;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Paytm response");
  return value as JsonObject;
}
function rupees(paise: number) {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
function paise(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid Paytm amount");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Accept only a persisted, server-priced quote. Never accept a browser-supplied amount. */
export function paytmPaymentReference(intent: PaytmIntent) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(intent.id) ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(intent.shop) || intent.currency !== "INR" ||
      !Number.isSafeInteger(intent.orderPaise) || intent.orderPaise < 1 || intent.orderPaise > 100_000_000 ||
      !Number.isInteger(intent.advancePercent) || intent.advancePercent < 10 || intent.advancePercent > 50)
    throw new Error("Invalid Paytm payment intent");
  const advance = Math.floor((intent.orderPaise * intent.advancePercent + 50) / 100);
  if (intent.payableNowPaise !== advance + frozenCodFee(intent.codFeePaise) || intent.collectPaise !== intent.orderPaise - advance)
    throw new Error("Stored Paytm amounts do not match the frozen quote");
  const digest = createHash("sha256").update(`${intent.shop}:${intent.id}`).digest("hex");
  return { orderId: `CW${digest.slice(0, 48)}`, customerId: `CW${digest.slice(0, 32)}`,
    amount: rupees(intent.payableNowPaise) };
}

export class PaytmApiError extends Error {
  constructor(readonly kind: "transport" | "http" | "response" | "signature" | "rejected", readonly status?: number) {
    super(`Paytm request failed (${kind}${status ? `, ${status}` : ""})`);
  }
}

/** Server-only adapter. No credentials, transaction tokens, response bodies or PII are logged. */
export function verifyPaytmCallback(raw: string, config: Pick<PaytmConfig, "mid" | "merchantKey">) {
  if (Buffer.byteLength(raw, "utf8") > 32_768) throw new Error("Invalid Paytm callback");
  const fields = new URLSearchParams(raw), params: Record<string, string> = {};
  const seen = new Set<string>();
  let signature = "";
  for (const [name, value] of fields) {
    if (!/^[A-Z0-9_]{1,64}$/.test(name) || value.length > 4096 || seen.has(name))
      throw new Error("Invalid Paytm callback");
    seen.add(name);
    if (name === "CHECKSUMHASH") signature = value;
    else params[name] = value;
  }
  if (Object.keys(params).length > 64 || params.MID !== config.mid || !/^CW[a-f0-9]{48}$/.test(params.ORDERID || "") ||
      !/^[A-Za-z0-9+/]{100,200}={0,2}$/.test(signature)) throw new Error("Invalid Paytm callback");
  let valid = false;
  try { valid = PaytmChecksum.verifySignature(params, config.merchantKey, signature); } catch { /* Fail closed. */ }
  if (!valid) throw new Error("Invalid Paytm callback signature");
  // A valid callback is only a hint to re-read status; never return a paid proof from these fields.
  return { orderId: params.ORDERID };
}

export function createPaytmClient(config: PaytmConfig, apiFetch: ApiFetch = fetch) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(config.mid) || Buffer.byteLength(config.merchantKey, "utf8") !== 16 ||
      /[\r\n]/.test(config.merchantKey) || !Object.hasOwn(hosts, config.environment))
    throw new Error("Paytm configuration is missing or invalid");
  const origin = new URL(config.appOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash ||
      origin.pathname !== "/") throw new Error("Paytm app origin must be a trusted HTTPS origin");
  const host = hosts[config.environment];

  async function request(path: string, body: JsonObject) {
    const bodyText = JSON.stringify(body);
    const signature = await PaytmChecksum.generateSignature(bodyText, config.merchantKey);
    let response: Response;
    try {
      response = await apiFetch(`${host}${path}`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ body, head: { signature } }),
      });
    } catch { throw new PaytmApiError("transport"); }
    if (!response.ok) throw new PaytmApiError("http", response.status);
    let result: JsonObject;
    try {
      const text = await response.text();
      if (text.length > 128_000) throw new Error();
      result = object(JSON.parse(text));
    } catch { throw new PaytmApiError("response"); }
    let resultBody: JsonObject;
    try { resultBody = object(result.body); }
    catch { throw new PaytmApiError("response"); }
    try {
      const head = object(result.head);
      if (typeof head.signature !== "string" || head.signature.length > 1024 ||
          !PaytmChecksum.verifySignature(JSON.stringify(resultBody), config.merchantKey, head.signature))
        throw new Error();
    } catch { throw new PaytmApiError("signature"); }
    return resultBody;
  }

  return {
    /** Persist this reference before calling. Reuse it after uncertain results; never mint a new order ID. */
    async initiate(intent: PaytmIntent) {
      const reference = paytmPaymentReference(intent);
      if (intent.state !== "awaiting_payment") throw new Error("Paytm payment intent is closed");
      if (config.environment === "production" && config.allowLiveInitiation !== true)
        throw new Error("Live Paytm initiation is not enabled");
      const body = await request(`/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(config.mid)}&orderId=${reference.orderId}`, {
        requestType: "Payment", mid: config.mid,
        websiteName: config.environment === "production" ? "DEFAULT" : "WEBSTAGING",
        orderId: reference.orderId, txnAmount: { value: reference.amount, currency: "INR" },
        userInfo: { custId: reference.customerId },
        callbackUrl: `${origin.origin}/payments/paytm/callback`,
      });
      const info = object(body.resultInfo);
      if (info.resultStatus !== "S" || !["0000", "0002"].includes(String(info.resultCode)) ||
          typeof body.txnToken !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(body.txnToken))
        throw new PaytmApiError("rejected");
      return { orderId: reference.orderId, txnToken: body.txnToken, amount: reference.amount,
        environment: config.environment, mid: config.mid };
    },
    /** Only this authenticated server re-read can supply proof; a browser callback cannot. */
    async verify(intent: PaytmIntent) {
      const reference = paytmPaymentReference(intent);
      if (!["awaiting_payment", "paid", "cod_order_created"].includes(intent.state))
        throw new Error("Paytm payment intent is closed");
      const body = await request("/v3/order/status", { mid: config.mid, orderId: reference.orderId });
      const info = object(body.resultInfo);
      if (info.resultStatus === "PENDING" || info.resultStatus === "NO_RECORD_FOUND")
        return { status: "pending" as const, orderId: reference.orderId };
      if (info.resultStatus === "TXN_FAILURE") return { status: "failed" as const, orderId: reference.orderId };
      if (info.resultStatus !== "TXN_SUCCESS" || info.resultCode !== "01" ||
          body.mid !== config.mid || body.orderId !== reference.orderId ||
          typeof body.txnId !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(body.txnId) ||
          (body.txnType !== undefined && body.txnType !== "SALE") ||
          paise(body.txnAmount) !== intent.payableNowPaise || paise(body.refundAmt) !== 0)
        throw new Error("Paytm status does not match the expected payment");
      return { status: "paid" as const, orderId: reference.orderId, transactionId: body.txnId,
        paidPaise: intent.payableNowPaise, currency: "INR" as const,
        fingerprint: `paytm:${config.environment}:${config.mid}:${body.txnId}` };
    },
  };
}

