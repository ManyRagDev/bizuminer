export const dealSorts = ["signal", "price", "popularity", "recent"] as const;
export type DealSort = typeof dealSorts[number];

export const priceBands = ["all", "under_100", "100_500", "over_500"] as const;
export type PriceBand = typeof priceBands[number];

export type DealQuery = {
  limit?: number;
  offset?: number;
  category?: string | null;
  priceBand?: PriceBand;
  sort?: DealSort;
  search?: string | null;
};

export const CATALOG_PAGE_SIZE = 24;

export type CatalogState = {
  page: number;
  category: string | null;
  priceBand: PriceBand;
  sort: DealSort;
  search: string;
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
  return {
    limit: Math.min(Math.max(parsePositiveInt(params.get("limit"), 12), 1), MAX_LIMIT),
    offset: Math.min(parsePositiveInt(params.get("offset"), 0), MAX_OFFSET),
    category: rawCategory.slice(0, 80) || null,
    search: rawSearch.slice(0, MAX_SEARCH_LENGTH) || null,
    sort: dealSorts.includes(rawSort as DealSort) ? rawSort as DealSort : "signal",
    priceBand: priceBands.includes(rawBand as PriceBand) ? rawBand as PriceBand : "all",
  };
}

export function priceRangeForBand(band: PriceBand): { min: number | null; max: number | null } {
  if (band === "under_100") return { min: null, max: 10_000 };
  if (band === "100_500") return { min: 10_001, max: 50_000 };
  if (band === "over_500") return { min: 50_001, max: null };
  return { min: null, max: null };
}

/** Estado público do catálogo: nomes legíveis e seguro para recarregar/compartilhar. */
export function catalogStateFromSearchParams(params: URLSearchParams): CatalogState {
  const rawPage = parsePositiveInt(params.get("pagina"), 1);
  const rawCategory = params.get("categoria")?.trim().slice(0, 80) || null;
  const rawSearch = params.get("busca")?.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH) ?? "";
  const rawSort = params.get("ordem");
  const rawBand = params.get("preco");
  return {
    page: Math.min(Math.max(rawPage, 1), 1_000),
    category: rawCategory,
    search: rawSearch,
    sort: dealSorts.includes(rawSort as DealSort) ? rawSort as DealSort : "signal",
    priceBand: priceBands.includes(rawBand as PriceBand) ? rawBand as PriceBand : "all",
  };
}

export function catalogStateToSearchParams(state: CatalogState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("pagina", String(state.page));
  if (state.category) params.set("categoria", state.category);
  if (state.priceBand !== "all") params.set("preco", state.priceBand);
  if (state.sort !== "signal") params.set("ordem", state.sort);
  if (state.search) params.set("busca", state.search);
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
  };
}
