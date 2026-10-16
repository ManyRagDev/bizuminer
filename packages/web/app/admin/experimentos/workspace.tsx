"use client";
import { selectAccountAction } from "../account-actions.ts";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserAccountMembership } from "../../../lib/account-context.ts";
import type { PolicyExperiment } from "../../../lib/experiment-contract.ts";
import {
  createPolicyExperimentAction,
  approveMethodAction,
  approveCandidateAction,
  recordPairAction,
  calculateCohortMetricsAction,
  reviewPolicyExperimentAction,
  promotePolicyExperimentAction,
  rollbackPolicyExperimentAction,
  exportExperimentCsvAction,
} from "./actions.ts";

export default function ExperimentWorkspace({
  accounts,
  tenantId,
  isOwner,
  experiments,
}: {
  accounts: UserAccountMembership[];
  tenantId: string;
  isOwner: boolean;
  experiments: PolicyExperiment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [metricsMap, setMetricsMap] = useState<Record<string, any>>({});

  // Formulário de novo experimento
  const [baselineVersion, setBaselineVersion] = useState("v1.0.0");
  const [candidateVersion, setCandidateVersion] = useState("v1.1.0");
  const [hypothesis, setHypothesis] = useState("");
  const [primaryMetric, setPrimaryMetric] = useState("rubric_score");
  const [minSample, setMinSample] = useState(0);
  const [policyId, setPolicyId] = useState("");

  // Estados de modais/justificativas
  const [actionExperimentId, setActionExperimentId] = useState<string | null>(
    null,
  );
  const [rationale, setRationale] = useState("");
  const [activeAction, setActiveAction] = useState<
    "review" | "promote" | "rollback" | null
  >(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createPolicyExperimentAction({
        tenantId,
        audiencePolicyId: policyId,
        baselineVersion,
        candidateVersion,
        hypothesis,
        primaryMetric,
        minSample,
      });
      if (res.ok) {
        setMessage(`Experimento criado com sucesso! ID: ${res.experimentId}`);
        setHypothesis("");
        router.refresh();
      } else {
        setMessage(`Erro ao criar experimento: ${res.error}`);
      }
    });
  };

  const handleCalculateMetrics = (experimentId: string) => {
    startTransition(async () => {
      const res = await calculateCohortMetricsAction({
        experimentId,
        tenantId,
      });
      if (res.ok) {
        setMetricsMap((prev) => ({ ...prev, [experimentId]: res }));
        setMessage("Métricas de coorte calculadas com sucesso.");
      } else {
        setMessage(`Erro ao calcular métricas: ${res.error}`);
      }
    });
  };

  const handleExportCsv = (experimentId: string) => {
    startTransition(async () => {
      const res = await exportExperimentCsvAction({ experimentId, tenantId });
      if (res.ok) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = res.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage("Metodologia exportada em CSV.");
      } else {
        setMessage(`Erro ao exportar: ${res.error}`);
      }
    });
  };

  const executeModalAction = () => {
    if (!actionExperimentId || !rationale.trim() || !activeAction) return;

    startTransition(async () => {
      if (activeAction === "review") {
        const res = await reviewPolicyExperimentAction({
          experimentId: actionExperimentId,
          decision: "reviewed",
          rationale,
          tenantId,
        });
        if (res.ok) setMessage("Experimento revisado com sucesso.");
        else setMessage(`Erro ao revisar: ${res.error}`);
      } else if (activeAction === "promote") {
        const res = await promotePolicyExperimentAction({
          experimentId: actionExperimentId,
          promotionRationale: rationale,
          tenantId,
        });
        if (res.ok)
          setMessage(
            `Versão candidata ${res.candidateVersion} promovida com sucesso!`,
          );
        else setMessage(`Erro ao promover: ${res.error}`);
      } else if (activeAction === "rollback") {
        const res = await rollbackPolicyExperimentAction({
          experimentId: actionExperimentId,
          rollbackRationale: rationale,
          tenantId,
        });
        if (res.ok)
          setMessage(
            `Rollback executado com sucesso. Versão restaurada: ${res.restoredVersion}`,
          );
        else setMessage(`Erro no rollback: ${res.error}`);
      }
      setActionExperimentId(null);
      setRationale("");
      setActiveAction(null);
      router.refresh();
    });
  };

  return (
    <section className="admin-panel">
      <h1>Governança e Experimentos de Políticas</h1>
      <p style={{ color: "#666" }}>
        Comparação pareada de versões sobre fatos congelados, métricas de coorte
        e governança auditável com checagem de papéis (C-08).
      </p>

      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <label>
          Conta{" "}
          <select
            value={tenantId}
            onChange={async (e) => {
              const target = e.target.value;
              if ((await selectAccountAction(target)).ok) {
                router.push(
                  `/admin/experimentos?conta=${encodeURIComponent(target)}`,
                );
                router.refresh();
              }
            }}
          >
            {accounts.map((a) => (
              <option key={a.affiliateId} value={a.tenantId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <span
          style={{
            fontSize: "0.875rem",
            color: isOwner ? "#28a745" : "#6c757d",
          }}
        >
          Papel:{" "}
          {isOwner
            ? "Owner (Pode promover e autorizar)"
            : "Operador (Apenas revisão)"}
        </span>
      </div>

      {message && (
        <p
          role="status"
          style={{
            fontWeight: "bold",
            padding: "0.5rem",
            background: "#f0f0f0",
            borderRadius: "4px",
          }}
        >
          {message}
        </p>
      )}

      {/* Formulário de Criação */}
      <form
        onSubmit={handleCreate}
        style={{
          padding: "1rem",
          background: "#fcfcfc",
          border: "1px solid #e0e0e0",
          borderRadius: "6px",
          marginBottom: "1.5rem",
        }}
      >
        <h3>Nova comparação pareada de políticas</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <label>
            Versão Baseline (A)
            <input
              aria-label="ID da política"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              required
            />
            <input
              value={baselineVersion}
              onChange={(e) => setBaselineVersion(e.target.value)}
              required
            />
          </label>
          <label>
            Versão Candidata (B)
            <input
              value={candidateVersion}
              onChange={(e) => setCandidateVersion(e.target.value)}
              required
            />
          </label>
          <label>
            Métrica Primária
            <select
              value={primaryMetric}
              onChange={(e) => setPrimaryMetric(e.target.value)}
            >
              <option value="rubric_score">
                Pontuação da Rubrica (rubric_score)
              </option>
            </select>
          </label>
          <label>
            Amostra Mínima
            <input
              type="number"
              min={1}
              value={minSample}
              onChange={(e) => setMinSample(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          Hipótese de Impacto
          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            rows={2}
            placeholder="Descreva a diferença observável esperada no mesmo conjunto de produtos e fatos."
            required
            style={{ width: "100%" }}
          />
        </label>
        <button type="submit" disabled={pending}>
          Criar Experimento em Rascunho
        </button>
      </form>

      {/* Tabela de Experimentos */}
      <h2>Experimentos Ativos e Histórico</h2>
      {experiments.length === 0 ? (
        <p>Nenhum experimento registrado para esta conta.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {experiments.map((exp) => {
            const metrics = metricsMap[exp.id];
            return (
              <article
                key={exp.id}
                style={{
                  padding: "1rem",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 0.25rem 0" }}>
                      {exp.hypothesis}
                    </h3>
                    <p
                      style={{ margin: 0, fontSize: "0.875rem", color: "#666" }}
                    >
                      Baseline: <code>{exp.baselineVersion}</code> vs Candidata:{" "}
                      <code>{exp.candidateVersion}</code> · Métrica:{" "}
                      <code>{exp.primaryMetric}</code> · Amostra Mínima:{" "}
                      {exp.minSample}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                      fontWeight: "bold",
                      background:
                        exp.status === "promoted"
                          ? "#d4edda"
                          : exp.status === "reviewed"
                            ? "#d1ecf1"
                            : "#fff3cd",
                      color:
                        exp.status === "promoted"
                          ? "#155724"
                          : exp.status === "reviewed"
                            ? "#0c5460"
                            : "#856404",
                    }}
                  >
                    {exp.status.toUpperCase()}
                  </span>
                </div>

                {isOwner &&
                  ["draft", "shadow", "reviewed"].includes(exp.status) && (
                    <form
                      action={(f) =>
                        startTransition(async () => {
                          const r = await approveCandidateAction({
                            tenantId,
                            experimentId: exp.id,
                            rationale: String(f.get("rationale")),
                          });
                          setMessage(
                            r.ok
                              ? "Candidata aprovada; política ativa preservada."
                              : (r.error ?? "Falha"),
                          );
                          router.refresh();
                        })
                      }
                    >
                      <label>
                        Justificativa da aprovação da candidata{" "}
                        <input name="rationale" required />
                      </label>
                      <button disabled={pending}>
                        Aprovar candidata sem ativar
                      </button>
                    </form>
                  )}
                {/* Métricas calculadas se houver */}
                {metrics && (
                  <div
                    style={{
                      margin: "0.75rem 0",
                      padding: "0.5rem",
                      background: "#f8f9fa",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                    }}
                  >
                    <strong>Métricas da Coorte:</strong> Total observado:{" "}
                    {metrics.sampleSize} unidades.
                    <br />
                    Baseline ({exp.baselineVersion}):{" "}
                    {metrics.baselineMetric.value !== null
                      ? metrics.baselineMetric.value.toFixed(2)
                      : "N/D"}{" "}
                    (n={metrics.baselineMetric.sampleSize}) · Candidata (
                    {exp.candidateVersion}):{" "}
                    {metrics.candidateMetric.value !== null
                      ? metrics.candidateMetric.value.toFixed(2)
                      : "N/D"}{" "}
                    (n={metrics.candidateMetric.sampleSize})
                  </div>
                )}

                {/* Botões de Ação */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginTop: "0.75rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCalculateMetrics(exp.id)}
                    disabled={pending}
                  >
                    📊 Calcular Métricas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv(exp.id)}
                    disabled={pending}
                  >
                    📥 Exportar CSV
                  </button>

                  {exp.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionExperimentId(exp.id);
                        setActiveAction("review");
                        setRationale("");
                      }}
                      disabled={pending}
                    >
                      ✓ Marcar como Revisado
                    </button>
                  )}

                  {exp.status === "draft" && isOwner && (
                    <form
                      action={(f) =>
                        startTransition(async () => {
                          try {
                            const r = await approveMethodAction({
                              tenantId,
                              experimentId: exp.id,
                              method: {
                                design: "paired",
                                cohort: String(f.get("cohort")),
                                windowStart: new Date(
                                  String(f.get("start")),
                                ).toISOString(),
                                windowEnd: new Date(
                                  String(f.get("end")),
                                ).toISOString(),
                                minPairs: Number(f.get("min")),
                                minimumDelta: Number(f.get("delta")),
                                rationale: String(f.get("reason")),
                              },
                            });
                            setMessage(
                              r.ok
                                ? "Método aprovado e congelado antes das medições."
                                : r.error,
                            );
                            router.refresh();
                          } catch (e) {
                            setMessage(String(e));
                          }
                        })
                      }
                    >
                      <h4>Protocolo de comparação pareada</h4>
                      <input
                        name="cohort"
                        aria-label="Definição da coorte"
                        required
                      />
                      <input
                        name="start"
                        aria-label="Início da janela"
                        type="datetime-local"
                        required
                      />
                      <input
                        name="end"
                        aria-label="Fim da janela"
                        type="datetime-local"
                        required
                      />
                      <input
                        name="min"
                        aria-label="Pares mínimos aprovados"
                        type="number"
                        min="1"
                        required
                      />
                      <input
                        name="delta"
                        aria-label="Diferença mínima aprovada"
                        type="number"
                        step="any"
                        required
                      />
                      <textarea
                        name="reason"
                        aria-label="Justificativa metodológica"
                        required
                      />
                      <button disabled={pending}>Aprovar método</button>
                    </form>
                  )}
                  {exp.status === "shadow" && (
                    <form
                      action={(f) =>
                        startTransition(async () => {
                          const r = await recordPairAction({
                            tenantId,
                            experimentId: exp.id,
                            productId: String(f.get("product")),
                            baseline: Number(f.get("base")),
                            candidate: Number(f.get("candidate")),
                            metric: exp.primaryMetric,
                          });
                          setMessage(
                            r.ok
                              ? "Par de medições registrado sobre fatos congelados."
                              : r.error,
                          );
                          router.refresh();
                        })
                      }
                    >
                      <label>
                        Produto da coorte <input name="product" required />
                      </label>
                      <label>
                        Medição baseline{" "}
                        <input name="base" type="number" step="any" required />
                      </label>
                      <label>
                        Medição candidata{" "}
                        <input
                          name="candidate"
                          type="number"
                          step="any"
                          required
                        />
                      </label>
                      <button disabled={pending}>
                        Registrar par observado
                      </button>
                    </form>
                  )}
                  {exp.status === "reviewed" && isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionExperimentId(exp.id);
                        setActiveAction("promote");
                        setRationale("");
                      }}
                      disabled={pending}
                      style={{
                        background: "#28a745",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      🚀 Promover Candidata a Produção
                    </button>
                  )}

                  {exp.status === "promoted" && isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionExperimentId(exp.id);
                        setActiveAction("rollback");
                        setRationale("");
                      }}
                      disabled={pending}
                      style={{
                        background: "#dc3545",
                        color: "#fff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      ↺ Rollback para Baseline
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal / Dialog de Justificativa Auditável */}
      {actionExperimentId && activeAction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "1.5rem",
              borderRadius: "6px",
              maxWidth: "500px",
              width: "90%",
            }}
          >
            <h3>
              {activeAction === "review" && "Revisar Experimento"}
              {activeAction === "promote" &&
                "Promover Política (Exige Papel Owner)"}
              {activeAction === "rollback" && "Rollback de Política"}
            </h3>
            <p style={{ fontSize: "0.875rem", color: "#555" }}>
              Registre a justificativa auditável que será gravada no log de
              eventos do domínio (C-08).
            </p>
            <textarea
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Descreva a razão técnica/estatística para esta ação..."
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActionExperimentId(null);
                  setActiveAction(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeModalAction}
                disabled={pending || !rationale.trim()}
                style={{
                  background:
                    activeAction === "promote"
                      ? "#28a745"
                      : activeAction === "rollback"
                        ? "#dc3545"
                        : "#0070f3",
                  color: "#fff",
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
