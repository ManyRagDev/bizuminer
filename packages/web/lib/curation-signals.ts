/**
 * Sinais objetivos exibidos na mesa editorial — fonte única para a UI e para
 * o snapshot imutável da decisão (curation-event).
 *
 * A tela mostra o rótulo; o snapshot guarda os IDs na ordem em que foram
 * apresentados ao humano. Regras mudam aqui, nunca em dois lugares.
 */

export const CURATION_SIGNALS = {
  low_history: "Pouco histórico para sustentar o desconto",
  high_claimed_discount: "Desconto muito alto declarado pelo anúncio",
  missing_category: "Categoria ainda não identificada",
  missing_rating: "Sem avaliação disponível",
} as const;

export type CurationSignalId = keyof typeof CURATION_SIGNALS;

export const CURATION_SIGNAL_IDS = Object.keys(CURATION_SIGNALS) as CurationSignalId[];

export interface CurationSignalSource {
  readonly observationCount: number;
  readonly claimedDiscountRate: number | null;
  readonly category: string | null;
  readonly ratingStar: number | null;
}

export function curationSignalsFor(source: CurationSignalSource): CurationSignalId[] {
  const signals: CurationSignalId[] = [];
  if (source.observationCount < 3) signals.push("low_history");
  if ((source.claimedDiscountRate ?? 0) >= 0.7) signals.push("high_claimed_discount");
  if (!source.category) signals.push("missing_category");
  if (!source.ratingStar) signals.push("missing_rating");
  return signals;
}

export function curationSignalLabel(id: CurationSignalId): string {
  return CURATION_SIGNALS[id];
}
