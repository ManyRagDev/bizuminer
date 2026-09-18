"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CockpitOperacional from "./cockpit-operacional.tsx";
import TriageBatchModal from "./triage-batch-modal.tsx";
import type {
  SystemOperationalPulse,
  TriageBatchHistory,
  TriageBatchItem,
} from "../../../lib/editorial-compass.ts";
import type { CaptureRunRow } from "../../../lib/admin-db.ts";
import type { TriageApplicationSummary } from "../../../lib/curation-db.ts";
import {
  getTriageBatchItemsAction,
  triggerAutoPilotTriageAction,
} from "./actions.ts";

export default function PipelineView({
  triageBatches,
  operationalPulse,
  captureRuns,
}: {
  triageBatches?: TriageBatchHistory[];
  operationalPulse?: SystemOperationalPulse;
  captureRuns?: CaptureRunRow[];
}) {
  const router = useRouter();

  // Estado do disparo manual da triagem
  const [isTriaging, startTriaging] = useTransition();
  const [triageBatchSize, setTriageBatchSize] = useState(50);
  const [triageSummary, setTriageSummary] = useState<TriageApplicationSummary | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);

  // Estado do Modal de Inspeção de Lote
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [inspectBatchTime, setInspectBatchTime] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<TriageBatchItem[]>([]);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);

  const handleInspectBatch = async (batchId: string, runTime: string) => {
    setInspectBatchTime(runTime);
    setIsBatchModalOpen(true);
    setIsLoadingBatch(true);
    try {
      const res = await getTriageBatchItemsAction(batchId);
      if (res.ok && res.items) {
        setBatchItems(res.items);
      } else {
        setBatchItems([]);
      }
    } catch {
      setBatchItems([]);
    } finally {
      setIsLoadingBatch(false);
    }
  };

  const handleRunTriage = () => {
    setTriageSummary(null);
    setTriageError(null);
    startTriaging(async () => {
      const res = await triggerAutoPilotTriageAction(triageBatchSize);
      if (res.ok) {
        setTriageSummary(res.summary);
        router.refresh();
      } else {
        setTriageError(res.error === "triage_in_progress" ? "Já existe uma triagem em andamento. Aguarde a conclusão antes de iniciar outra." : `Falha na triagem: ${res.error}`);
      }
    });
  };

  return (
    <div className="pipeline-view-container">
      <nav className="section-local-nav" aria-label="Operação">
        <a href="/admin?aba=rodagens">Capturas e histórico</a>
        <a href="/admin?aba=captura-manual">Captura manual</a>
        <a className="active" href="/admin/curadoria?aba=pipeline">Execuções da IA</a>
      </nav>
      {/* Banner Superior do Pipeline */}
      <section className="pipeline-header-banner" aria-label="Pipeline de Triagem e Telemetria">
        <div className="pipeline-banner-content">
          <span className="pipeline-badge">Pipeline Automatizado</span>
          <h2>Esteira de IA & Histórico de Execuções</h2>
          <p>
            Dispare varreduras manuais da IA sobre a fila de produtos pendentes, acompanhe lotes recentes e inspecione decisões com base na Bússola Editorial.
          </p>
        </div>
        <div className="pipeline-banner-actions">
          <a href="/admin/curadoria?aba=bussola" className="btn-secondary-link">
            🧭 Ajustar critérios da IA →
          </a>
        </div>
      </section>

      {/* Caixa de Ação de Disparo Imediato */}
      <section className="pipeline-trigger-section" aria-label="Disparo manual de triagem">
        <div className="trigger-card">
          <div className="trigger-card-info">
            <p className="eyebrow">Ação Operacional</p>
            <h3>⚡ Disparar Triagem Imediata</h3>
            <p>
              Avalia os produtos capturados que aguardam triagem. O Gemini 2.5 Flash aplica os critérios de corte (piso de R$ 20, anti-saturação) e atribui nota de 1 a 5 com justificativa.
            </p>
          </div>

          <div className="trigger-controls">
            <div className="trigger-input-group">
              <label htmlFor="batch-size-select">Tamanho do lote:</label>
              <select
                id="batch-size-select"
                value={triageBatchSize}
                onChange={(e) => setTriageBatchSize(Number(e.target.value))}
                disabled={isTriaging}
              >
                <option value={20}>20 produtos pendentes</option>
                <option value={50}>50 produtos pendentes</option>
                <option value={100}>100 produtos pendentes</option>
              </select>
            </div>

            <button
              type="button"
              className="btn-trigger-action"
              onClick={handleRunTriage}
              disabled={isTriaging}
            >
              {isTriaging ? "Processando lote com IA..." : "Rodar Triagem com IA"}
            </button>
          </div>
        </div>

        {/* Loading Banner */}
        {isTriaging && (
          <div className="triage-loading-banner" role="status" aria-live="polite">
            <span className="triage-spinner" aria-hidden="true" />
            <div>
              <strong>Triagem em andamento com o Gemini 2.5 Flash...</strong>
              <p>
                O pipeline está filtrando piso de ticket, calculando saturação e consultando a inteligência artificial. Isso leva cerca de 10 a 20 segundos.
              </p>
            </div>
          </div>
        )}

        {/* Erro */}
        {triageError && <div className="triage-error">{triageError}</div>}

        {/* Resumo do Lote Processado */}
        {triageSummary && (
          <div className="triage-summary-card">
            <div className="summary-card-header">
              <h4>✓ Lote Concluído com Sucesso</h4>
            </div>
            <div className="summary-stat-grid">
              <div><span>Processados no lote:</span> <b>{triageSummary.processed}</b></div>
              <div className="stat-approved"><span>Aprovados no Piloto:</span> <b>{triageSummary.approved}</b></div>
              <div className="stat-rejected"><span>Rejeitados:</span> <b>{triageSummary.rejected}</b></div>
              <div className="stat-held"><span>Retidos para revisão:</span> <b>{triageSummary.held}</b></div>
              <div className="stat-pending"><span>Pendentes (com nota):</span> <b>{triageSummary.annotatedPending}</b></div>
            </div>
            <div className="summary-explanation">
              {triageSummary.approved > 0 ? (
                <p className="approved-notice">
                  🎉 <strong>{triageSummary.approved} produto(s)</strong> atingiram nota alta e foram publicados automaticamente!
                  Você pode conferir a amostra na <a href="/admin/curadoria?aba=auditoria">Auditoria de hoje →</a>
                </p>
              ) : (
                <p className="no-approved-notice">
                  ℹ️ Neste lote de {triageSummary.processed} itens avaliados, {triageSummary.held > 0 ? `${triageSummary.held} tinham ticket menor que R$ 20,00 ou eram variações repetidas retidas por saturação` : "nenhum atingiu a nota mínima de corte para auto-publicação"}.
                  <strong> Rode mais um lote</strong> para triar os próximos produtos da fila!
                </p>
              )}
            </div>

            <div className="summary-card-actions">
              <button
                type="button"
                className="btn-inspect-summary"
                onClick={() => {
                  if (triageSummary.triageRunId) {
                    handleInspectBatch(triageSummary.triageRunId, new Date().toISOString());
                  } else if (triageBatches && triageBatches.length > 0) {
                    handleInspectBatch(triageBatches[0].batchId, triageBatches[0].runTime);
                  }
                }}
              >
                🔍 Inspecionar os {triageSummary.processed} produtos avaliados neste lote →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Histórico e Telemetria */}
      {operationalPulse && (
        <CockpitOperacional
          pulse={operationalPulse}
          triageBatches={triageBatches ?? []}
          captureRuns={captureRuns ?? []}
          onInspectBatch={handleInspectBatch}
        />
      )}

      {/* Modal de Inspeção Detalhada do Lote */}
      <TriageBatchModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        batchTime={inspectBatchTime}
        items={batchItems}
        isLoading={isLoadingBatch}
      />
    </div>
  );
}
