import type { PriceBand } from "./deal-query";

/**
 * Contrato da área do comprador: validação de borda e derivações puras.
 * Nada aqui toca banco ou rede — é a camada que os testes cobrem por inteiro.
 */

// Cópia local das faixas: este módulo roda nos testes sem bundler, então não
// pode importar valor de runtime de outro arquivo .ts. O tipo abaixo obriga a
// lista a cobrir PriceBand inteiro — faixa nova em deal-query quebra o compile.
const PRICE_BANDS = ["all", "under_100", "100_500", "over_500"] as const;
type BandsCoverPriceBand = Exclude<PriceBand, (typeof PRICE_BANDS)[number]> extends never ? true : never;
const bandsCoverPriceBand: BandsCoverPriceBand = true;
void bandsCoverPriceBand;

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK_FAVORITES = 200;
const MAX_PROFILE_CATEGORIES = 12;
const MAX_TARGET_CENTS = 100_000_000; // R$ 1 milhão: acima disso é payload adulterado, não alvo

/** Identidade pré-auth: só o UUID emitido pelo middleware é aceito. */
export function validUserId(value: unknown): value is string {
  return typeof value === "string" && UID_RE.test(value);
}

function validProductId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && !/\s/.test(value);
}

export type FavoritePayload = { productId: string; saved: boolean };

export function parseFavoritePayload(body: unknown): FavoritePayload | null {
  if (!body || typeof body !== "object") return null;
  const { productId, saved } = body as Record<string, unknown>;
  if (!validProductId(productId) || typeof saved !== "boolean") return null;
  return { productId, saved };
}

/** Migração do localStorage: ids repetidos e inválidos caem em silêncio, o resto entra. */
export function parseFavoriteBulkPayload(body: unknown): { productIds: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const { productIds } = body as Record<string, unknown>;
  if (!Array.isArray(productIds)) return null;
  const ids = [...new Set(productIds.filter(validProductId))].slice(0, MAX_BULK_FAVORITES);
  return { productIds: ids };
}

export type WatchPayload = { productId: string; targetPriceCents: number | null };

export function parseWatchPayload(body: unknown): WatchPayload | null {
  if (!body || typeof body !== "object") return null;
  const { productId, targetPriceCents } = body as Record<string, unknown>;
  if (!validProductId(productId)) return null;
  if (targetPriceCents === undefined || targetPriceCents === null) {
    return { productId, targetPriceCents: null };
  }
  if (typeof targetPriceCents !== "number" || !Number.isInteger(targetPriceCents)) return null;
  if (targetPriceCents <= 0 || targetPriceCents > MAX_TARGET_CENTS) return null;
  return { productId, targetPriceCents };
}

/**
 * Categorias que o perfil pode conter: o catálogo inteiro mais o que a pessoa
 * já tinha escolhido. A segunda parte é o que impede que uma categoria some do
 * catálogo e leve junto a preferência declarada — usuário perde escolha só
 * quando ele mesmo desmarca.
 */
export function allowedProfileCategories(catalog: string[], stored: string[]): string[] {
  return [...new Set([...catalog, ...stored])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export type ProfilePayload = { preferredCategories: string[]; priceBand: PriceBand };

/** Categorias fora do catálogo real não entram: perfil nunca inventa corredor. */
export function parseProfilePayload(body: unknown, validCategories: string[]): ProfilePayload | null {
  if (!body || typeof body !== "object") return null;
  const { preferredCategories, priceBand } = body as Record<string, unknown>;
  if (!Array.isArray(preferredCategories)) return null;
  if (!PRICE_BANDS.includes(priceBand as PriceBand)) return null;
  const allowed = new Set(validCategories);
  const categories = [...new Set(preferredCategories.filter(
    (item): item is string => typeof item === "string" && allowed.has(item),
  ))].slice(0, MAX_PROFILE_CATEGORIES);
  return { preferredCategories: categories, priceBand: priceBand as PriceBand };
}

export type WatchMovement =
  | { state: "down" | "up"; deltaCents: number; percent: number }
  | { state: "same" }
  | { state: "unknown" };

/** Movimento desde a marcação: derivado do baseline, nunca gravado. */
export function watchMovement(baselineCents: number, currentCents: number | null): WatchMovement {
  if (currentCents === null || baselineCents <= 0) return { state: "unknown" };
  const delta = currentCents - baselineCents;
  if (delta === 0) return { state: "same" };
  return {
    state: delta < 0 ? "down" : "up",
    deltaCents: Math.abs(delta),
    percent: Math.round((Math.abs(delta) / baselineCents) * 100),
  };
}

export function movementLabel(
  movement: WatchMovement,
  formatCurrency: (cents: number) => string,
  sinceLabel: string,
): string {
  if (movement.state === "unknown") return "sem registro de preço desde a marcação";
  if (movement.state === "same") return `preço igual ao do dia em que você marcou (${sinceLabel})`;
  const verb = movement.state === "down" ? "caiu" : "subiu";
  return `${verb} ${formatCurrency(movement.deltaCents)} desde ${sinceLabel}`;
}
