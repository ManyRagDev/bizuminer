/**
 * Publicação e link de saída da AliExpress (M5, 28/08/2026).
 *
 * Diferente da Shopee, aqui NÃO há chamada de API: o `promotion_link` já vem
 * atribuído dentro da própria resposta de captura (a query recebe o
 * `tracking_id`), e o mapper o grava como `product.product_url`. Este passo
 * só materializa a `publication` e copia esse link para `affiliate_url`.
 *
 * Por que a publication é necessária mesmo com o link pronto: `click_event`
 * referencia `publication_id` (NOT NULL). Sem a linha, o `/go` não teria onde
 * registrar o clique — e o produto viraria 404, que foi exatamente o bug
 * encontrado ao testar `/go/ali-...` pela primeira vez.
 *
 * Idempotente: só processa produtos cuja publication ainda não tem link.
 */

import postgres from "postgres";
import type { CaptureContext } from "../../capture/src/types.ts";

export interface EnsureAliExpressLinksOptions {
  readonly connectionString: string;
  readonly tenantId: string;
  /** Afiliado dono das publications. Default: a casa (`aff_local`). */
  readonly affiliateId?: string;
}

export interface EnsureAliExpressLinksSummary {
  readonly candidates: number;
  readonly linked: number;
  readonly skippedWithoutLink: number;
}

export async function ensureAliExpressPublications(
  opts: EnsureAliExpressLinksOptions,
  ctx: CaptureContext,
): Promise<EnsureAliExpressLinksSummary> {
  const affiliateId = opts.affiliateId ?? "aff_local";
  const sql = postgres(opts.connectionString, {
    prepare: false,
    max: 2,
    ssl: opts.connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  let linked = 0;
  let skippedWithoutLink = 0;

  try {
    const products = await sql<{ id: string; external_id: string; product_url: string }[]>`
      select p.id, p.external_id, p.product_url
      from garimpa.product p
      where p.tenant_id = ${opts.tenantId}
        and p.marketplace = 'aliexpress'
        and not exists (
          select 1 from garimpa.publication pub
          where pub.product_id = p.id
            and pub.affiliate_id = ${affiliateId}
            and pub.channel = 'web'
            and pub.affiliate_url is not null
        )
    `;

    for (const product of products) {
      // Guarda de atribuição: se o product_url não for o link de afiliado,
      // publicar seria criar um destino que não paga comissão. Melhor pular
      // e contar — o número aparecendo no resumo denuncia captura feita sem
      // tracking_id, em vez de virar prejuízo silencioso.
      if (!product.product_url.includes("s.click.aliexpress.com")) {
        skippedWithoutLink++;
        continue;
      }

      const slug = `ali-${product.external_id}`;
      await sql`
        insert into garimpa.publication
          (id, tenant_id, product_id, affiliate_id, channel, slug, affiliate_url, affiliate_url_generated_at)
        values (gen_random_uuid()::text, ${opts.tenantId}, ${product.id}, ${affiliateId}, 'web',
                ${slug}, ${product.product_url}, now())
        on conflict (affiliate_id, product_id, channel) do update set
          slug = excluded.slug,
          affiliate_url = coalesce(garimpa.publication.affiliate_url, excluded.affiliate_url),
          affiliate_url_generated_at = coalesce(garimpa.publication.affiliate_url_generated_at, now())
      `;
      linked++;
    }

    if (skippedWithoutLink > 0) {
      ctx.log({
        level: "error",
        msg: "produtos AliExpress sem link de afiliado — capturados sem tracking_id?",
        data: { skippedWithoutLink },
      });
    }

    return { candidates: products.length, linked, skippedWithoutLink };
  } finally {
    await sql.end();
  }
}
