/**
 * Geração e persistência do link de saída Shopee (M3, 26/08/2026,
 * plano-multiplataforma.md).
 *
 * O `/go/[slug]` (web) nunca chama a API da Shopee — latência e rate limit
 * não podem entrar no caminho crítico do clique (M-R1/invariante deste
 * plano). Esta função roda fora do redirect, chamada depois de uma rodagem
 * (`bin/sweep-shopee.ts`): para cada produto Shopee sem link persistido,
 * garante a `publication` (dona: `aff_local`, a casa — captura Shopee é por
 * credencial da casa, não por afiliado, ver plano-multiplataforma.md §1) e
 * gera o shortlink UMA VEZ via `ShopeeAdapter.buildAffiliateLink`, com
 * `subIds: [publication.id]` — é o subId que fecha a atribuição desta oferta
 * a esta publicação (M-R6).
 *
 * Idempotente: só processa produtos cuja publication ainda não tem
 * affiliate_url. Não toca `sweep()` (M-R5).
 */

import postgres from "postgres";
import { ShopeeAdapter } from "../../capture/src/adapters/shopee/index.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";

export interface GenerateShopeeLinksOptions {
  readonly connectionString: string;
  readonly tenantId: string;
  readonly credential: Credential;
  /** Afiliado dono das publications geradas. Default: a casa (`aff_local`). */
  readonly affiliateId?: string;
}

export interface GenerateShopeeLinksSummary {
  readonly candidates: number;
  readonly generated: number;
  readonly failed: number;
}

export async function ensureShopeeAffiliateLinks(
  opts: GenerateShopeeLinksOptions,
  ctx: CaptureContext,
): Promise<GenerateShopeeLinksSummary> {
  const affiliateId = opts.affiliateId ?? "aff_local";
  const sql = postgres(opts.connectionString, {
    prepare: false,
    max: 2,
    ssl: opts.connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  const adapter = new ShopeeAdapter();
  let generated = 0;
  let failed = 0;

  try {
    const products = await sql<{ id: string; external_id: string; product_url: string }[]>`
      select p.id, p.external_id, p.product_url
      from garimpa.product p
      where p.tenant_id = ${opts.tenantId}
        and p.marketplace = 'shopee'
        and not exists (
          select 1 from garimpa.publication pub
          where pub.product_id = p.id
            and pub.affiliate_id = ${affiliateId}
            and pub.channel = 'web'
            and pub.affiliate_url is not null
        )
    `;

    for (const product of products) {
      const slug = `shp-${product.external_id}`;
      try {
        const rows = await sql<{ id: string; affiliate_url: string | null }[]>`
          insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
          values (gen_random_uuid()::text, ${opts.tenantId}, ${product.id}, ${affiliateId}, 'web', ${slug})
          on conflict (affiliate_id, product_id, channel) do update set slug = excluded.slug
          returning id, affiliate_url
        `;
        const pub = rows[0];
        if (!pub || pub.affiliate_url) continue; // já gerado (corrida concorrente ou rodagem anterior)

        // A Shopee rejeita hífen no subId ("error 11001: invalid sub id",
        // confirmado em teste real 26/08/2026) — pub.id é gen_random_uuid()
        // com hífens, então removê-los aqui é o que faz a chamada passar.
        // Continua único e suficiente para correlacionar no relatório da
        // Shopee depois; nada no /go faz o caminho inverso (subId → publication).
        const subId = pub.id.replace(/-/g, "");
        const link = await adapter.buildAffiliateLink(
          opts.credential,
          product.product_url,
          { marketplace: "shopee", trackingId: affiliateId, subIds: [subId] },
          ctx,
        );

        await sql`
          update garimpa.publication
          set affiliate_url = ${link}, affiliate_url_generated_at = now()
          where id = ${pub.id} and affiliate_url is null
        `;
        generated++;
      } catch (err) {
        failed++;
        ctx.log({
          level: "error",
          msg: "falha ao gerar link de afiliado Shopee",
          data: {
            productId: product.id,
            externalId: product.external_id,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    return { candidates: products.length, generated, failed };
  } finally {
    await sql.end();
  }
}
