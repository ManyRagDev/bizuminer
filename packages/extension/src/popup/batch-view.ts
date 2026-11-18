import { formatCollectionDetails } from "../lib/import-report.ts";

/** Presentation only; the worker must independently authorize replacement. */
export function formatBatchState(state: { hasBatch?: boolean; canReplace?: boolean; sent?: boolean; queued?: boolean;
  capturedAt?: unknown; preparedVersion?: unknown }) {
  const hasBatch = state.hasBatch === true;
  const canReplace = hasBatch && state.canReplace === true && !state.sent && !state.queued;
  return {
    prepareLabel: hasBatch ? "Retomar leitura" : "Ler anúncios desta página",
    canReplace,
    metadata: hasBatch ? formatCollectionDetails(state) : [],
    guidance: !hasBatch ? "" : canReplace
      ? "Retomar mantém esta coleta. Refazer lê a página aberta e só substitui esta leitura se a nova coleta terminar com sucesso."
      : "Esta leitura pode já ter sido recebida pelo servidor. Confira o painel antes de descartá-la. Para ler novamente, use Descartar leitura; isso não remove registros já recebidos.",
  };
}
