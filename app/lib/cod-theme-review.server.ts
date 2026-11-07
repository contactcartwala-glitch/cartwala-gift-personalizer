import prisma from "../db.server";

export const COD_REVIEW_SHOP = "0k9icg-ns.myshopify.com";
export const COD_REVIEW_THEME = "188248228025";
export type CodThemeReview = { enabled: boolean; customerEnabled: boolean; advancePercent: number; codFeePaise: number; revision: number };
type ReviewDb = { query<T>(sql: string, values: unknown[]): Promise<T[]> };
const database: ReviewDb = {
  query: <T>(sql: string, values: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...values),
};
export function requireReviewShop(shop: string) {
  if (shop !== COD_REVIEW_SHOP) throw new Response("Not found", { status: 404 });
}
export function parseReviewCharge(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a COD charge from ₹0 to ₹10,000 with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise > 1000000) throw new Error("COD charge must not exceed ₹10,000.");
  return paise;
}
function validate(settings: CodThemeReview) {
  if (typeof settings.enabled !== "boolean" || typeof settings.customerEnabled !== "boolean" || !Number.isInteger(settings.advancePercent) ||
    settings.advancePercent < 10 || settings.advancePercent > 50 || !Number.isSafeInteger(settings.codFeePaise) ||
    settings.codFeePaise < 0 || settings.codFeePaise > 1000000 || !Number.isSafeInteger(settings.revision) || settings.revision < 0)
    throw new Error("Choose an advance percentage from 10 to 50 and valid saved settings.");
  return settings;
}
export async function loadCodThemeReview(shop: string, db = database): Promise<CodThemeReview> {
  requireReviewShop(shop);
  await db.query(`INSERT INTO "CodThemeReviewSettings" ("shop") VALUES ($1)
    ON CONFLICT ("shop") DO NOTHING RETURNING "shop"`, [shop]);
  const rows = await db.query<CodThemeReview>(`SELECT "enabled","customerEnabled","advancePercent","codFeePaise","revision"
    FROM "CodThemeReviewSettings" WHERE "shop"=$1`, [shop]);
  if (!rows[0]) throw new Error("Preview settings could not load.");
  return validate(rows[0]);
}
export async function saveCodThemeReview(shop: string, settings: CodThemeReview, db = database) {
  requireReviewShop(shop);
  validate(settings);
  const rows = await db.query<CodThemeReview>(`UPDATE "CodThemeReviewSettings"
    SET "enabled"=$2,"advancePercent"=$3,"codFeePaise"=$4,"customerEnabled"=$6,"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "shop"=$1 AND "revision"=$5 RETURNING "enabled","customerEnabled","advancePercent","codFeePaise","revision"`,
  [shop, settings.enabled, settings.advancePercent, settings.codFeePaise, settings.revision, settings.customerEnabled]);
  if (!rows[0]) throw new Error("Settings changed in another tab. Refresh and try again.");
  return validate(rows[0]);
}
