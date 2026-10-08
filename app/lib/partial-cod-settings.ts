export type AdvanceCodSettings = { enabled: boolean; advancePercent: number; revision: number };
export const DEFAULT_COD_SETTINGS: AdvanceCodSettings = { enabled: false, advancePercent: 20, revision: 0 };

export function validateCodSettings(value: unknown): AdvanceCodSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid COD settings");
  const row = value as Record<string, unknown>;
  if (typeof row.enabled !== "boolean" || !Number.isInteger(row.advancePercent) ||
      Number(row.advancePercent) < 10 || Number(row.advancePercent) > 50 ||
      !Number.isInteger(row.revision) || Number(row.revision) < 0)
    throw new Error("Choose a whole advance percentage from 10 to 50");
  return { enabled: row.enabled, advancePercent: Number(row.advancePercent), revision: Number(row.revision) };
}

// These gates are implementation status, not merchant-editable settings or environment overrides.
export const COD_INTEGRATION_STATUS = [
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
