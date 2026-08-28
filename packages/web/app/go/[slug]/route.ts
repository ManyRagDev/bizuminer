import { createHash } from "node:crypto";
import {
  affiliateLink,
  db,
  resolvePublicationForLink,
  resolvePreGeneratedLink,
  shopeeRedirectTarget,
} from "../../../lib/db";
import { affiliateLinksV2Enabled } from "../../../lib/flags";
import { marketplaceDef, parseProductSlug } from "../../../lib/marketplaces";

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
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Roteamento por ESTRATÉGIA DE LINK, não por nome de loja. Antes era
  // `parsed?.marketplace === "shopee"`, e a AliExpress caía no ramo do
  // Mercado Livre virando 404 em todo produto. A pergunta certa não é "que
  // loja é?" e sim "o link já está pronto?".
  const parsed = parseProductSlug(slug);
  if (parsed && marketplaceDef(parsed.marketplace)?.linkStrategy === "pregenerated") {
    return handlePreGenerated(parsed.externalId, parsed.marketplace, req);
  }

  if (affiliateLinksV2Enabled()) {
    return handleV2(req, slug);
  }
  return handleLegacy(req, slug);
}

/**
 * Caminho de link PRÉ-GERADO (Shopee desde M3, AliExpress desde M5): o link
 * monetizado já existe em `publication.affiliate_url`. O redirect não chama a
 * API de marketplace nenhum — latência e rate limit nunca entram no caminho
 * crítico do clique.
 */
async function handlePreGenerated(externalId: string, marketplace: string, req: Request) {
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

    await sql`
      insert into garimpa.click_event
        (id, tenant_id, publication_id, user_agent, referer, ip_hash)
      values (gen_random_uuid()::text, ${target.tenantId}, ${target.publicationId},
              ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
    `;

    return new Response(null, {
      status: 302,
      headers: { Location: target.url, "Cache-Control": "no-store" },
    });
  } finally {
    await sql.end();
  }
}

/** Caminho V2 (E3): comissão por afiliado, sem fallback global. */
async function handleV2(req: Request, slug: string) {
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

    await sql`
      insert into garimpa.click_event
        (id, tenant_id, publication_id, user_agent, referer, ip_hash)
      values (gen_random_uuid()::text, ${resolution.tenantId}, ${resolution.publicationId},
              ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
    `;

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
async function handleLegacy(req: Request, slug: string) {
  const sql = db();
  try {
    const rows = await sql<{ id: string; product_url: string; tenant_id: string }[]>`
      insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
      select gen_random_uuid()::text, p.tenant_id, p.id, 'aff_local', 'web', ${slug}
      from garimpa.product p
      where p.marketplace = 'mercadolivre' and 'ml-' || p.external_id = ${slug}
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
      where pub.id = ${pub.id}
    `;

    // IP só como hash com sal fixo — dedup sem armazenar dado pessoal (LGPD).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "0.0.0.0";
    const ipHash = createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0, 32);

    await sql`
      insert into garimpa.click_event
        (id, tenant_id, publication_id, user_agent, referer, ip_hash)
      values (gen_random_uuid()::text, ${pub.tenant_id}, ${pub.id},
              ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
    `;

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
