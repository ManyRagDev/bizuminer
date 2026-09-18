export type AdminRunStatus = "running" | "ok" | "error";

export interface AdminRun {
  id: string;
  marketplace: string;
  status: AdminRunStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsCaptured: number;
  itemsNew: number;
  priceChanges: number;
  error: string | null;
  collectorRunId: string | null;
  observationCount: number;
  executionId: string | null;
  planId: string | null;
  queryId: string | null;
  mode: string | null;
  targetCategory: string | null;
  targetFamily: string | null;
  keyword: string | null;
  itemsSeen: number | null;
  itemsSkippedByPolicy: number | null;
  pagesRead: number | null;
  saturationDetected: boolean;
  dominantFamily: string | null;
}

export interface AdminRunSource {
  id: string;
  marketplace: string;
  status: AdminRunStatus;
  started_at: Date | string;
  finished_at: Date | string | null;
  items_captured: number;
  items_new: number;
  price_changes: number;
  error: string | null;
  collector_run_id: string | null;
  observation_count: number;
  execution_id?: string | null;
  parameters?: unknown;
}

export type AdminRunGroupStatus = AdminRunStatus | "partial";

export interface AdminRunGroup {
  id: string;
  marketplace: string;
  status: AdminRunGroupStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsCaptured: number;
  itemsNew: number;
  priceChanges: number;
  observationCount: number;
  itemsSeen: number;
  itemsSkippedByPolicy: number;
  saturatedQueries: number;
  searchCount: number;
  planId: string | null;
  children: AdminRun[];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function toAdminRun(row: AdminRunSource): AdminRun {
  const parameters = record(row.parameters);
  return {
    id: String(row.id),
    marketplace: String(row.marketplace),
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    itemsCaptured: Number(row.items_captured),
    itemsNew: Number(row.items_new),
    priceChanges: Number(row.price_changes),
    error: row.error ?? null,
    collectorRunId: row.collector_run_id ?? null,
    observationCount: Number(row.observation_count ?? 0),
    executionId: optionalString(row.execution_id) ?? optionalString(parameters.captureExecutionId),
    planId: optionalString(parameters.capturePlanId),
    queryId: optionalString(parameters.captureQueryId),
    mode: optionalString(parameters.captureMode),
    targetCategory: optionalString(parameters.targetCategory),
    targetFamily: optionalString(parameters.targetFamily),
    keyword: optionalString(parameters.keyword),
    itemsSeen: optionalNumber(parameters.itemsSeen),
    itemsSkippedByPolicy: optionalNumber(parameters.itemsSkippedByPolicy),
    pagesRead: optionalNumber(parameters.pagesRead),
    saturationDetected: optionalBoolean(parameters.saturationDetected),
    dominantFamily: optionalString(parameters.dominantFamily),
  };
}

/**
 * Versões anteriores ao `captureExecutionId` já compartilhavam o prefixo do
 * `collector_run_id`. Só usamos o fallback quando o sufixo casa exatamente com
 * a query persistida; horário e nome do plano nunca são usados como identidade.
 */
export function runExecutionId(run: AdminRun): string {
  if (run.executionId) return run.executionId;
  if (run.planId && run.queryId && run.collectorRunId) {
    const suffix = `:${run.queryId}`;
    if (run.collectorRunId.endsWith(suffix) && run.collectorRunId.length > suffix.length) {
      return run.collectorRunId.slice(0, -suffix.length);
    }
  }
  return run.id;
}

function groupStatus(children: readonly AdminRun[]): AdminRunGroupStatus {
  if (children.some((run) => run.status === "running")) return "running";
  const errors = children.filter((run) => run.status === "error").length;
  if (errors === children.length) return "error";
  if (errors > 0) return "partial";
  return "ok";
}

export function groupAdminRuns(runs: readonly AdminRun[]): AdminRunGroup[] {
  const buckets = new Map<string, AdminRun[]>();
  for (const run of runs) {
    const id = runExecutionId(run);
    const key = JSON.stringify([run.marketplace, id]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(run);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([key, unsorted]) => {
    const children = [...unsorted].sort((a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.id.localeCompare(b.id));
    const startedAt = children.reduce((first, run) =>
      new Date(run.startedAt) < new Date(first) ? run.startedAt : first, children[0]!.startedAt);
    const allFinished = children.every((run) => run.finishedAt !== null);
    const finishedAt = allFinished
      ? children.reduce((last, run) =>
          new Date(run.finishedAt!) > new Date(last) ? run.finishedAt! : last, children[0]!.finishedAt!)
      : null;

    return {
      id: key,
      marketplace: children[0]!.marketplace,
      status: groupStatus(children),
      startedAt,
      finishedAt,
      itemsCaptured: children.reduce((sum, run) => sum + run.itemsCaptured, 0),
      itemsNew: children.reduce((sum, run) => sum + run.itemsNew, 0),
      priceChanges: children.reduce((sum, run) => sum + run.priceChanges, 0),
      observationCount: children.reduce((sum, run) => sum + run.observationCount, 0),
      itemsSeen: children.reduce((sum, run) => sum + (run.itemsSeen ?? run.itemsCaptured), 0),
      itemsSkippedByPolicy: children.reduce((sum, run) => sum + (run.itemsSkippedByPolicy ?? 0), 0),
      saturatedQueries: children.filter((run) => run.saturationDetected).length,
      searchCount: children.length,
      planId: children.find((run) => run.planId)?.planId ?? null,
      children,
    };
  }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
