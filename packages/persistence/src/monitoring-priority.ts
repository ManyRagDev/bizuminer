/** Shared queue budget: reserve history-building slots, fill unused slots without starvation. */
export function prioritizeMonitoringQueue<
  T extends { id: string; observationCount?: number; historyDays?: number },
>(candidates: readonly T[], budget: number, reserveRatio = 0.3): T[] {
  const cap = Math.max(0, Math.floor(budget));
  if (!cap) return [];
  if (!Number.isFinite(reserveRatio) || reserveRatio < 0 || reserveRatio > 1)
    throw new Error("invalid_monitoring_reserve");
  const fresh = candidates.filter(
    (c) =>
      (c.observationCount ?? 0) <= 1 ||
      (c.historyDays !== undefined && c.historyDays <= 1),
  );
  const quota = Math.min(
    cap,
    Math.max(reserveRatio > 0 ? 1 : 0, Math.floor(cap * reserveRatio)),
  );
  const reserved = fresh.slice(0, quota),
    ids = new Set(reserved.map((c) => c.id));
  return [
    ...candidates.filter((c) => !ids.has(c.id)).slice(0, cap - reserved.length),
    ...reserved,
  ].slice(0, cap);
}
