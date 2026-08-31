import { NextRequest } from "next/server";
import { globalHeroProducts } from "../../../lib/db";
import { curateProducts } from "../../../lib/curation";
import { shortCodesForSlugs } from "../../../lib/short-link-db";
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

  // Cunha links curtos para cada produto numa ÚNICA conexão (idempotente).
  // Lote de propósito: cunhar um a um abriria N conexões e estouraria o
  // pooler do Supabase (limite de 15 sessões em modo session).
  const host = shareBaseUrl().replace(/\/$/, "");
  const codes = await shortCodesForSlugs(curated.map((p) => p.slug));
  const products = curated.map((p) => ({ ...p, shareUrl: `${host}/p/${codes.get(p.slug)}` }));

  return Response.json(
    { products, total: products.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
