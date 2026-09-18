"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  groupAdminRuns,
  toAdminRun,
  type AdminRun,
  type AdminRunGroupStatus,
  type AdminRunSource,
} from "../../lib/admin-run-groups";

export type { AdminRun } from "../../lib/admin-run-groups";

type RunsResponse = {
  ok: boolean;
  runs?: AdminRunSource[];
  runningId?: string | null;
};

const POLL_MS = 5000;
const SPAWN_TIMEOUT_MS = 30_000;

const dateTime = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(isoDate));

function duration(run: { startedAt: string; finishedAt: string | null }): string {
  if (!run.finishedAt) return "—";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

function statusLabel(status: AdminRunGroupStatus, itemsCaptured: number): { className: string; label: string } {
  if (status === "running") return { className: "running", label: "rodando" };
  if (status === "partial") return { className: "partial", label: "parcial" };
  if (status === "error") return { className: "error", label: "erro" };
  if (itemsCaptured === 0) return { className: "empty", label: "vazia" };
  return { className: "ok", label: "ok" };
}

function parseRuns(payload: RunsResponse): AdminRun[] {
  return (payload.runs ?? []).map(toAdminRun);
}

function modeLabel(mode: string | null): string {
  if (mode === "directed") return "dirigida";
  if (mode === "exploratory") return "exploratória";
  return "avulsa";
}

/**
 * Rodagens de UMA plataforma — parametrizado por `marketplace` (M4,
 * `docs/tecnico/plano-multiplataforma.md`). O Mercado Livre continua com o
 * mesmo comportamento de sempre (kill switch E0, aviso de captura manual);
 * cada plataforma nova só precisa de `triggerPath`/`enabled`/`disabledNotice`
 * próprios — este componente não sabe o nome de nenhuma plataforma.
 */
export default function AdminPanel({
  marketplace,
  marketplaceLabel,
  triggerPath,
  initialRuns,
  initialRunningId,
  enabled,
  disabledNotice,
  requiresConsent,
}: {
  marketplace: string;
  marketplaceLabel: string;
  /** Endpoint POST que aciona a rodagem desta plataforma. */
  triggerPath: string;
  initialRuns: AdminRun[];
  initialRunningId: string | null;
  enabled: boolean;
  /** Mostrado só quando `enabled` é falso — explica por que está desligada e qual é o caminho vigente. */
  disabledNotice: ReactNode;
  /** Se true, exige checkbox de consentimento antes de acionar. */
  requiresConsent?: boolean;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [runningId, setRunningId] = useState(initialRunningId);
  const [pages, setPages] = useState(1);
  const [requesting, setRequesting] = useState(false);
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [consented, setConsented] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const knownIds = useRef(new Set(initialRuns.map((run) => run.id)));

  const busy = runningId !== null || awaitingSince !== null;
  const canTrigger = requiresConsent ? consented : enabled;
  const groups = groupAdminRuns(runs);

  function toggleGroup(id: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    try {
      const response = await fetch(`/api/admin/rodagens?marketplace=${encodeURIComponent(marketplace)}`);
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
    if (requesting || busy || !canTrigger) return;
    setRequesting(true);
    setMessage("");
    try {
      const response = await fetch(triggerPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages, consent: requiresConsent ? consented : undefined }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; message?: string };
      if (response.status === 409) {
        if (typeof payload.error === "string" && payload.error.endsWith("_capture_disabled")) {
          setMessage(payload.message ?? `A captura de ${marketplaceLabel} está desligada.`);
        } else {
          setMessage("Já existe uma rodagem em andamento.");
        }
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
    <section className="admin-section" aria-labelledby={`runs-title-${marketplace}`}>
      {busy && <div className="admin-pulse" role="status" aria-label="Rodagem em andamento"><i /></div>}
      <div className="admin-runs-head">
        <h2 id={`runs-title-${marketplace}`}>Rodagens · {marketplaceLabel}</h2>
        <div className="admin-trigger">
          {requiresConsent && (
            <label className="admin-consent">
              <input
                type="checkbox"
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
                disabled={requesting || busy}
              />
              entendo os riscos de rodar automático
            </label>
          )}
          <label>
            páginas
            <select value={pages} onChange={(event) => setPages(Number(event.target.value))} disabled={requesting || busy || !canTrigger}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button type="button" disabled={requesting || busy || !canTrigger} onClick={() => void trigger()}>
            {busy ? "rodagem em andamento…" : requesting ? "acionando…" : "nova rodagem ▸"}
          </button>
        </div>
      </div>
      {!enabled && !consented && (
        <p className="admin-message admin-message--notice" role="status">
          {disabledNotice}
        </p>
      )}
      {!enabled && consented && (
        <p className="admin-message admin-message--ok" role="status">
          Rodagem habilitada por consentimento. O robô será acionado ao clicar em "nova rodagem".
        </p>
      )}
      {message && <p className="admin-message" role="status">{message}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>status</th>
              <th>início</th>
              <th>duração</th>
              <th className="num">buscas</th>
              <th className="num">itens</th>
              <th className="num">novos</th>
              <th className="num">mudanças de preço</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={7} className="admin-table-empty">Nenhuma rodagem registrada ainda.</td></tr>
            )}
            {groups.map((group) => {
              const status = statusLabel(group.status, group.itemsCaptured);
              const expanded = expandedGroups.has(group.id);
              const detailsId = `run-group-${group.children[0]!.id}`;
              return (
                <Fragment key={group.id}>
                  <tr className={`admin-run-group-row${status.className === "empty" ? " row-empty" : ""}${expanded ? " is-expanded" : ""}`}>
                    <td className="admin-run-status-cell">
                      <button
                        type="button"
                        className="admin-run-toggle"
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        aria-label={`${expanded ? "Recolher" : "Expandir"} detalhes da rodagem de ${dateTime(group.startedAt)}`}
                        onClick={() => toggleGroup(group.id)}
                      >
                        <span aria-hidden="true">›</span>
                      </button>
                      <span className={`run-status ${status.className}`}>{status.label}</span>
                    </td>
                    <td>
                      <b className="admin-run-date">{dateTime(group.startedAt)}</b>
                      <small className="admin-run-plan">{group.planId ?? "rodagem avulsa"}</small>
                    </td>
                    <td className="num">{duration(group)}</td>
                    <td className="num"><b>{group.searchCount}</b></td>
                    <td className="num">{group.itemsCaptured}</td>
                    <td className="num">{group.itemsNew}</td>
                    <td className="num">{group.priceChanges}</td>
                  </tr>
                  {expanded && group.children.map((run, index) => {
                    const childStatus = statusLabel(run.status, run.itemsCaptured);
                    const title = run.targetCategory ?? run.queryId ?? "Consulta avulsa";
                    const detailParts = [
                      run.keyword ? `“${run.keyword}”` : null,
                      run.targetFamily ? `família ${run.targetFamily}` : null,
                      `${run.observationCount} observações`,
                      run.pagesRead !== null ? `${run.pagesRead} pág.` : null,
                      run.itemsSkippedByPolicy ? `${run.itemsSkippedByPolicy} limitados` : null,
                      run.saturationDetected ? `saturada${run.dominantFamily ? `: ${run.dominantFamily}` : ""}` : null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <Fragment key={run.id}>
                        <tr id={index === 0 ? detailsId : undefined} className="admin-run-child-row">
                          <td><span className={`run-status ${childStatus.className}`}>{childStatus.label}</span></td>
                          <td>
                            <b className="admin-run-query">{title}</b>
                            <small className="admin-run-child-time">{dateTime(run.startedAt)}</small>
                          </td>
                          <td className="num">{duration(run)}</td>
                          <td className="num"><span className="admin-run-mode">{modeLabel(run.mode)}</span></td>
                          <td className="num">{run.itemsCaptured}</td>
                          <td className="num">{run.itemsNew}</td>
                          <td className="num">{run.priceChanges}</td>
                        </tr>
                        {(detailParts || run.error) && (
                          <tr className="admin-run-child-detail">
                            <td aria-hidden="true" />
                            <td colSpan={6}>
                              {detailParts && <span>{detailParts}</span>}
                              {run.error && <strong>{run.error}</strong>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="admin-footnote">
        Uma rodagem reúne todas as buscas disparadas no mesmo plano. Expanda a linha para investigar consultas, saturação e erros.
        Rodagem <b>vazia</b> (0 itens com status ok) é sinal de captura quebrada em silêncio.
      </p>
    </section>
  );
}
