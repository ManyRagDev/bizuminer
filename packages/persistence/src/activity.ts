/**
 * Estado de vida do produto — SEMPRE derivado, nunca gravado (mesma régua do
 * baseline de preço: o fato no banco é a última aparição; o estado é uma
 * leitura, não uma flag que um job precisa manter sincronizada).
 *
 * Decisão de produto (20/08/2026, registro no documento mestre):
 * - ativo   = apareceu na rodagem atual → vitrine
 * - recente = visto nos últimos RECENT_WINDOW_DAYS dias → superfícies
 *             secundárias (recomendações, buscas de retorno)
 * - dormente= não visto há mais tempo → fora das superfícies, histórico
 *             preservado; re-ativa sozinho se reaparecer no feed (upsert por
 *             external_id continua a história — "voltou com histórico").
 */

export type ActivityLevel = "ativo" | "recente" | "dormente";

/** Janela de "recente" em dias. Parâmetro registrado; trocar exige o dono. */
export const RECENT_WINDOW_DAYS = 14;

export interface ActivityInput {
  /** Produto presente na rodagem mais recente (current_run). */
  readonly seenInCurrentRun: boolean;
  /** Dias desde a última aparição (floor; 0 = visto hoje). */
  readonly daysSinceLastSeen: number;
}

export interface ActivityCounts {
  readonly ativo: number;
  readonly recente: number;
  readonly dormente: number;
}

export function classifyActivity(input: ActivityInput): ActivityLevel {
  if (input.seenInCurrentRun) return "ativo";
  if (input.daysSinceLastSeen <= RECENT_WINDOW_DAYS) return "recente";
  return "dormente";
}
