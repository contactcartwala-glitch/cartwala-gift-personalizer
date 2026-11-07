export type AdvanceCodSettings = { enabled: boolean; advancePercent: number; codFeePaise: number; revision: number };
export const DEFAULT_COD_SETTINGS: AdvanceCodSettings = { enabled: false, advancePercent: 20, codFeePaise: 5000, revision: 0 };

/** Parse the admin's rupee input exactly; never round a fractional paise. */
export function parseCodCharge(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a COD charge from ₹0 to ₹10,000 with at most two decimal places");
  const [whole, fraction = ""] = value.trim().split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise > 1_000_000) throw new Error("COD charge must not exceed ₹10,000");
  return paise;
}

export function validateCodSettings(value: unknown): AdvanceCodSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid COD settings");
  const row = value as Record<string, unknown>;
  const codFeePaise = row.codFeePaise === undefined ? DEFAULT_COD_SETTINGS.codFeePaise : row.codFeePaise;
  if (typeof row.enabled !== "boolean" || !Number.isInteger(row.advancePercent) ||
      Number(row.advancePercent) < 10 || Number(row.advancePercent) > 50 ||
      !Number.isSafeInteger(codFeePaise) || Number(codFeePaise) < 0 || Number(codFeePaise) > 1_000_000 ||
      !Number.isInteger(row.revision) || Number(row.revision) < 0)
    throw new Error("Choose a whole advance percentage from 10 to 50");
  return { enabled: row.enabled, advancePercent: Number(row.advancePercent), codFeePaise: Number(codFeePaise), revision: Number(row.revision) };
}

// These gates are implementation status, not merchant-editable settings or environment overrides.
export const COD_INTEGRATION_STATUS = [
  { id: "placement", label: "Supported checkout placement agreed", ready: false },
  { id: "checkout", label: "Advance payment checkout", ready: false },
  { id: "orders", label: "Full order and payment accounting", ready: false },
  { id: "courier", label: "NimbusPost remaining balance collection", ready: false },
  { id: "refunds", label: "Cancellation and refund handling", ready: false },
  { id: "test", label: "End-to-end order test", ready: false },
] as const;

export function canEnableAdvanceCod(): boolean {
  return COD_INTEGRATION_STATUS.every(item => item.ready);
}

export function requireCodActivation(settings: AdvanceCodSettings): void {
  if (settings.enabled && !canEnableAdvanceCod())
    throw new Error("Advance COD cannot be enabled until checkout, orders and NimbusPost tests are complete.");
}

