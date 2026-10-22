import { createHash } from "node:crypto";
import {
  affiliateLink,
  db,
  resolvePublicationForLink,
  resolvePreGeneratedLink,
  shopeeRedirectTarget,
} from "../../../lib/db";
import { PRODUCT_EVIDENCE_TTL_DAYS, PUBLIC_CURATION_STATUS } from "../../../lib/catalog-policy";
import { affiliateLinksV2Enabled } from "../../../lib/flags";
import { marketplaceDef, parseProductSlug } from "../../../lib/marketplaces";
import { validateCampaignTokenForSlug, type CampaignTokenValidationResult } from "../../../lib/campaign-attribution";
import { publicProjectionReady } from "../../../lib/public-offer-db";
import { publicGo } from "../../../lib/public-go";

/**
 * Telemetria própria de cliques (engenharia-reversa.md §6):
 * grava click_event (IP só como hash — LGPD) e redireciona 302 para o link
 * afiliado matt_full com subId = slug da publicação.
 *
 * E3: a comissão passa a ser do afiliado dono da publicação (R3). O caminho
 * V2 resolve publication → affiliate_account → marketplace_config e falha
 * FECHADO (sem fallback para a tag global) quando a config está ausente ou
 * suspensa. O caminho legado (flag off) mantém o comportamento atual para não
 * quebrar links antigos enquanto a casa não tem config válida.
 *
 * M3 (plano-multiplataforma.md): Shopee é um terceiro ramo, resolvido antes
 * de V2/legado por não misturar com o caminho matt_word do ML. Não chama a
 * API da Shopee aqui — só redireciona para o affiliate_url já persistido.
 *
 * EP-07: Validação e atribuição de link de campanha (?c=<code>).
 * Se ?c= for passado, valida se o token pertence à oferta/slug. Falha fechado
 * se for inválido, trocado ou de outro tenant (C-06).
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const campaignCode = url.searchParams.get("c");
  if (await publicProjectionReady()) return publicGo(req, slug, campaignCode);

  let campaignAttribution: CampaignTokenValidationResult | null = null;
  if (campaignCode) {
    campaignAttribution = await validateCampaignTokenForSlug(campaignCode, slug);
    if (!campaignAttribution.valid) {
      // C-06: token inválido ou de outro produto falha fechado, nunca troca de dono.
      return new Response("Link de campanha inválido ou não correspondente a este produto", { status: 404 });
    }
  }

  // Roteamento por ESTRATÉGIA DE LINK, não por nome de loja.
  const parsed = parseProductSlug(slug);
  if (parsed && marketplaceDef(parsed.marketplace)?.linkStrategy === "pregenerated") {
    return handlePreGenerated(parsed.externalId, parsed.marketplace, req, campaignAttribution);
  }

  if (affiliateLinksV2Enabled()) {
    return handleV2(req, slug, campaignAttribution);
  }
  return handleLegacy(req, slug, campaignAttribution);
}

/**
 * Caminho de link PRÉ-GERADO (Shopee desde M3, AliExpress desde M5): o link
 * monetizado já existe em `publication.affiliate_url`. O redirect não chama a
 * API de marketplace nenhum — latência e rate limit nunca entram no caminho
 * crítico do clique.
 */
async function handlePreGenerated(
  externalId: string,
  marketplace: string,
  req: Request,
  attribution: CampaignTokenValidationResult | null,
) {
  const resolution = await resolvePreGeneratedLink(externalId, marketplace);
  const target = shopeeRedirectTarget(resolution);

  if (target.kind === "not_found") {
    // Falha fechada: nunca redireciona para a URL crua do produto.
    return new Response(`Oferta não encontrada: ${target.reason}`, { status: 404 });
  }

  const sql = db();
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "0.0.0.0";
    const ipHash = createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0, 32);

    let recorded = false;
    if (attribution?.valid && attribution.campaignPublicationId) {
      try {
        await sql`
          insert into garimpa.click_event
            (id, tenant_id, publication_id, campaign_publication_id, campaign_link_id, user_agent, referer, ip_hash)
          values (gen_random_uuid()::text, ${target.tenantId}, ${target.publicationId},
                  ${attribution.campaignPublicationId}, ${attribution.campaignLinkId ?? null},
                  ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
        `;
        recorded = true;
      } catch {
        // Fallback para schema sem M-07
      }
    }

    if (!recorded) {
      await sql`
        insert into garimpa.click_event
          (id, tenant_id, publication_id, user_agent, referer, ip_hash)
        values (gen_random_uuid()::text, ${target.tenantId}, ${target.publicationId},
                ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
      `;
    }

    return new Response(null, {
      status: 302,
      headers: { Location: target.url, "Cache-Control": "no-store" },
    });
  } finally {
    await sql.end();
  }
}

