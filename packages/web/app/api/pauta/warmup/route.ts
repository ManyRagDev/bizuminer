import { NextRequest } from "next/server";
import { inAccountScope } from "../../../../lib/account-scope";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth";
import { dealDetail } from "../../../../lib/db";
import { fetchProductImage, ogFonts } from "../../../../lib/og-assets";

export const dynamic = "force-dynamic";

/**
 * Pré-aquecimento da pauta (warmup):
 * Resolve no servidor os dados e a imagem original dos produtos da pauta,
 * populando o cache em memória do Node.js antes do primeiro compartilhamento.
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

    // Aquece fontes e carrega detalhes/imagens dos produtos em paralelo
    await Promise.allSettled([
      ogFonts(),
      ...slugs.map(async (slug: string) => {
        const detail = await dealDetail(slug);
        if (detail?.deal.image_url) {
          await fetchProductImage(detail.deal.image_url);
        }
      }),
    ]);

    return sinkJson(check.sink, { ok: true, warmed: slugs.length });
  });
}
