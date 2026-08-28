import { isKnownMarketplace } from "./marketplaces.ts";

export const dealSorts = ["signal", "price", "popularity", "recent"] as const;
export type DealSort = typeof dealSorts[number];

export const priceBands = ["all", "under_100", "100_500", "over_500"] as const;
export type PriceBand = typeof priceBands[number];

/**
 * Janela de frescura do preço: quando o preço foi capturado.
 * "today" e "3d"/"7d" restringem a capturas recentes; "14d" é o padrão
 * da vitrine (já aplicado pela cláusula base de last_seen_at); "all" expande
 * para além de 14 dias, incluindo produtos dormentes.
 */
export const freshnessBands = ["all", "today", "3d", "7d", "14d"] as const;
export type FreshnessBand = typeof freshnessBands[number];

export type DealQuery = {
  limit?: number;
  offset?: number;
  category?: string | null;
  priceBand?: PriceBand;
  sort?: DealSort;
  search?: string | null;
  /** `null`/ausente = todas as plataformas misturadas (padrão da vitrine). */
  marketplace?: string | null;
  /** Janela de frescura: quando o preço foi capturado. */
  freshness?: FreshnessBand;
  /** Avaliação mínima em estrelas. */
  minRating?: number | null;
  /** Desconto mínimo informado pelo anúncio (0–100). */
  minDiscount?: number | null;
  /** Apenas produtos com menor preço verificado (lowest_verified). */
  lowestOnly?: boolean;
  /** Apenas produtos com histórico de 3+ observações e 7+ dias. */
  hasHistory?: boolean;
};

export const CATALOG_PAGE_SIZE = 24;

export type CatalogState = {
  page: number;
  category: string | null;
  priceBand: PriceBand;
  sort: DealSort;
  search: string;
  marketplace: string | null;
  freshness: FreshnessBand;
  minRating: number | null;
  minDiscount: number | null;
  lowestOnly: boolean;
  hasHistory: boolean;
};

const MAX_LIMIT = 24;
const MAX_OFFSET = 10_000;
const MAX_SEARCH_LENGTH = 100;

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** Normaliza a borda HTTP: consulta malformada nunca muda a semântica do catálogo. */
export function dealQueryFromSearchParams(params: URLSearchParams): Required<DealQuery> {
  const rawCategory = params.get("category")?.trim() ?? "";
  const rawSearch = params.get("q")?.trim().replace(/\s+/g, " ") ?? "";
  const rawSort = params.get("sort");
  const rawBand = params.get("price");
  const rawMarketplace = params.get("marketplace")?.trim() ?? "";
  const rawFreshness = params.get("freshness");
  const rawRating = params.get("minRating");
  const rawDiscount = params.get("minDiscount");
  return {
    limit: Math.min(Math.max(parsePositiveInt(params.get("limit"), 12), 1), MAX_LIMIT),
    offset: Math.min(parsePositiveInt(params.get("offset"), 0), MAX_OFFSET),
    category: rawCategory.slice(0, 80) || null,
    search: rawSearch.slice(0, MAX_SEARCH_LENGTH) || null,
    sort: dealSorts.includes(rawSort as DealSort) ? rawSort as DealSort : "signal",
    priceBand: priceBands.includes(rawBand as PriceBand) ? rawBand as PriceBand : "all",
    marketplace: isKnownMarketplace(rawMarketplace) ? rawMarketplace : null,
    freshness: freshnessBands.includes(rawFreshness as FreshnessBand) ? rawFreshness as FreshnessBand : "14d",
    minRating: rawRating ? Math.min(Math.max(Number.parseFloat(rawRating), 1), 5) : null,
    minDiscount: rawDiscount ? Math.min(Math.max(Number.parseFloat(rawDiscount), 1), 100) : null,
    lowestOnly: params.get("lowestOnly") === "true",
    hasHistory: params.get("hasHistory") === "true",
  };
}

