"use client";

import { useEffect, useRef, useState } from "react";

export type AdminRun = {
  id: string;
  marketplace: string;
  status: "running" | "ok" | "error";
  startedAt: string;
  finishedAt: string | null;
  itemsCaptured: number;
  itemsNew: number;
  priceChanges: number;
  error: string | null;
  observationCount: number;
};

type RunsResponse = {
  ok: boolean;
  runs?: Array<Record<string, unknown>>;
  runningId?: string | null;
};

const POLL_MS = 5000;
const SPAWN_TIMEOUT_MS = 30_000;

const dateTime = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(isoDate));

function duration(run: AdminRun): string {
  if (!run.finishedAt) return "—";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

function statusLabel(run: AdminRun): { className: string; label: string } {
  if (run.status === "running") return { className: "running", label: "rodando" };
  if (run.status === "error") return { className: "error", label: "erro" };
  if (run.itemsCaptured === 0) return { className: "empty", label: "vazia" };
  return { className: "ok", label: "ok" };
}

function parseRuns(payload: RunsResponse): AdminRun[] {
  return (payload.runs ?? []).map((row) => ({
    id: String(row.id),
    marketplace: String(row.marketplace),
    status: row.status as AdminRun["status"],
    startedAt: new Date(row.started_at as string).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null,
    itemsCaptured: Number(row.items_captured),
    itemsNew: Number(row.items_new),
    priceChanges: Number(row.price_changes),
    error: (row.error as string | null) ?? null,
    observationCount: Number(row.observation_count ?? 0),
  }));
}

export default function AdminPanel({ initialRuns, initialRunningId }: { initialRuns: AdminRun[]; initialRunningId: string | null }) {
  const [runs, setRuns] = useState(initialRuns);
  const [runningId, setRunningId] = useState(initialRunningId);
  const [pages, setPages] = useState(1);
  const [requesting, setRequesting] = useState(false);
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const knownIds = useRef(new Set(initialRuns.map((run) => run.id)));

  const busy = runningId !== null || awaitingSince !== null;

  async function refresh() {
    try {
      const response = await fetch("/api/admin/rodagens");
      const payload = (await response.json()) as RunsResponse;
      if (!payload.ok) return;
      const next = parseRuns(payload);
      setRuns(next);
      setRunningId(payload.runningId ?? null);
      if (awaitingSince !== null) {
        const hasNew = next.some((run) => !knownIds.current.has(run.id));
        if (hasNew) {
          setAwaitingSince(null);
          setMessage("");
          knownIds.current = new Set(next.map((run) => run.id));
        } else if (Date.now() - awaitingSince > SPAWN_TIMEOUT_MS) {
          setAwaitingSince(null);
          setMessage("A rodagem foi solicitada, mas nenhuma execução nova apareceu em 30s. Verifique o processo no servidor.");
        }
      } else {
        knownIds.current = new Set(next.map((run) => run.id));
      }
    } catch {
      // rede local instável: o próximo tick tenta de novo
    }
  }

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
    // refresh muda a cada render; o intervalo só precisa existir enquanto busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, awaitingSince]);

  async function trigger() {
    if (requesting || busy) return;
    setRequesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/rodagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (response.status === 409) {
        setMessage("Já existe uma rodagem em andamento.");
        await refresh();
        return;
      }
      if (!payload.ok) throw new Error(payload.error ?? "falha");
      setAwaitingSince(Date.now());
      setMessage("Rodagem solicitada. Aguardando o robô registrar a execução…");
    } catch {
      setMessage("Não foi possível acionar a rodagem. Veja o log do servidor web.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="admin-section" aria-labelledby="runs-title">
      {busy && <div className="admin-pulse" role="status" aria-label="Rodagem em andamento"><i /></div>}
      <div className="admin-runs-head">
        <h2 id="runs-title">Rodagens do robô</h2>
        <div className="admin-trigger">
          <label>
            páginas
            <select value={pages} onChange={(event) => setPages(Number(event.target.value))} disabled={requesting || busy}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button type="button" disabled={requesting || busy} onClick={() => void trigger()}>
            {busy ? "rodagem em andamento…" : requesting ? "acionando…" : "nova rodagem ▸"}
          </button>
        </div>
      </div>
      {message && <p className="admin-message" role="status">{message}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>status</th>
              <th>início</th>
              <th>duração</th>
              <th className="num">itens</th>
              <th className="num">novos</th>
              <th className="num">mudanças de preço</th>
              <th className="num">observações</th>
              <th>erro</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={8} className="admin-table-empty">Nenhuma rodagem registrada ainda.</td></tr>
            )}
            {runs.map((run) => {
              const status = statusLabel(run);
              return (
                <tr key={run.id} className={status.className === "empty" ? "row-empty" : undefined}>
                  <td><span className={`run-status ${status.className}`}>{status.label}</span></td>
                  <td>{dateTime(run.startedAt)}</td>
                  <td className="num">{duration(run)}</td>
                  <td className="num">{run.itemsCaptured}</td>
                  <td className="num">{run.itemsNew}</td>
                  <td className="num">{run.priceChanges}</td>
                  <td className="num">{run.observationCount}</td>
                  <td className="admin-error-cell">{run.error ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="admin-footnote">
        Rodagem <b>vazia</b> (0 itens com status ok) é sinal de scraper quebrado em silêncio — investigar antes de
        acionar de novo. A execução é registrada pelo próprio robô: nasce “rodando” antes da busca e fecha como ok ou erro.
      </p>
    </section>
  );
}
