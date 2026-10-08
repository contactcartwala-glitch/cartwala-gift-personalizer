import prisma from "../db.server";
import { DEFAULT_COD_SETTINGS, requireCodActivation, validateCodSettings } from "./partial-cod-settings";

export async function loadCodSettings(shop: string) {
  const row = await prisma.partialCodSettings.findUnique({ where: { shop } });
  return row ? validateCodSettings(row) : { ...DEFAULT_COD_SETTINGS };
}

export async function saveCodSettings(shop: string, value: unknown) {
  const settings = validateCodSettings(value);
  requireCodActivation(settings);
  if (settings.revision === 0) {
    try {
      return await prisma.partialCodSettings.create({ data: {
        shop, enabled: settings.enabled, advancePercent: settings.advancePercent,
      } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002")
        throw new Error("Settings changed in another tab. Reload before saving.");
      throw error;
    }
  }
  const result = await prisma.partialCodSettings.updateMany({
    where: { shop, revision: settings.revision },
    data: { enabled: settings.enabled, advancePercent: settings.advancePercent, revision: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("Settings changed in another tab. Reload before saving.");
  return loadCodSettings(shop);
}
