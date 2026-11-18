import { PRODUCT_EVIDENCE_TTL_DAYS, PUBLIC_CURATION_STATUS } from "./catalog-policy.ts";
import { db } from "./db.ts";
import { buildPautaMlTarget, httpsShopUrl, verifyPautaLink, type MlPautaConfig } from "./pauta-link.ts";
import { withTenantDb } from "./tenant-db.ts";

type OfferRow = MlPautaConfig & {
  title: string;
  image_url: string | null;
  product_url: string;
  external_id: string;
};

export async function readPublicPautaLink(token: string, sqlFactory: typeof db = db) {
  const signed = verifyPautaLink(token);
  if (!signed) return null;
  const { tenantId, productId } = signed;
  return withTenantDb(tenantId, async tx => {
    const [v2Schema] = await tx<{ ready: boolean }[]>`
      select to_regclass('garimpa.curation_policy_v2') is not null
        and to_regprocedure('garimpa.current_offer_valid_until(text,text,text)') is not null as ready`;
    const [offer] = v2Schema?.ready ? await tx<OfferRow[]>`
      select p.title,p.image_url,p.product_url,p.external_id,config.tracking_id,config.tool_id
      from garimpa.product p
      join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      join garimpa.affiliate_account a on a.tenant_id=p.tenant_id and a.status='active'
      join garimpa.affiliate_marketplace_config config on config.affiliate_id=a.id
        and config.marketplace=p.marketplace and config.status='active'
      left join garimpa.publication pub on pub.tenant_id=p.tenant_id and pub.product_id=p.id
        and pub.affiliate_id=a.id and pub.channel='web'
      left join lateral (select o.id from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
          or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by o.observed_at desc,o.id desc limit 1) evidence on true
      where p.tenant_id=${tenantId} and p.id=${productId} and p.marketplace='mercadolivre'
        and c.status=${PUBLIC_CURATION_STATUS} and coalesce(pub.status,'active')='active'
        and (not exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=p.tenant_id
          and (policy.enabled or policy.factual_gate_required))
          or now()<garimpa.current_offer_valid_until(p.tenant_id,p.id,evidence.id))
        and p.last_seen_at between now()-make_interval(days=>${PRODUCT_EVIDENCE_TTL_DAYS}) and now()+interval '1 minute'`
    : await tx<OfferRow[]>`
      select p.title,p.image_url,p.product_url,p.external_id,config.tracking_id,config.tool_id
      from garimpa.product p
      join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      join garimpa.affiliate_account a on a.tenant_id=p.tenant_id and a.status='active'
      join garimpa.affiliate_marketplace_config config on config.affiliate_id=a.id
        and config.marketplace=p.marketplace and config.status='active'
      left join garimpa.publication pub on pub.tenant_id=p.tenant_id and pub.product_id=p.id
        and pub.affiliate_id=a.id and pub.channel='web'
      where p.tenant_id=${tenantId} and p.id=${productId} and p.marketplace='mercadolivre'
        and c.status=${PUBLIC_CURATION_STATUS} and coalesce(pub.status,'active')='active'
        and p.last_seen_at between now()-make_interval(days=>${PRODUCT_EVIDENCE_TTL_DAYS}) and now()+interval '1 minute'`;
    if (!offer) return null;
    const target = buildPautaMlTarget(offer.product_url, offer.external_id, offer);
    if (!target) return null;
    const imageUrl = httpsShopUrl(offer.image_url, ["mlstatic.com", "mercadolivre.com.br", "mercadolibre.com"])?.href;
    return { id: productId, title: offer.title, imageUrl, target };
  }, sqlFactory);
}

export async function redirectPublicPautaLink(token: string, sqlFactory: typeof db = db) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const offer = await readPublicPautaLink(token, sqlFactory);
    if (!offer) return new Response("Oferta indisponível", { status: 404, headers });
    return new Response(null, { status: 302, headers: { ...headers, Location: offer.target } });
  } catch {
    return new Response("Não foi possível consultar a oferta agora", { status: 503, headers });
  }
}
