"use client";

import { useState } from "react";
import type { TriageBatchHistory } from "../../../lib/editorial-compass.ts";
import type { CaptureRunRow } from "../../../lib/admin-db.ts";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function timeAgo(isoString: string | null): string {
  if (!isoString) return "nunca";
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 0) return "agora";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const dias = Math.floor(hr / 24);
  return `há ${dias}d`;
}

function translateReason(reason: string): string {
  switch (reason) {
    case "weak_offer":
      return "Oferta fraca";
    case "insufficient_evidence":
      return "Evidência insuficiente";
    case "family_saturation":
      return "Saturação de família (repetidos)";
    case "adult_sexual":
      return "Conteúdo adulto/inseguro";
    case "low_utility":
      return "Baixa utilidade";
    case "low_quality_listing":
      return "Baixa qualidade do anúncio";
    case "misleading_claim":
      return "Promessa milagrosa";
    case "other":
      return "Outro";
    case "none":
      return "Sem motivo";
    default:
      return reason;
  }
}

function marketplaceLabel(slug: string): string {
  switch (slug) {
    case "mercadolivre":
      return "Mercado Livre";
    case "shopee":
      return "Shopee";
    case "aliexpress":
      return "AliExpress";
    default:
      return slug;
  }
}

function duration(run: {
  started_at: Date | string;
  finished_at: Date | string | null;
}): string {
  if (!run.finished_at) return "—";
  const ms =
    new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  if (ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export default function ExecutionHistory({
  triageBatches,
  captureRuns,
  onInspectBatch,
}: {
  triageBatches: TriageBatchHistory[];
  captureRuns: CaptureRunRow[];
  onInspectBatch?: (batchId: string, runTime: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"triage" | "capture">("triage");

  return (
    <section
      className="direcionamento-card cockpit-card"
      aria-label="Registros de execução"
    >
      {/* Navegação entre Abas do Histórico */}
      <div
        className="cockpit-tabs-nav"
        role="tablist"
        aria-label="Seções do Histórico"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "triage"}
          className={`cockpit-tab-btn ${activeTab === "triage" ? "active" : ""}`}
          onClick={() => setActiveTab("triage")}
        >
          🤖 Lotes de Triagem com IA ({triageBatches.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "capture"}
          className={`cockpit-tab-btn ${activeTab === "capture" ? "active" : ""}`}
          onClick={() => setActiveTab("capture")}
        >
          Consultas nas lojas ({captureRuns.length})
        </button>
      </div>

      {/* Conteúdo da Aba 1: Triagens Editoriais */}
      {activeTab === "triage" && (
        <div className="cockpit-table-wrap">
          {triageBatches.length === 0 ? (
            <p className="empty-subtext" style={{ padding: "20px 0" }}>
              Nenhum lote de triagem registrado. A triagem pode ser iniciada na
              Seleção.
            </p>
          ) : (
            <table className="cockpit-table">
              <thead>
                <tr>
                  <th>Data / Horário</th>
                  <th>Total Avaliado</th>
                  <th>Aprovados (Piloto)</th>
                  <th>Retidos</th>
                  <th>Rejeitados</th>
                  <th>Motivo Principal / Filtro</th>
                  <th>Método</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {triageBatches.map((batch) => (
                  <tr key={batch.batchId}>
                    <td>
                      <strong>{dateFmt.format(new Date(batch.runTime))}</strong>
                      <small className="time-ago-sub">
                        {timeAgo(batch.runTime)}
                      </small>
                    </td>
                    <td>
                      <b className="batch-total">{batch.totalItems}</b>
                    </td>
                    <td>
                      {batch.approved > 0 ? (
                        <span className="pill-badge pill-approved">
                          +{batch.approved} aprovados
                        </span>
                      ) : (
                        <span className="pill-badge pill-neutral">0</span>
                      )}
                    </td>
                    <td>
                      {batch.held > 0 ? (
                        <span className="pill-badge pill-held">
                          {batch.held} retidos
                        </span>
                      ) : (
                        <span className="pill-badge pill-neutral">0</span>
                      )}
                    </td>
                    <td>
                      {batch.rejected > 0 ? (
                        <span className="pill-badge pill-rejected">
                          {batch.rejected} rejeitados
                        </span>
                      ) : (
                        <span className="pill-badge pill-neutral">0</span>
                      )}
                    </td>
                    <td>
                      <span className="reason-label" title={batch.topReason}>
                        {translateReason(batch.topReason)}
                      </span>
                    </td>
                    <td>
                      {batch.llmCount > 0 ? (
                        <span className="method-pill llm">
                          Gemini 2.5 Flash
                        </span>
                      ) : (
                        <span className="method-pill rule">Filtro Rápido</span>
                      )}
                    </td>
                    <td>
                      {onInspectBatch && (
                        <button
                          type="button"
                          className="btn-inspect-batch"
                          onClick={() =>
                            onInspectBatch(batch.batchId, batch.runTime)
                          }
                          title="Inspecionar produtos avaliados neste lote"
                        >
                          🔍 Inspecionar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Conteúdo da Aba 2: Varreduras nas Lojas */}
      {activeTab === "capture" && (
        <div className="cockpit-table-wrap">
          {captureRuns.length === 0 ? (
            <p className="empty-subtext" style={{ padding: "20px 0" }}>
              Nenhuma varredura registrada recentemente.
            </p>
          ) : (
            <table className="cockpit-table">
              <thead>
                <tr>
                  <th>Data / Horário</th>
                  <th>Loja / Plataforma</th>
                  <th>Operação</th>
                  <th>Duração</th>
                  <th>Itens Capturados</th>
                  <th>Itens Novos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {captureRuns.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>
                        {dateFmt.format(new Date(run.started_at))}
                      </strong>
                      <small className="time-ago-sub">
                        {timeAgo(String(run.started_at))}
                      </small>
                    </td>
                    <td>
                      <span className="marketplace-badge-pill">
                        {marketplaceLabel(run.marketplace)}
                      </span>
                    </td>
                    <td>
                      {run.capture_mode === "monitoring"
                        ? "Acompanhamento"
                        : "Captura"}
                    </td>
                    <td>{duration(run)}</td>
                    <td>
                      <b>{run.items_captured}</b>
                    </td>
                    <td>
                      {run.items_new > 0 ? (
                        <strong className="accent-new">
                          +{run.items_new} novos
                        </strong>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`status-badge-pill ${run.status}`}>
                        {run.status === "ok"
                          ? "✓ Sucesso"
                          : run.status === "running"
                            ? "● Rodando"
                            : "✕ Erro"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