/**
 * A vitrine deve **sempre mostrar as duas lojas** misturadas na home — é o
 * chamariz (decisão do dono, 27/08/2026). Mas isso só vale para a vitrine
 * curada: se a pessoa pediu "menor preço", intercalar poria um item de R$500
 * acima de um de R$100 e quebraria a promessa explícita do controle.
 *
 * Regra: intercala só no sinal (padrão) e sem recorte de loja — com filtro
 * de loja há uma partição só, e intercalar não significaria nada.
 *
 * Função pura e exportada de propósito: o modo de falha aqui é silencioso
 * (ninguém percebe que "menor preço" parou de ordenar por preço até um
 * usuário reclamar), então fica travado por teste.
 */
export function shouldInterleaveMarketplaces(
  query: Pick<DealQuery, "sort" | "marketplace">,
): boolean {
  const sort = query.sort ?? "signal";
  const marketplace = query.marketplace?.trim() || null;
  return sort === "signal" && marketplace === null;
}

export function priceRangeForBand(band: PriceBand): { min: number | null; max: number | null } {
  if (band === "under_100") return { min: null, max: 10_000 };
  if (band === "100_500") return { min: 10_001, max: 50_000 };
  if (band === "over_500") return { min: 50_001, max: null };
  return { min: null, max: null };
}

/** Dias para o filtro de frescura. `null` = sem restrição (expande para além dos 14 dias base). */
export function freshnessDays(band: FreshnessBand): number | null {
  if (band === "today") return 1;
  if (band === "3d") return 3;
  if (band === "7d") return 7;
  if (band === "14d") return 14;
  return null; // "all" — sem restrição extra
}

/** Estado público do catálogo: nomes legíveis e seguro para recarregar/compartilhar. */
export function catalogStateFromSearchParams(params: URLSearchParams): CatalogState {
  const rawPage = parsePositiveInt(params.get("pagina"), 1);
  const rawCategory = params.get("categoria")?.trim().slice(0, 80) || null;
  const rawSearch = params.get("busca")?.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH) ?? "";
  const rawSort = params.get("ordem");
  const rawBand = params.get("preco");
  const rawMarketplace = params.get("loja")?.trim() ?? "";
  const rawFreshness = params.get("frescor");
  const rawRating = params.get("avaliacao");
  const rawDiscount = params.get("desconto");
  return {
    page: Math.min(Math.max(rawPage, 1), 1_000),
    category: rawCategory,
    search: rawSearch,
    sort: dealSorts.includes(rawSort as DealSort) ? rawSort as DealSort : "signal",
    priceBand: priceBands.includes(rawBand as PriceBand) ? rawBand as PriceBand : "all",
    marketplace: isKnownMarketplace(rawMarketplace) ? rawMarketplace : null,
    freshness: freshnessBands.includes(rawFreshness as FreshnessBand) ? rawFreshness as FreshnessBand : "14d",
    minRating: rawRating ? Math.min(Math.max(Number.parseFloat(rawRating), 1), 5) : null,
    minDiscount: rawDiscount ? Math.min(Math.max(Number.parseFloat(rawDiscount), 1), 100) : null,
    lowestOnly: params.get("menorPreco") === "true",
    hasHistory: params.get("historico") === "true",
  };
}

export function catalogStateToSearchParams(state: CatalogState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("pagina", String(state.page));
  if (state.category) params.set("categoria", state.category);
  if (state.priceBand !== "all") params.set("preco", state.priceBand);
  if (state.sort !== "signal") params.set("ordem", state.sort);
  if (state.search) params.set("busca", state.search);
  if (state.marketplace) params.set("loja", state.marketplace);
  if (state.freshness !== "14d") params.set("frescor", state.freshness);
  if (state.minRating !== null) params.set("avaliacao", String(state.minRating));
  if (state.minDiscount !== null) params.set("desconto", String(state.minDiscount));
  if (state.lowestOnly) params.set("menorPreco", "true");
  if (state.hasHistory) params.set("historico", "true");
  return params;
}

export function catalogStateToDealQuery(state: CatalogState): Required<DealQuery> {
  return {
    limit: CATALOG_PAGE_SIZE,
    offset: (state.page - 1) * CATALOG_PAGE_SIZE,
    category: state.category,
    priceBand: state.priceBand,
    sort: state.sort,
    search: state.search || null,
    marketplace: state.marketplace,
    freshness: state.freshness,
    minRating: state.minRating,
    minDiscount: state.minDiscount,
    lowestOnly: state.lowestOnly,
    hasHistory: state.hasHistory,
  };
}
