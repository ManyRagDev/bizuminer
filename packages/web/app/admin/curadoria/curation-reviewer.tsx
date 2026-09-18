"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import {
  HOLD_REASONS,
  REJECTION_REASONS,
  type CurationDecision,
  type CurationReason,
  type CurationSessionSummary,
} from "../../../lib/curation-contract.ts";
import type { CurationQueueProduct } from "../../../lib/curation-db.ts";
import { curationSignalLabel, curationSignalsFor } from "../../../lib/curation-signals.ts";
import {
  deferCurationProduct,
  runAutomatedTriageAction,
  submitCurationDecision,
  undoCurationDecision,
} from "./actions.ts";

type SerializableProduct = Omit<CurationQueueProduct, "observedAt" | "queuedAt"> & {
  observedAt: string;
  queuedAt: string;
};

interface LastDecision {
  product: SerializableProduct;
  eventId: string;
  decision: CurationDecision;
  reason: CurationReason | null;
  detail: string | null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function percent(value: number | null): string | null {
  if (value === null) return null;
  return `${Math.round(value * 100)}%`;
}

function riskSignals(product: SerializableProduct): string[] {
  return curationSignalsFor({
    observationCount: product.observationCount,
    claimedDiscountRate: product.claimedDiscountRate,
    category: product.category,
    ratingStar: product.ratingStar,
  }).map(curationSignalLabel);
}

export default function CurationReviewer({
  initialProducts,
  initialAwaiting,
  queueKind,
}: {
  initialProducts: SerializableProduct[];
  initialAwaiting: number;
  queueKind: "awaiting" | "held";
}) {
  const [products, setProducts] = useState(initialProducts);
  const [mode, setMode] = useState<Extract<CurationDecision, "reject" | "hold"> | null>(null);
  const [reasonCode, setReasonCode] = useState<CurationReason | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<CurationSessionSummary>({
    approvedCount: 0,
    rejectedCount: 0,
    heldSaturationCount: 0,
    heldEvidenceCount: 0,
    heldOtherCount: 0,
    otherReasons: [],
    totalDecisions: 0,
  });
  const [isPending, startTransition] = useTransition();

  const current = sessionClosed ? null : (products[0] ?? null);
  const sessionSize = initialProducts.length;
  const reviewed = sessionSummary.totalDecisions;
  const awaiting = Math.max(0, initialAwaiting - reviewed);
  const reasons = mode === "reject" ? REJECTION_REASONS : HOLD_REASONS;
  const signals = current ? riskSignals(current) : [];

  function resetDecisionPanel() {
    setMode(null);
    setReasonCode(null);
    setReasonDetail("");
  }

  function handleRunTriage() {
    if (isPending) return;
    setMessage("Executando triagem com Gemini 2.5 Flash...");
    startTransition(async () => {
      const res = await runAutomatedTriageAction(50);
      if (!res.ok) {
        setMessage(res.error === "triage_in_progress" ? "Já existe uma triagem em andamento. Aguarde a conclusão antes de iniciar outra." : `Falha na triagem: ${res.error}`);
        return;
      }
      setMessage(
        `Triagem concluída: ${res.processed} avaliados (${res.rejected} rejeitados, ${res.held} em espera, ${res.annotatedPending} com insights). Atualizando...`
      );
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    });
  }

  function decide(decision: CurationDecision) {
    if (!current || isPending) return;
    if (decision !== "approve") {
      setMode(decision);
      setReasonCode(null);
      setReasonDetail("");
      return;
    }
    submit("approve", null, null);
  }

  function submit(decision: CurationDecision, reason: CurationReason | null, detail: string | null) {
    if (!current || isPending) return;
    setMessage("");
    const reviewedProduct = current;
    startTransition(async () => {
      const result = await submitCurationDecision({
        productId: reviewedProduct.id,
        decision,
        reasonCode: reason,
        reasonDetail: detail,
      });
      if (!result.ok) {
        setMessage(result.error === "other_detail_required" ? "Escreva o motivo em “Outro”." : "Não foi possível salvar a decisão.");
        return;
      }
      setProducts((items) => items.filter((item) => item.id !== reviewedProduct.id));
      setLastDecision({ product: reviewedProduct, eventId: result.eventId, decision, reason, detail });

      // Atualizar métricas do resumo da sessão
      setSessionSummary((prev) => {
        const next = { ...prev, totalDecisions: prev.totalDecisions + 1 };
        if (decision === "approve") {
          next.approvedCount += 1;
        } else if (decision === "reject") {
          next.rejectedCount += 1;
        } else if (decision === "hold") {
          if (reason === "family_saturation") {
            next.heldSaturationCount += 1;
          } else if (reason === "insufficient_evidence" || reason === "weak_offer") {
            next.heldEvidenceCount += 1;
          } else {
            next.heldOtherCount += 1;
          }
        }
        if (reason === "other" && detail) {
          next.otherReasons = [
            ...next.otherReasons,
            {
              productId: reviewedProduct.id,
              title: reviewedProduct.title,
              decision: decision as "reject" | "hold",
              reasonCode: "other",
              reasonDetail: detail,
            },
          ];
        }
        return next;
      });

      setMessage(decision === "approve" ? "Produto aprovado." : decision === "reject" ? "Produto rejeitado." : "Produto colocado em espera.");
      resetDecisionPanel();
      setDetailsOpen(false);
    });
  }

  function confirmReason() {
    if (!mode || !reasonCode) {
      setMessage("Escolha um motivo para continuar.");
      return;
    }
    if (reasonCode === "other" && reasonDetail.trim().length < 3) {
      setMessage("Escreva o motivo em “Outro”.");
      return;
    }
    submit(mode, reasonCode, reasonDetail.trim() || null);
  }

  /** Adia a revisão por 7 dias, persistindo no banco via deferred_until (M4-E). */
  function reviewLater() {
    if (!current || isPending) return;
    const productToDefer = current;
    setMessage("");
    startTransition(async () => {
      const result = await deferCurationProduct(productToDefer.id, 7);
      if (!result.ok) {
        setMessage("Não foi possível adiar o produto.");
        return;
      }
      setProducts((items) => items.filter((item) => item.id !== productToDefer.id));
      resetDecisionPanel();
      setDetailsOpen(false);
      setMessage("Produto adiado por 7 dias (rever em 7 dias).");
    });
  }

  function undo() {
    if (!lastDecision || isPending) return;
    const decision = lastDecision;
    startTransition(async () => {
      const result = await undoCurationDecision(decision.product.id, decision.eventId);
      if (!result.ok) {
        setMessage("A decisão já mudou e não pode mais ser desfeita.");
        return;
      }
      setProducts((items) => [decision.product, ...items.filter((item) => item.id !== decision.product.id)]);

      // Reverter contadores do resumo da sessão
      setSessionSummary((prev) => {
        const next = { ...prev, totalDecisions: Math.max(0, prev.totalDecisions - 1) };
        if (decision.decision === "approve") {
          next.approvedCount = Math.max(0, next.approvedCount - 1);
        } else if (decision.decision === "reject") {
          next.rejectedCount = Math.max(0, next.rejectedCount - 1);
        } else if (decision.decision === "hold") {
          if (decision.reason === "family_saturation") {
            next.heldSaturationCount = Math.max(0, next.heldSaturationCount - 1);
          } else if (decision.reason === "insufficient_evidence" || decision.reason === "weak_offer") {
            next.heldEvidenceCount = Math.max(0, next.heldEvidenceCount - 1);
          } else {
            next.heldOtherCount = Math.max(0, next.heldOtherCount - 1);
          }
        }
        if (decision.reason === "other") {
          next.otherReasons = next.otherReasons.filter((r) => r.productId !== decision.product.id);
        }
        return next;
      });

      setLastDecision(null);
      setMessage("Decisão desfeita.");
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button") || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "d") setDetailsOpen((open) => !open);
      if (event.key === "Escape") resetDecisionPanel();
      if (mode || isPending) return;
      if (event.key.toLowerCase() === "a" || event.key === " ") {
        event.preventDefault();
        decide("approve");
      }
      if (event.key.toLowerCase() === "n") decide("hold");
      if (event.key.toLowerCase() === "r") decide("reject");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current?.id, isPending, mode]);

  if (!current) {
    return (
      <section className="curation-session-summary-view">
        <div className="session-summary-box">
          <span className="curation-proof">SESSÃO<br />ENCERRADA</span>
          <p className="eyebrow">Resumo da sessão</p>
          <h1>{sessionSummary.totalDecisions > 0 ? "Sessão concluída com sucesso" : "Nenhum produto pendente nesta sessão"}</h1>
          <p className="summary-subtitle">
            {sessionSummary.totalDecisions > 0
              ? `${sessionSummary.totalDecisions} decisões tomadas nesta sessão de curadoria.`
              : "A fila desta sessão foi finalizada."}
          </p>

          <div className="session-stats-grid">
            <div className="session-stat-card success">
              <span className="stat-label">Aprovados</span>
              <strong>{sessionSummary.approvedCount}</strong>
            </div>
            <div className="session-stat-card danger">
              <span className="stat-label">Rejeitados</span>
              <strong>{sessionSummary.rejectedCount}</strong>
            </div>
            <div className="session-stat-card warning">
              <span className="stat-label">Retidos por saturação</span>
              <strong>{sessionSummary.heldSaturationCount}</strong>
            </div>
            <div className="session-stat-card">
              <span className="stat-label">Retidos por evidência</span>
              <strong>{sessionSummary.heldEvidenceCount}</strong>
            </div>
            <div className="session-stat-card">
              <span className="stat-label">Outros motivos</span>
              <strong>{sessionSummary.heldOtherCount}</strong>
            </div>
          </div>

          {sessionSummary.otherReasons.length > 0 && (
            <div className="session-other-records">
              <h3>Motivos “Outro” registrados nesta sessão ({sessionSummary.otherReasons.length})</h3>
              <div className="session-other-list">
                {sessionSummary.otherReasons.map((item, idx) => (
                  <div key={idx} className="session-other-item">
                    <strong>{item.title}</strong>
                    <span className={`decision-badge ${item.decision}`}>
                      {item.decision === "reject" ? "Rejeitado" : "Em espera"}
                    </span>
                    <blockquote>“{item.reasonDetail}”</blockquote>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="session-summary-actions">
            <button type="button" className="action-primary" onClick={() => window.location.reload()}>
              Abrir nova sessão
            </button>
            <a className="action-link" href="/admin/curadoria?aba=grupos">
              Ver grupos repetitivos →
            </a>
            <a className="action-link" href="/admin">
              ← Voltar ao painel
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="curation-session-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>Mesa editorial</p>
            {queueKind === "awaiting" && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleRunTriage}
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  color: "#818cf8",
                  cursor: isPending ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
                title="Executa corte determinístico e avaliação com IA em produtos pendentes"
              >
                ⚡ Triagem com IA
              </button>
            )}
          </div>
          <h1>{awaiting.toLocaleString("pt-BR")} {queueKind === "held" ? "produtos em espera" : "produtos aguardam avaliação"}</h1>
          <p>{initialAwaiting - initialProducts.length > 0 ? `Sessão de ${sessionSize} · a fila completa tem ${initialAwaiting.toLocaleString("pt-BR")}` : `Sessão de ${sessionSize}`}</p>
        </div>
        <div className="curation-summary" aria-label="Progresso da sessão">
          <b>{reviewed}</b><span>de {sessionSize}<br />avaliados</span>
          <button type="button" className="close-session-btn" onClick={() => setSessionClosed(true)}>
            Encerrar sessão
          </button>
        </div>
      </section>

      <section className="curation-desk" aria-live="polite">
        <aside className="curation-queue" aria-label="Próximos produtos">
          <b>FILA</b>
          {products.slice(0, 6).map((product, index) => (
            <span key={product.id} className={index === 0 ? "active" : ""}>
              <i>{index === 0 ? "●" : "○"}</i>{index === 0 ? "atual" : `próximo ${index}`}
            </span>
          ))}
          {products.length > 6 && <small>+ {products.length - 6} nesta sessão</small>}
        </aside>

        <article className="curation-product">
          <span className="curation-proof">{current.status === "pending" ? "NOVO" : current.status === "held" ? "EM ESPERA" : "LEGADO"}<br />{reviewed + 1} / {sessionSize}</span>
          <div className="curation-product-main">
            <div className="curation-photo">
              {current.imageUrl ? (
                <Image src={current.imageUrl} alt={current.title} fill sizes="(max-width: 760px) calc(100vw - 32px), 340px" priority />
              ) : (
                <span>sem foto</span>
              )}
            </div>
            <div className="curation-identity">
              <p className="eyebrow">{current.marketplace} · {current.category ?? "sem categoria"}</p>
              <h2>{current.title}</h2>
              <a href={current.productUrl} target="_blank" rel="noreferrer">abrir anúncio ↗</a>
              {current.aiInsight && (
                <div
                  className="curation-ai-insight"
                  style={{
                    margin: "12px 0",
                    padding: "10px 14px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    lineHeight: "1.4",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 700, color: "#10b981" }}>
                      ⭐ Insight BizuMiner ({current.aiInsight.score}/5)
                    </span>
                    {current.aiInsight.editorialCategory && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#059669",
                          textTransform: "uppercase",
                        }}
                      >
                        {current.aiInsight.editorialCategory.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontStyle: "italic" }}>
                    “{current.aiInsight.justification}”
                  </p>
                </div>
              )}
              <p className="curation-price"><strong>{brl.format(current.priceCents / 100)}</strong>{current.originalPriceCents && current.originalPriceCents > current.priceCents ? <del>{brl.format(current.originalPriceCents / 100)}</del> : null}</p>
              <p className="curation-seen">observado em {date.format(new Date(current.observedAt))}</p>
            </div>
          </div>

          {detailsOpen && (
            <div className="curation-details">
              <dl>
                <div><dt>ID</dt><dd>{current.id}</dd></div>
                <div><dt>Na fila desde</dt><dd>{date.format(new Date(current.queuedAt))}</dd></div>
                <div><dt>Slug</dt><dd>{current.slug}</dd></div>
              </dl>
            </div>
          )}
        </article>

        <aside className="curation-evidence">
          <p className="eyebrow">Evidências</p>
          <dl>
            <div><dt>Preço atual</dt><dd>{brl.format(current.priceCents / 100)}</dd></div>
            <div><dt>Menor anterior</dt><dd>{current.previousMinPriceCents ? brl.format(current.previousMinPriceCents / 100) : "—"}</dd></div>
            <div><dt>Histórico</dt><dd>{current.observationCount} registros · {current.historyDays} dias</dd></div>
            <div><dt>Avaliação</dt><dd>{current.ratingStar?.toLocaleString("pt-BR") ?? "—"}</dd></div>
            <div><dt>Vendas</dt><dd>{current.salesLabel ?? current.salesCount?.toLocaleString("pt-BR") ?? "—"}</dd></div>
            <div><dt>Desconto do anúncio</dt><dd>{percent(current.claimedDiscountRate) ?? "—"}</dd></div>
          </dl>
          <div className="curation-signals">
            <b>SINAIS OBJETIVOS</b>
            {signals.length > 0 ? signals.map((signal) => <p key={signal}>⚠ {signal}</p>) : <p className="quiet">Nenhum alerta objetivo.</p>}
          </div>
          <button type="button" className="curation-details-toggle" onClick={() => setDetailsOpen((open) => !open)}>
            <kbd>D</kbd> {detailsOpen ? "ocultar detalhes" : "ver detalhes"}
          </button>
        </aside>
      </section>

      {mode && (
        <section className="curation-reason-panel" aria-labelledby="reason-title">
          <div>
            <p className="eyebrow">Decisão</p>
            <h2 id="reason-title">{mode === "reject" ? "Por que não entra?" : "Por que não publicar agora?"}</h2>
          </div>
          <div className="curation-reason-chips">
            {reasons.map(([code, label]) => (
              <button key={code} type="button" className={reasonCode === code ? "active" : ""} onClick={() => setReasonCode(code)}>{label}</button>
            ))}
          </div>
          {reasonCode === "other" && (
            <label className="curation-other">
              <span>Escreva o motivo — ele será preservado para a IA detectar novos padrões.</span>
              <textarea autoFocus maxLength={1000} value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} placeholder="O que este produto revela que ainda não cabe nos motivos acima?" />
              <small>{reasonDetail.length}/1000</small>
            </label>
          )}
          <div className="curation-reason-actions">
            <button type="button" onClick={resetDecisionPanel}>cancelar</button>
            <button type="button" className={mode === "reject" ? "danger" : "warning"} disabled={!reasonCode || isPending} onClick={confirmReason}>confirmar decisão</button>
          </div>
        </section>
      )}

      <footer className="curation-actions">
        <div className="curation-feedback" role="status">
          {message && <span>{message}</span>}
          {lastDecision && <button type="button" disabled={isPending} onClick={undo}>desfazer</button>}
        </div>
        <button type="button" className="approve" disabled={isPending || !!mode} onClick={() => decide("approve")}><kbd>A</kbd> Aprovar</button>
        <button type="button" className="hold" disabled={isPending || !!mode} onClick={() => decide("hold")}><kbd>N</kbd> Não publicar agora</button>
        <button type="button" className="reject" disabled={isPending || !!mode} onClick={() => decide("reject")}><kbd>R</kbd> Rejeitar</button>
        <button type="button" className="defer" disabled={isPending || !!mode} onClick={reviewLater} title="Adia a avaliação deste produto por 7 dias">Rever em 7 dias</button>
      </footer>
    </>
  );
}
