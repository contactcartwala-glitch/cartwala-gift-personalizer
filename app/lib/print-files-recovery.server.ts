// Staff Print Files only. Call after authenticate.admin and the Shopify order lookup.
export const CARTWALA_SHOP = "0k9icg-ns.myshopify.com";
export type DesignRow = {
  id: string; shop: string; printUrls: unknown; previewUrls: unknown;
  sourceUrls: unknown; shirtSizes: unknown; backPrint: boolean;
};
export type Reader = (shop: string, ids: string[]) => Promise<DesignRow[] | null>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fileRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password ||
        !(u.hostname === "cdn.shopify.com" || u.hostname.endsWith(".cdn.shopify.com")) ||
        !u.pathname.startsWith("/s/files/")) return null;
    // Queries are cache versions, but fragments distinguish pages of the same PDF.
    u.search = "";
    return u.href;
  } catch { return null; }
}
export function completeRecoveryRow(row: DesignRow): boolean {
  const { printUrls: p, previewUrls: v, sourceUrls: s, shirtSizes: z } = row;
  if (!Array.isArray(p) || !p.length || p.length > 100 || !Array.isArray(v) ||
      !Array.isArray(s) || !Array.isArray(z) || [v, s, z].some(a => a.length !== p.length) ||
      !s.every(fileRef) || !z.every(x => ["XS", "S", "M", "L", "XL", "XXL"].includes(x))) return false;
  const nonPrint = new Set([...s.map(fileRef), ...v.flatMap(x => [fileRef(x?.front), fileRef(x?.back)])]);
  return p.every((x, i) => x && v[i] && fileRef(x.front) && fileRef(v[i].front) &&
    (!v[i].back || fileRef(v[i].back)) && (!x.back || fileRef(x.back)) &&
    (!row.backPrint || (x.back && v[i].back)) &&
    !nonPrint.has(fileRef(x.front)) && (!x.back || !nonPrint.has(fileRef(x.back))));
}

export async function recoverMissingPrintDesigns<T extends DesignRow>(
  shop: string, orderDesignIds: string[], primary: T[], read: Reader,
  expectedCounts: Record<string, number[]> = {},
): Promise<{ rows: (T | DesignRow)[]; warning: string | null }> {
  // Preserve all primary records; do not replace or merge incomplete rows.
  if (shop !== CARTWALA_SHOP) return { rows: primary, warning: null };
  const ids = [...new Set(orderDesignIds.filter(id => UUID.test(id)))];
  const existing = new Set(primary.map(r => r.id));
  const missing = ids.filter(id => !existing.has(id));
  if (!missing.length) return { rows: primary, warning: null };
  const allowed = new Set(missing);
  const recovered = new Map<string, DesignRow>();
  try {
    const candidates = await read(shop, missing);
    if (candidates === null) return { rows: primary, warning: null };
    for (const row of candidates) {
      if (row.shop === shop && allowed.has(row.id) && !recovered.has(row.id) && completeRecoveryRow(row) &&
          (expectedCounts[row.id] || []).every(count => count === (row.printUrls as unknown[]).length))
        recovered.set(row.id, row);
    }
  } catch {
    return { rows: primary, warning: "Some Signature Day designs could not be read from the recovery source. Existing print files are still available." };
  }
  return { rows: [...primary, ...recovered.values()], warning: recovered.size < missing.length
    ? "Some Signature Day print files are missing or incomplete. No preview images were substituted." : null };
}

type Transaction = {
  $executeRaw: (query: TemplateStringsArray) => Promise<unknown>;
  signatureDayDesign: { findMany: (args: { where: { shop: string; id: { in: string[] } }; select: {
    id: true; shop: true; printUrls: true; previewUrls: true;
    sourceUrls: true; shirtSizes: true; backPrint: true;
  } }) => Promise<DesignRow[]> };
};
export type RecoveryClient = {
  $transaction: (run: (tx: Transaction) => Promise<DesignRow[]>, options: { maxWait: number; timeout: number }) => Promise<DesignRow[]>;
};
export function createRecoveryReader(env: { PRINT_FILES_RECOVERY_ENABLED?: string; PRINT_FILES_RECOVERY_DATABASE_URL?: string },
  connect: (url: string) => RecoveryClient): Reader {
  let client: RecoveryClient | undefined;
  return async (shop, ids) => {
    // Both settings required. Credentials must be SELECT-only and separately provisioned.
    if (shop !== CARTWALA_SHOP || env.PRINT_FILES_RECOVERY_ENABLED !== "true" ||
        !env.PRINT_FILES_RECOVERY_DATABASE_URL || !ids.length || !ids.every(id => UUID.test(id))) return null;
    client ??= connect(env.PRINT_FILES_RECOVERY_DATABASE_URL);
    return client.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return tx.signatureDayDesign.findMany({ where: { shop, id: { in: ids } },
        select: { id: true, shop: true, printUrls: true, previewUrls: true,
          sourceUrls: true, shirtSizes: true, backPrint: true } });
    }, { maxWait: 3000, timeout: 5000 });
  };
}
