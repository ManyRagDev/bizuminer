import { NextRequest } from "next/server";
import { globalHeroProducts } from "../../../lib/db";
import { curateProducts } from "../../../lib/curation";
import { shortCodeForSlug } from "../../../lib/short-link-db";
import { shareBaseUrl } from "../../../lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Pauta de stories: produtos curados para postagem no WhatsApp.
 *
 * Fluxo: catálogo inteiro → desejabilidade global (P2) → curadoria LLM (P3)
 * → lista final ordenada por desejo social.
 *
 * GET /api/pauta → { products: PautaProduct[], total: number }
 */
export async function GET(_request: NextRequest) {
  // Estágio 1: desejabilidade global — ~473 → ~40
  const heroProducts = await globalHeroProducts(40);

  // Estágio 2: curadoria semântica — ~40 → ~20
  const curated = await curateProducts(heroProducts, 20);

  // Cunha links curtos para cada produto (idempotente — reusa código existente).
  // SEQUENCIAL de propósito: `Promise.all` abriria 20 conexões simultâneas e
  // estouraria o pooler do Supabase (limite de 15 sessões em modo session) —
  // foi o 500 que apareceu ao subir de 12 para 20. Uma conexão por vez, ~30ms
  // cada, mantém tudo sob o teto.
  const host = shareBaseUrl().replace(/\/$/, "");
  const products: Array<Record<string, unknown> & { shareUrl: string }> = [];
  for (const p of curated) {
    const code = await shortCodeForSlug(p.slug);
    products.push({ ...p, shareUrl: `${host}/p/${code}` });
  }

  return Response.json(
    { products, total: products.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
