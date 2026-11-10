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

export type StoreHealth = {
  marketplace: string;
  name: string;
  lastCaptureAt: string | null;
  lastCaptureAgo: string;
  freshCount: number;
  freshApprovedCount: number;
  status: "fresh" | "warm" | "stale";
  statusLabel: string;
  actionUrl: string;
  actionLabel: string;
  isAutomated: boolean;
};

export type TodayStatus = TodayOperations & {
  pauta: Record<"whatsapp" | "stories", PautaChannelStatus>;
  storesHealth?: StoreHealth[];
};

export function evaluateStoreHealth(
  marketplace: string,
  lastCaptureAt: Date | string | null,
  freshCount: number,
  freshApprovedCount: number,
  now = new Date()
): StoreHealth {
  const names: Record<string, string> = {
    mercadolivre: "Mercado Livre",
    shopee: "Shopee",
    amazon: "Amazon",
    aliexpress: "AliExpress",
  };

  const actionMap: Record<string, { url: string; label: string; isAutomated: boolean }> = {
    mercadolivre: {
      url: "https://www.mercadolivre.com.br/ofertas",
      label: "Capturar no ML ↗",
      isAutomated: false,
    },
    amazon: {
      url: "https://www.amazon.com.br/deals",
      label: "Capturar na Amazon ↗",
      isAutomated: false,
    },
    shopee: {
      url: "/admin#captura-hoje",
      label: "Rodar lote Shopee",
      isAutomated: true,
    },
    aliexpress: {
      url: "https://pt.aliexpress.com",
      label: "Abrir AliExpress ↗",
      isAutomated: false,
    },
  };

  const name = names[marketplace] ?? marketplace;
  const action = actionMap[marketplace] ?? {
    url: "/admin#captura-hoje",
    label: "Rodar lote",
    isAutomated: true,
  };

  if (!lastCaptureAt) {
    return {
      marketplace,
      name,
      lastCaptureAt: null,
      lastCaptureAgo: "nunca",
      freshCount,
      freshApprovedCount,
      status: "stale",
      statusLabel: "Sem rodagens",
      actionUrl: action.url,
      actionLabel: action.label,
      isAutomated: action.isAutomated,
    };
  }

  const date = new Date(lastCaptureAt);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const ageHours = diffMs / 3_600_000;
  const minutes = Math.floor(diffMs / 60_000);

  let agoText = "";
  if (minutes < 2) agoText = "agora";
  else if (minutes < 60) agoText = `há ${minutes} min`;
  else if (ageHours < 24) agoText = `há ${Math.floor(ageHours)} h`;
  else agoText = `há ${Math.floor(ageHours / 24)} d`;

  const isDifferentDay =
    date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) !==
    now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let status: "fresh" | "warm" | "stale" = "stale";
  let statusLabel = "";

  if (ageHours < 3 && freshApprovedCount >= 1) {
    status = "fresh";
    statusLabel = `Em dia (${freshApprovedCount} ofertas <3h)`;
  } else if (!isDifferentDay && ageHours < 8 && freshCount > 0) {
    status = "warm";
    statusLabel = `Atenção (${agoText})`;
  } else {
    status = "stale";
    statusLabel = isDifferentDay ? `Exige rodagem (virou o dia)` : `Exige rodagem (${agoText})`;
  }

  return {
    marketplace,
    name,
    lastCaptureAt: date.toISOString(),
    lastCaptureAgo: agoText,
    freshCount,
    freshApprovedCount,
    status,
    statusLabel,
    actionUrl: action.url,
    actionLabel: action.label,
    isAutomated: action.isAutomated,
  };
}

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
