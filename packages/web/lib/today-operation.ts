import type { CapturePhase, StoredCaptureBatch } from "./capture-batch-db.ts";

type RunStatus = { status: string; started_at: Date; finished_at: Date | null };
type Batch = Pick<StoredCaptureBatch, "status" | "started_at" | "finished_at" | "metadata" | "requested_marketplaces">;
type CaptureRun = { marketplace: string; monitoring: boolean };

export type TodayActivity = {
  kind: "queued" | "capture" | "browser" | "triage" | "monitoring";
  marketplaces: string[];
};
export type TodayOperations = { activities: TodayActivity[]; issues: string[] };
type PautaChannelStatus = { active: boolean; count: number } | null;
export type TodayStatus = TodayOperations & { pauta: Record<"whatsapp" | "stories", PautaChannelStatus> };

const recentMs = 24 * 60 * 60_000;
const triageTimeoutMs = 30 * 60_000;
const phaseActivities: Record<Exclude<CapturePhase, "finished">, TodayActivity["kind"]> = {
  queued: "queued", capturing: "capture", awaiting_browser: "browser", triaging: "triage",
};

export function describeTodayOperations(batch: Batch | null, triage: RunStatus | null, runs: CaptureRun[], now: Date): TodayOperations {
  const activities: TodayActivity[] = [];
  const issues: string[] = [];
  const isRecent = (value: Date | string) => +now - +new Date(value) < recentMs;

  if (batch) {
    const execution = batch.metadata.execution;
    const deadline = execution?.version === 1
      ? Date.parse(execution.deadline)
      : +new Date(batch.started_at) + 2 * 60 * 60_000;
    if (batch.status === "running" && deadline > +now) {
      const phase = execution?.phase ?? "capturing";
      if (phase !== "finished") activities.push({ kind: phaseActivities[phase], marketplaces: batch.requested_marketplaces });
    } else if (isRecent(batch.finished_at ?? batch.started_at)) {
      if (batch.status === "running") issues.push("A captura excedeu o prazo.");
      if (batch.status === "error") issues.push("A última captura foi interrompida.");
      if (batch.status === "partial") issues.push("A última captura terminou com falhas em parte do lote.");
    }
  }

  for (const kind of ["capture", "monitoring"] as const) {
    const marketplaces = runs.filter(run => run.monitoring === (kind === "monitoring")).map(run => run.marketplace);
    if (!marketplaces.length) continue;
    const activity = activities.find(item => item.kind === kind);
    if (activity) activity.marketplaces = [...new Set([...activity.marketplaces, ...marketplaces])];
    else activities.push({ kind, marketplaces: [...new Set(marketplaces)] });
  }

  if (triage) {
    const active = triage.status === "running" && +now - +triage.started_at < triageTimeoutMs;
    if (active && !activities.some(item => item.kind === "triage")) activities.push({ kind: "triage", marketplaces: [] });
    if (!active && isRecent(triage.finished_at ?? triage.started_at)) {
      if (triage.status === "running") issues.push("A triagem com IA está sem conclusão há mais de 30 minutos.");
      if (triage.status === "error") issues.push("A última triagem com IA foi interrompida.");
    }
  }
  return { activities, issues };
}
