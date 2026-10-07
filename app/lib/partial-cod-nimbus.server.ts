import { verifyNimbusCodOrder, type NimbusCodOrder } from "./partial-cod-nimbus";

type ApiFetch = typeof fetch;
export class NimbusApiError extends Error {
  constructor(readonly status: number, readonly retryAfter: number | null) {
    super(`NimbusPost API request failed (${status})`);
  }
}

/** Server-only. No credential values, API response bodies or addresses are logged. */
export function createNimbusClient(credentials: { apiKey: string; apiSecret: string }, apiFetch: ApiFetch = fetch) {
  if (!/^npk_[A-Za-z0-9_-]+$/.test(credentials.apiKey) || !credentials.apiSecret ||
      /[\r\n]/.test(credentials.apiSecret)) throw new Error("NimbusPost credentials are missing or invalid");
  async function request(path: string, body?: NimbusCodOrder) {
    const response = await apiFetch(`https://api-v2.nimbuspost.com/v2/${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "x-api-key": credentials.apiKey, "x-api-secret": credentials.apiSecret,
        Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const retry = response.headers.get("Retry-After");
      throw new NimbusApiError(response.status, retry && /^\d+$/.test(retry) ? Number(retry) : null);
    }
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new Error("NimbusPost API returned invalid JSON"); }
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        !("success" in result) || result.success !== true || !("data" in result))
      throw new Error("NimbusPost API returned an invalid success response");
    return result.data;
  }
  return {
    async readAndVerify(orderId: string, expected: NimbusCodOrder) {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(orderId)) throw new Error("Invalid NimbusPost order id");
      return verifyNimbusCodOrder(expected, await request(`orders/${encodeURIComponent(orderId)}`));
    },
    /** Creates only an unbooked order. Persist its ID before re-reading; never retry this POST blindly. */
    async createUnbookedOrder(body: NimbusCodOrder) {
      const data = await request("orders", body);
      if (!data || typeof data !== "object" || Array.isArray(data) || !("order_id" in data) ||
          typeof data.order_id !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(data.order_id))
        throw new Error("NimbusPost order creation needs manual reconciliation");
      return { orderId: data.order_id };
    },
  };
}
