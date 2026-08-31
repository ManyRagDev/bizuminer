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

  // Cunha links curtos para cada produto (idempotente — reusa código existente)
  const host = shareBaseUrl().replace(/\/$/, "");
  const products = await Promise.all(
    curated.map(async (p) => {
      const code = await shortCodeForSlug(p.slug);
      return { ...p, shareUrl: `${host}/p/${code}` };
    }),
  );

  return Response.json(
    { products, total: products.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
