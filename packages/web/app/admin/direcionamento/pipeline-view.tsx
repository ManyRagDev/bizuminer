"use client";

import { useState } from "react";
import ExecutionHistory from "./execution-history.tsx";
import TriageBatchModal from "./triage-batch-modal.tsx";
import type {
  TriageBatchHistory,
  TriageBatchItem,
} from "../../../lib/editorial-compass.ts";
import type { CaptureRunRow } from "../../../lib/admin-db.ts";
import { getTriageBatchItemsAction } from "./actions.ts";

export default function PipelineView({
  triageBatches,
  captureRuns,
  automatic = false,
  tenantId,
}: {
  triageBatches?: TriageBatchHistory[];
  captureRuns?: CaptureRunRow[];
  automatic?: boolean;
  tenantId?: string;
}) {
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

  return (
    <div className="pipeline-view-container">
      {/* Banner Superior do Pipeline */}
      <section
        className="pipeline-header-banner"
        aria-label="Histórico da curadoria"
      >
        <div className="pipeline-banner-content">
          <h2>{automatic ? "Histórico da triagem anterior" : "Histórico de execução"}</h2>
          <p>
            {automatic ? "Estes registros pertencem ao fluxo anterior. Eles não representam a fila atual da curadoria automática."
              : "Consulte execuções e os motivos das decisões. A triagem e a revisão ficam na rotina da Curadoria."}
          </p>
        </div>
      </section>

      <p className="curation-muted">
        <a href={`/admin/curadoria?${new URLSearchParams({aba:"selecao",...(tenantId ? {conta:tenantId} : {})})}`}>
          {automatic ? "Acompanhar curadoria automática" : "Triar com IA na Seleção"}
        </a>. Este histórico permite inspecionar resultados anteriores.
      </p>

      {/* Histórico e Telemetria */}
      <ExecutionHistory
        triageBatches={triageBatches ?? []}
        captureRuns={captureRuns ?? []}
        onInspectBatch={handleInspectBatch}
      />

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
