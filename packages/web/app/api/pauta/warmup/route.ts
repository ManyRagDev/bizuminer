import { NextRequest } from "next/server";
import { inAccountScope } from "../../../../lib/account-scope";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth";
import { getPublishedEditorialSelection } from "../../../../lib/editorial-selection-db";
import { fetchProductImage, ogFonts } from "../../../../lib/og-assets";

export const dynamic = "force-dynamic";

/**
 * Pré-aquecimento da pauta (warmup):
 * Lê a seleção da conta uma vez e aquece suas imagens originais e fontes
 * antes do primeiro compartilhamento. Evita uma consulta de detalhe por slug
 * disputando a conexão do servidor com a geração do preview Open Graph.
 */
export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  return inAccountScope(check.context, async () => {
    const body = await request.json().catch(() => ({}));
    const rawSlugs = Array.isArray(body?.slugs) ? body.slugs : [];
    const slugs = rawSlugs
      .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, 20);

    if (slugs.length === 0) {
      return sinkJson(check.sink, { ok: true, warmed: 0 });
    }

    const requestedSlugs = new Set<string>(slugs);
    const selection = await getPublishedEditorialSelection("pauta");
    const products = selection.products.filter((product) => requestedSlugs.has(product.slug));

    // As URLs vêm da seleção autorizada no servidor, nunca do corpo enviado
    // pelo navegador. O pool fica livre enquanto fontes e fotos são aquecidas.
    await Promise.allSettled([
      ogFonts(),
      ...products.map((product) => fetchProductImage(product.imageUrl)),
    ]);

    return sinkJson(check.sink, { ok: true, warmed: products.length });
  });
}