/** Caminho V2 (E3): comissão por afiliado, sem fallback global. */
async function handleV2(
  req: Request,
  slug: string,
  attribution: CampaignTokenValidationResult | null,
) {
  const resolution = await resolvePublicationForLink(slug);
  if (!resolution) {
    // Não encontrado OU config ausente/suspensa: falhar fechado, nunca usar a tag da casa.
    return new Response("Oferta não encontrada ou configuração de afiliado indisponível", { status: 404 });
  }

  const sql = db();
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "0.0.0.0";
    const ipHash = createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0, 32);

    let recorded = false;
    if (attribution?.valid && attribution.campaignPublicationId) {
      try {
        await sql`
          insert into garimpa.click_event
            (id, tenant_id, publication_id, campaign_publication_id, campaign_link_id, user_agent, referer, ip_hash)
          values (gen_random_uuid()::text, ${resolution.tenantId}, ${resolution.publicationId},
                  ${attribution.campaignPublicationId}, ${attribution.campaignLinkId ?? null},
                  ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
        `;
        recorded = true;
      } catch {
        // Fallback para schema sem M-07
      }
    }

    if (!recorded) {
      await sql`
        insert into garimpa.click_event
          (id, tenant_id, publication_id, user_agent, referer, ip_hash)
        values (gen_random_uuid()::text, ${resolution.tenantId}, ${resolution.publicationId},
                ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
      `;
    }

    const target = affiliateLink(resolution.productUrl, slug, {
      trackingId: resolution.trackingId,
      toolId: resolution.toolId,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  } finally {
    await sql.end();
  }
}

/** Caminho legado: preserva links antigos enquanto a flag V2 está desligada. */
async function handleLegacy(
  req: Request,
  slug: string,
  attribution: CampaignTokenValidationResult | null,
) {
  const sql = db();
  try {
    const rows = await sql<{ id: string; product_url: string; tenant_id: string }[]>`
      insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
      select gen_random_uuid()::text, p.tenant_id, p.id, 'aff_local', 'web', ${slug}
      from garimpa.product p
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where p.marketplace = 'mercadolivre' and 'ml-' || p.external_id = ${slug}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      on conflict (slug) do update set published_at = now()
      returning id, tenant_id
    `;
    if (rows.length === 0) {
      return new Response("Oferta não encontrada", { status: 404 });
    }
    const pub = rows[0]!;

    const product = await sql<{ product_url: string }[]>`
      select p.product_url from garimpa.product p
      join garimpa.publication pub on pub.product_id = p.id
      join garimpa.product_curation pc
        on pc.product_id = p.id and pc.tenant_id = p.tenant_id
       and pc.status = ${PUBLIC_CURATION_STATUS}
      where pub.id = ${pub.id}
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
    `;

    // IP só como hash com sal fixo — dedup sem armazenar dado pessoal (LGPD).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "0.0.0.0";
    const ipHash = createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0, 32);

    let recorded = false;
    if (attribution?.valid && attribution.campaignPublicationId) {
      try {
        await sql`
          insert into garimpa.click_event
            (id, tenant_id, publication_id, campaign_publication_id, campaign_link_id, user_agent, referer, ip_hash)
          values (gen_random_uuid()::text, ${pub.tenant_id}, ${pub.id},
                  ${attribution.campaignPublicationId}, ${attribution.campaignLinkId ?? null},
                  ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
        `;
        recorded = true;
      } catch {
        // Fallback para schema sem M-07
      }
    }

    if (!recorded) {
      await sql`
        insert into garimpa.click_event
          (id, tenant_id, publication_id, user_agent, referer, ip_hash)
        values (gen_random_uuid()::text, ${pub.tenant_id}, ${pub.id},
                ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
      `;
    }

    // Legado: tag global da casa. Será removido quando a V2 estiver estabilizada.
    const trackingId = process.env.ML_TRACKING_ID!;
    const toolId = process.env.ML_TOOL_ID!;
    const target = affiliateLink(product[0]!.product_url, slug, { trackingId, toolId });
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  } finally {
    await sql.end();
  }
}
