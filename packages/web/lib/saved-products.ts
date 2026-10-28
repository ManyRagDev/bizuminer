import type { VitrineProduct } from "./deal-view";

// Old unscoped keys may contain another account's data and are never imported.
function keys(scope: string | null) {
  const suffix = scope ? `account:${encodeURIComponent(scope)}` : "anonymous-session";
  return [`bizuminer:salvos:v2:${suffix}`, `bizuminer:salvos-produtos:v2:${suffix}`];
}

type SavedState = {
  ids: string[];
  products: VitrineProduct[];
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function validProduct(value: unknown): value is VitrineProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<VitrineProduct>;
  return typeof product.id === "string"
    && typeof product.slug === "string"
    && typeof product.title === "string"
    && typeof product.priceCents === "number";
}

export function normalizeSavedState(idsValue: unknown, productsValue: unknown): SavedState {
  const ids = uniqueStrings(idsValue);
  const allowedIds = new Set(ids);
  const byId = new Map<string, VitrineProduct>();
  if (Array.isArray(productsValue)) {
    for (const product of productsValue) {
      if (validProduct(product) && allowedIds.has(product.id)) byId.set(product.id, product);
    }
  }
  return { ids, products: ids.flatMap((id) => byId.get(id) ?? []) };
}

export function readSavedState(storage: Pick<Storage, "getItem">, scope: string | null = null): SavedState {
  const [SAVED_IDS_KEY, SAVED_PRODUCTS_KEY] = keys(scope);
  try {
    const ids = JSON.parse(storage.getItem(SAVED_IDS_KEY) ?? "[]") as unknown;
    const products = JSON.parse(storage.getItem(SAVED_PRODUCTS_KEY) ?? "[]") as unknown;
    return normalizeSavedState(ids, products);
  } catch {
    return { ids: [], products: [] };
  }
}

export function writeSavedState(storage: Pick<Storage, "setItem">, state: SavedState, scope: string | null = null) {
  const [SAVED_IDS_KEY, SAVED_PRODUCTS_KEY] = keys(scope);
  const normalized = normalizeSavedState(state.ids, state.products);
  storage.setItem(SAVED_IDS_KEY, JSON.stringify(normalized.ids));
  storage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(normalized.products));
}

export function mergeSavedProducts(ids: string[], cached: VitrineProduct[], visible: VitrineProduct[]): VitrineProduct[] {
  const allowedIds = new Set(ids);
  const byId = new Map<string, VitrineProduct>();
  for (const product of cached) if (allowedIds.has(product.id)) byId.set(product.id, product);
  for (const product of visible) if (allowedIds.has(product.id)) byId.set(product.id, product);
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * União de listas de ids salvos (localStorage + conta do servidor).
 * Deduplica, descarta não-string/vazios e preserva a ordem das listas —
 * a local vem primeiro, a da conta completa o que faltava.
 */
export function unionSavedIds(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) {
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}


/** Only server-confirmed IDs may leave the anonymous session after explicit sync. */
export function remainingAfterConfirmedSync(state: SavedState, acceptedIds: string[]): SavedState {
  const accepted = new Set(acceptedIds);
  return normalizeSavedState(state.ids.filter((id) => !accepted.has(id)), state.products.filter((item) => !accepted.has(item.id)));
}
