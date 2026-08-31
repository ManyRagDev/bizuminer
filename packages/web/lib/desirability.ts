/**
 * Desejabilidade global — P2 do plano de pauta.
 *
 * Calcula o score de desejo de categorias e de produtos sobre o CATÁLOGO
 * INTEIRO (não sobre uma página). Destinado a rodar no servidor, a cada
 * rodagem de captura, e ser consumido pelo hero e pela pauta.
 *
 * Equação de desejo da categoria: ln(vendas) × √ln(ticket_médio).
 * Equação do hero: convergência de sinais de preço, histórico, social e desejo.
 *
 * Funções puras — sem side effects, sem dependência de banco.
 * Testáveis sem DATABASE_URL.
 */

import type { VitrineProduct } from "./deal-view";
import { priceFreshness } from "./deal-signal";

// ── Desejabilidade da categoria ─────────────────────────────────────

export interface CategoryStats {
  category: string;
  count: number;
  totalSales: number;
  sumPriceCents: number;
}

/**
 * Calcula o score de desejo de cada categoria a partir de estatísticas
 * agregadas. Retorna Map<category, score normalizado 0–1>.
 *
 * A fórmula ln(vendas) × √ln(ticket_médio) achata diferenças extremas
 * (50mil vs 15mil vendas) sem eliminá-las, e dá peso proporcional ao
 * ticket médio da categoria.
 *
 * `minCount` evita que uma categoria com 1 produto tenha score 0
 * (ln(1) = 0) — abaixo do limiar, a categoria é ignorada.
 */
export function categoryDesirabilityFromStats(
  stats: CategoryStats[],
  minCount = 2,
): Map<string, number> {
  let maxRaw = 0;
  const raw = new Map<string, number>();

  for (const s of stats) {
    if (s.count < minCount || s.sumPriceCents <= 0) continue;
    const avgPrice = s.sumPriceCents / s.count;
    const r = Math.log(s.count) * Math.sqrt(Math.log(avgPrice));
    raw.set(s.category, r);
    if (r > maxRaw) maxRaw = r;
  }

  const scores = new Map<string, number>();
  for (const [cat, r] of raw) {
    scores.set(cat, maxRaw > 0 ? r / maxRaw : 0);
  }
  return scores;
}

/**
 * Versão que calcula a partir de uma lista de VitrineProduct.
 * Útil para o componente cliente (hero) enquanto P2 não materializa.
 */
export function categoryDesirabilityFromProducts(
  products: VitrineProduct[],
): Map<string, number> {
  const groups = new Map<string, CategoryStats>();
  for (const p of products) {
    if (!p.category) continue;
    const g = groups.get(p.category) ?? {
      category: p.category,
      count: 0,
      totalSales: 0,
      sumPriceCents: 0,
    };
    g.count++;
    g.totalSales += p.salesCount ?? 0;
    g.sumPriceCents += p.priceCents;
    groups.set(p.category, g);
  }
  return categoryDesirabilityFromStats([...groups.values()]);
}

// ── Hero score ──────────────────────────────────────────────────────

export const HERO_MAX = 6;
export const HERO_MIN_SCORE = 7;

export interface HeroScorable {
  priceCents: number;
  previousMinPriceCents: number | null;
  observationCount: number;
  historyDays: number;
  lowestVerified: boolean;
  ratingStar: number | null;
  salesCount: number | null;
  evidenceObservedAt: Date | string | null;
  category: string | null;
}

/**
 * Score do hero: convergência de sinais de preço, histórico, social e desejo.
 *
 * Pesos (decisão do dono, 29/08/2026):
 *   +5  menor preço verificado (lowestVerified)
 *   +3  histórico forte (3+ observações, 7+ dias)
 *   +2  avaliação >= 4 estrelas
 *   +2  vendas >= 100
 *   +2  queda >= 15% desde o menor anterior
 *   +1  preço atualizado nas últimas 48h
 *   +3  desejo da categoria >= 0.85
 *
 * Máximo possível: 18 pontos.
 */
export function heroScore(
  product: HeroScorable,
  desirability: Map<string, number>,
): number {
  const dropPct =
    product.previousMinPriceCents && product.previousMinPriceCents > 0
      ? (product.previousMinPriceCents - product.priceCents) /
        product.previousMinPriceCents
      : 0;
  const fresh = priceFreshness(product.evidenceObservedAt);
  const catScore = desirability.get(product.category ?? "") ?? 0;

  return (
    (product.lowestVerified ? 5 : 0) +
    (product.observationCount >= 3 && product.historyDays >= 7 ? 3 : 0) +
    (product.ratingStar !== null && product.ratingStar >= 4 ? 2 : 0) +
    ((product.salesCount ?? 0) >= 100 ? 2 : 0) +
    (dropPct >= 0.15 ? 2 : 0) +
    (fresh === "current" ? 1 : 0) +
    (catScore >= 0.85 ? 3 : 0)
  );
}

/**
 * Seleciona os produtos para o hero a partir de uma lista.
 * Retorna ordenado por score desc, desempate por preço asc.
 */
export function selectHeroProducts(
  products: VitrineProduct[],
  desirability: Map<string, number>,
  max = HERO_MAX,
  minScore = HERO_MIN_SCORE,
): VitrineProduct[] {
  return products
    .filter((p) => p.imageUrl)
    .map((p) => ({ product: p, score: heroScore(p, desirability) }))
    .filter((entry) => entry.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score || a.product.priceCents - b.product.priceCents,
    )
    .slice(0, max)
    .map((entry) => entry.product);
}
