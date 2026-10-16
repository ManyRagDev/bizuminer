import { publicProjectionReady } from "../../../lib/public-offer-db";
import { publicLinkPage } from "../../../lib/public-link-page";
import { slugForShortCode } from "../../../lib/short-link-db";
import { isCampaignLinkCode } from "../../../lib/commerce-contract";
import { resolveCampaignLinkByCode } from "../../../lib/commerce-db";

/**
 * Link curto de compartilhamento: `/p/<code>` → `/bizu/<slug>` ou campanha.
 *
 * SUPORTA DOIS FORMATOS:
 * 1. 12 caracteres (Base62): Links de campanhas rastreáveis (EP-04).
 *    Redireciona para o destino resolvido ou `/bizu/<slug>?c=<code>`.
 * 2. 4 caracteres legados: Links curtos de produto único via short_link.
 *    Redireciona para `/bizu/<slug>`.
 *
 * O DESTINO É A PÁGINA DO PRODUTO, NÃO O `/go`
 *
 * Quem clica precisa cair numa página NOSSA, com as tags OG que montam o card
 * de preview no WhatsApp — o robô do app segue redirects e lê o destino final.
 * Apontar para `/go` faria o preview sair com o card do Mercado Livre, e ainda
 * gravaria um click_event a cada passagem de robô, contaminando a telemetria
 * com tráfego não humano. O `/go` continua sendo o CTA dentro da página, onde
 * o clique é de gente de verdade.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if(await publicProjectionReady()) return publicLinkPage(code);

  // 1. Tentar resolver como link de campanha (12 caracteres base62)
  if (isCampaignLinkCode(code)) {
    try {
      const resolved = await resolveCampaignLinkByCode(code);
      if (resolved && resolved.slug) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/bizu/${encodeURIComponent(resolved.slug)}?c=${encodeURIComponent(code)}`,
            "Cache-Control": "no-store",
          },
        });
      }
      return new Response("Link não encontrado", { status: 404 });
    } catch {
      return new Response("Não foi possível verificar o link agora", { status: 503 });
    }
  }

  // 2. Fallback: link curto de catálogo legado (4 caracteres)
  const slug = await slugForShortCode(code);

  if (!slug) {
    return new Response("Link não encontrado", { status: 404 });
  }

  // 302 e não 301: o mapa código → produto é dado de aplicação, e um 301 fica
  // gravado no navegador de quem clicou. Se um código precisar ser reapontado
  // ou revogado, o 301 tornaria isso impossível para quem já visitou.
  return new Response(null, {
    status: 302,
    headers: { Location: `/bizu/${slug}`, "Cache-Control": "no-store" },
  });
}
