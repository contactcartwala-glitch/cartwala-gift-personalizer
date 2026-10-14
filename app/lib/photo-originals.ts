export const ORIGINAL_RETENTION_DAYS = 30;
export const ORIGINAL_RETENTION_MS = ORIGINAL_RETENTION_DAYS * 86400000;
export const originalArchiveIds = (
  attributes: Array<{ key: string; value: string }>,
) => [
  ...new Set(
    attributes
      .filter((a) => /^_Cartwala Original archive \d+$/.test(a.key))
      .map((a) => a.value)
      .filter((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        ),
      ),
  ),
];
export const originalsDeleteAfter = (archive: {
  lastUsedAt: Date;
  orders: Array<{ completedAt: Date | null }>;
}): Date | null => {
  if (archive.orders.some((order) => !order.completedAt)) return null;
  const completed = archive.orders.map((order) => order.completedAt!.getTime());
  return new Date(
    (completed.length
      ? Math.max(...completed, archive.lastUsedAt.getTime())
      : archive.lastUsedAt.getTime()) + ORIGINAL_RETENTION_MS,
  );
};
