import { NextRequest } from "next/server";
import { globalHeroProducts } from "../../../lib/db";
import { curateProducts } from "../../../lib/curation";
import { storyShareUrl } from "../../../lib/story-link";

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

  // Estágio 2: curadoria semântica — ~40 → ~12
  const curated = await curateProducts(heroProducts, 12);

  // Cunha links curtos para cada produto (idempotente — reusa código existente)
  const products = await Promise.all(
    curated.map(async (p) => ({
      ...p,
      shareUrl: await storyShareUrl(p.slug),
    })),
  );

  return Response.json(
    { products, total: products.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
