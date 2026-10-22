"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SpotCheckProduct } from "../../../lib/editorial-compass.ts";
import type { RubricPromotionMetrics } from "../../../lib/rubric-db.ts";
import type { RubricLevel } from "../../../lib/rubric-contract.ts";
import {
  confirmSpotCheckAction,
  rejectSpotCheckAction,
} from "../direcionamento/actions.ts";
import {
  submitHumanRubricReviewAction,
  reopenHumanReviewAction, runShadowEvaluationAction,
  fetchComparisonSampleAction,
  fetchRubricPromotionMetricsAction,
} from "./actions.ts";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function SpotCheckView({
  initialProducts,
  initialReviewed,
  dailyTarget,
  initialRubricMetrics,
}: {
  initialProducts: SpotCheckProduct[];
  initialReviewed: number;
  dailyTarget: number;
  initialRubricMetrics?: RubricPromotionMetrics | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SpotCheckProduct[]>(initialProducts);
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Rubric spot-check state (CF-17 / D06)
  const [rubricMetrics, setRubricMetrics] =
    useState<RubricPromotionMetrics | null>(initialRubricMetrics ?? null);
  const [activeRubricId, setActiveRubricId] = useState<string | null>(null);
  const [qualityLevel, setQualityLevel] = useState<RubricLevel>("adequate");
  const [valueLevel, setValueLevel] = useState<RubricLevel>("adequate");
  const [audienceLevel, setAudienceLevel] = useState<RubricLevel>("adequate");
  const [evidenceLevel, setEvidenceLevel] = useState<RubricLevel>("adequate");
  const [rubricNotes, setRubricNotes] = useState("");
  const [isSubmittingRubric, setIsSubmittingRubric] = useState(false);
  const [rubricFeedback, setRubricFeedback] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const handleRubricSubmit = async (productId: string) => {
    if (!rubricNotes.trim()) {
      setRubricFeedback("Registre a justificativa da avaliação.");
      return;
    }
    setIsSubmittingRubric(true);
    setRubricFeedback(null);
    try {
      const res = await submitHumanRubricReviewAction({
        productId,
        requestId: crypto.randomUUID(),
        assessment: {
          schemaVersion: 2,
          quality: { level: qualityLevel, reason: rubricNotes.trim() },
          value: { level: valueLevel, reason: rubricNotes.trim() },
          audience: { level: audienceLevel, reason: rubricNotes.trim() },
          evidenceConfidence: {
            level: evidenceLevel,
            reason: rubricNotes.trim(),
          },
          factsUsed: [],
          inferences: [],
          unknowns: [],
          safetyFlags: [],
          policyVersion: "1.0.0",
          evidenceDigest: `cockpit-review-${productId}`,
          createdAt: new Date().toISOString(),
        },
        notes: rubricNotes.trim() || undefined,
      });

      if (res.ok) {
        setRubricFeedback(
          res.agreement
            ? "✓ Revisão gravada! Em total concordância com o shadow de IA."
            : `✓ Revisão gravada! Registrado desacordo em ${res.disagreementCount} dimensões.`,
        );
        // Atualizar métricas
        const updatedMetrics = await fetchRubricPromotionMetricsAction();
        if (updatedMetrics.ok) {
          setRubricMetrics(updatedMetrics.metrics);
        }
        setTimeout(() => {
          setActiveRubricId(null);
          setRubricFeedback(null);
          setRubricNotes("");
        }, 2500);
      } else {
        setRubricFeedback(`Erro: ${res.error}`);
      }
    } catch (err) {
      setRubricFeedback(
        `Falha: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsSubmittingRubric(false);
    }
  };

  const handleExportSampleCsv = async () => {
    setIsExportingCsv(true);
    try {
      const res = await fetchComparisonSampleAction({ limit: 100 });
      if (res.ok && res.sample.length > 0) {
        const headers = [
          "id",
          "productId",
          "marketplace",
          "agreement",
          "disagreements",
          "quality",
          "value",
          "audience",
          "reviewedBy",
          "reviewedAt",
        ];
        const rows = res.sample.map((s) => [
          s.id,
          s.productId,
          s.marketplace,
          s.agreement ? "sim" : "nao",
          s.disagreements.length,
          s.aiLevels.quality,
          s.aiLevels.value,
          s.aiLevels.audience,
          s.reviewedByAppUserId,
          s.reviewedAt,
        ]);
        const csvContent = [
          headers.join(","),
          ...rows.map((r) => r.join(",")),
        ].join("\n");
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rubric-comparison-sample-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert("Nenhuma amostra de comparação encontrada para exportar.");
      }
    } catch (err) {
      alert(
        `Erro ao exportar CSV: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleDismiss = async (productId: string) => {
    setIsConfirming(true);
    try {
      const res = await confirmSpotCheckAction({
        productId,
        sourceEventId: items.find((item) => item.id === productId)!
          .sourceEventId,
      });
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== productId));
        setReviewed((value) => value + 1);
        router.refresh();
      } else alert(`Erro ao confirmar produto: ${res.error}`);
    } catch (err) {
      alert(
        `Falha na comunicação: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmReject = async (productId: string) => {
    if (!rejectFeedback.trim()) return;
    setIsRejecting(true);
    try {
      const res = await rejectSpotCheckAction({
        productId,
        sourceEventId: items.find((item) => item.id === productId)!
          .sourceEventId,
        feedback: rejectFeedback.trim(),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== productId));
        setReviewed((value) => value + 1);
        router.refresh();
        setRejectingId(null);
        setRejectFeedback("");
      } else {
        alert(`Erro ao rejeitar produto: ${res.error}`);
      }
    } catch (err) {
      alert(
        `Falha na comunicação: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="spotcheck-view-container">
      <div className="spotcheck-intro">
        <div className="daily-audit-title-row">
          <div>
            <p className="eyebrow">Qualidade da IA · opcional</p>
            <h3>Conferir aprovações recentes</h3>
          </div>
          <strong
            className={
              reviewed >= dailyTarget
                ? "daily-audit-count complete"
                : "daily-audit-count"
            }
          >
            {Math.min(reviewed, dailyTarget)}/{dailyTarget}
          </strong>
        </div>
        <p>
          Amostra de até 12 aprovações da IA nos últimos sete dias, com oferta
          recente. Confira a decisão e registre correções quando necessário.
          Essa conferência não bloqueia a seleção nem a pauta.
        </p>
        <div
          className="daily-audit-progress"
          role="progressbar"
          aria-label="Progresso da auditoria de hoje"
          aria-valuemin={0}
          aria-valuemax={dailyTarget}
          aria-valuenow={Math.min(reviewed, dailyTarget)}
        >
          <span
            style={{
              width: `${Math.min(100, dailyTarget ? (reviewed / dailyTarget) * 100 : 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Painel de Calibração de Rubricas e Gate G-RUBRIC (CF-17 / D06) */}
      <div
        className="rubric-calibration-panel"
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontSize: 16 }}>
              Calibração de Rubricas e Shadow AI (G-RUBRIC)
            </h4>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
              Status:{" "}
              <strong>
                {rubricMetrics?.status === "ratified"
                  ? "Ratificação humana registrada"
                  : "Modo Sombra (Calibração)"}
              </strong>{" "}
              · Amostra auditada: {rubricMetrics?.totalReviewed ?? 0}/
              {rubricMetrics?.sampleSizeTarget ?? "meta não aprovada"} ·
              Concordância:{" "}
              {rubricMetrics
                ? Math.round(rubricMetrics.agreementRate * 100)
                : 0}
              % (meta:{" "}
              {rubricMetrics?.minAgreementRateTarget == null
                ? "não aprovada"
                : Math.round(rubricMetrics.minAgreementRateTarget * 100) + "%"}
              )
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportSampleCsv}
            disabled={isExportingCsv}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
          >
            {isExportingCsv
              ? "Exportando..."
              : "📥 Baixar Amostra de Calibração (CSV)"}
          </button>
        </div>
      </div>

      {dailyTarget === 0 ? (
        <div className="empty-state-box">
          <p>
            Não há aprovações recentes da IA para conferir. Você pode seguir
            para a seleção e a pauta.
          </p>
          <a href="/admin/curadoria?aba=selecao">Ver seleção →</a>
        </div>
      ) : reviewed >= dailyTarget ? (
        <div className="empty-state-box daily-audit-complete">
          <p className="eyebrow">Rotina concluída</p>
          <h3>Amostra concluída</h3>
          <p>
            Você conferiu a amostra disponível. Novas aprovações podem entrar
            numa próxima visita.
          </p>
          <a className="admin-curation-start" href="/pauta">
            Preparar pauta de Stories →
          </a>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state-box">
          <p>A amostra disponível terminou. A pauta continua acessível.</p>
        </div>
      ) : (
        <div className="spotcheck-grid">
          {items.map((item) => (
            <article key={item.id} className="spotcheck-item">
              <div className="item-photo">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 240px"
                  />
                ) : (
                  <div className="photo-placeholder">Sem foto</div>
                )}
                <span className="marketplace-tag">{item.marketplace}</span>
                <span className="score-badge">⭐ {item.aiScore}/5</span>
              </div>

              <div className="item-body">
                <h4 title={item.title}>
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                  </a>
                </h4>

                <div className="item-meta">
                  <span className="item-price">
                    {brl.format(item.priceCents / 100)}
                  </span>
                  {item.editorialCategory && (
                    <span className="editorial-cat-pill">
                      {item.editorialCategory}
                    </span>
                  )}
                </div>

                <p className="ai-justification" title={item.aiJustification}>
                  <em>&quot;{item.aiJustification}&quot;</em>
                </p>

                {rejectingId === item.id ? (
                  <div className="reject-form">
                    <label htmlFor={"reject-input-" + item.id}>
                      Por que descartar este item?
                    </label>
                    <input
                      id={"reject-input-" + item.id}
                      type="text"
                      placeholder="Ex: Peça avulsa / muito nichado / preço alto..."
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      autoFocus
                    />
                    <div className="reject-actions">
                      <button
                        type="button"
                        className="btn-confirm-reject"
                        disabled={isRejecting || !rejectFeedback.trim()}
                        onClick={() => handleConfirmReject(item.id)}
                      >
                        {isRejecting ? "Rejeitando..." : "Confirmar Rejeição"}
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectFeedback("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="item-actions">
                    <button
                      type="button"
                      className="btn-spot-ok"
                      disabled={isConfirming || isRejecting}
                      onClick={() => void handleDismiss(item.id)}
                      title="Confirmar aprovação deste produto na amostragem"
                    >
                      {isConfirming ? "Salvando..." : "✓ Manter"}
                    </button>
                    <button
                      type="button"
                      className="btn-spot-reject"
                      disabled={isConfirming || isRejecting}
                      onClick={() => {
                        setRejectingId(item.id);
                        setRejectFeedback("");
                      }}
                      title="Rejeitar este produto e registrar um exemplo para as próximas triagens"
                    >
                      ✕ Corrigir aprovação
                    </button>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 12,
                    borderTop: "1px dashed #e2e8f0",
                    paddingTop: 8,
                  }}
                >
                  {activeRubricId === item.id ? (
                    <div
                      className="rubric-review-box"
                      style={{
                        background: "#f1f5f9",
                        padding: 12,
                        borderRadius: 6,
                      }}
                    >
                      <button type="button" disabled={isSubmittingRubric} onClick={async()=>{setIsSubmittingRubric(true);try{const r=await runShadowEvaluationAction({productId:item.id});setRubricFeedback(r.ok?"Análise em sombra salva; comparação usa a avaliação humana compatível.":r.error);router.refresh();}finally{setIsSubmittingRubric(false);}}}>Comparar em sombra</button>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await reopenHumanReviewAction(item.id);
                          if (r.assessment) {
                            setQualityLevel(r.assessment.quality.level);
                            setValueLevel(r.assessment.value.level);
                            setAudienceLevel(r.assessment.audience.level);
                            setEvidenceLevel(
                              r.assessment.evidenceConfidence.level,
                            );
                            setRubricNotes(r.assessment.quality.reason);
                            setRubricFeedback(
                              "Avaliação salva reaberta: " +
                                r.assessment.policyVersion,
                            );
                            setActiveRubricId(item.id);
                          } else
                            setRubricFeedback(
                              "Nenhuma avaliação humana salva para este produto.",
                            );
                        }}
                      >
                        Reabrir avaliação salva
                      </button>
                      <h5 style={{ margin: "0 0 8px 0", fontSize: 13 }}>
                        Auditar com Rubrica Editorial (EP-02)
                      </h5>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <label>
                          Qualidade:
                          <select
                            value={qualityLevel}
                            onChange={(e) =>
                              setQualityLevel(e.target.value as RubricLevel)
                            }
                            style={{ width: "100%", padding: 4 }}
                          >
                            <option value="weak">Fraca</option>
                            <option value="adequate">Adequada</option>
                            <option value="strong">Forte</option>
                          </select>
                        </label>
                        <label>
                          Valor:
                          <select
                            value={valueLevel}
                            onChange={(e) =>
                              setValueLevel(e.target.value as RubricLevel)
                            }
                            style={{ width: "100%", padding: 4 }}
                          >
                            <option value="weak">Fraco</option>
                            <option value="adequate">Adequado</option>
                            <option value="strong">Forte</option>
                          </select>
                        </label>
                        <label>
                          Audiência:
                          <select
                            value={audienceLevel}
                            onChange={(e) =>
                              setAudienceLevel(e.target.value as RubricLevel)
                            }
                            style={{ width: "100%", padding: 4 }}
                          >
                            <option value="weak">Fraca</option>
                            <option value="adequate">Adequada</option>
                            <option value="strong">Forte</option>
                          </select>
                        </label>
                        <label>
                          Evidência:
                          <select
                            value={evidenceLevel}
                            onChange={(e) =>
                              setEvidenceLevel(e.target.value as RubricLevel)
                            }
                            style={{ width: "100%", padding: 4 }}
                          >
                            <option value="weak">Fraca</option>
                            <option value="adequate">Adequada</option>
                            <option value="strong">Forte</option>
                          </select>
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="Notas da auditoria (opcional)..."
                        value={rubricNotes}
                        onChange={(e) => setRubricNotes(e.target.value)}
                        style={{
                          width: "100%",
                          padding: 6,
                          margin: "8px 0",
                          fontSize: 12,
                        }}
                      />
                      {rubricFeedback && (
                        <div
                          style={{
                            fontSize: 12,
                            margin: "4px 0",
                            color: rubricFeedback.startsWith("✓")
                              ? "#16a34a"
                              : "#dc2626",
                          }}
                        >
                          {rubricFeedback}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleRubricSubmit(item.id)}
                          disabled={isSubmittingRubric}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            background: "#0f172a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          {isSubmittingRubric
                            ? "Gravando..."
                            : "Gravar Rubrica"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRubricId(null);
                            setRubricFeedback(null);
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            background: "transparent",
                            border: "1px solid #cbd5e1",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRubricId(item.id);
                        setRubricFeedback(null);
                      }}
                      style={{
                        fontSize: 12,
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      ⚖ Avaliar Rubrica 4D (Sombra IA)
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
