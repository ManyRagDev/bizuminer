import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";

/** Prepare account-owned, local affiliate routes after current semantic eligibility.
 * This never activates a paused publication, creates price evidence or contacts a store.
 * Public projections still require factual validity and the selection policy.
 */
export async function prepareCurationPublications(sql: Sql, tenantId: string): Promise<number> {
  return withMonitoringDb(sql,tenantId,async tx=>{
    const rows=await tx<{id:string}[]>`
      insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
      select gen_random_uuid()::text,p.tenant_id,p.id,account.id,'web',
        (case when p.tenant_id='local' then '' else account.public_slug||'-' end)
          ||(case p.marketplace when 'amazon' then 'amz-' else 'ml-' end)||p.external_id
      from garimpa.product p
      join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved'
      join garimpa.affiliate_account account on account.tenant_id=p.tenant_id and account.status='active'
      join garimpa.affiliate_marketplace_config cfg on cfg.affiliate_id=account.id and cfg.marketplace=p.marketplace and cfg.status='active'
      join lateral(select o.id from garimpa.price_observation o
        where o.tenant_id=p.tenant_id and o.product_id=p.id
          and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
            or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by o.observed_at desc,o.id desc limit 1) o on true
      where p.tenant_id=${tenantId} and garimpa.has_current_curation_assessment(p.tenant_id,p.id,o.id)
        and (p.marketplace='amazon' and cfg.tracking_id ~ '^[A-Za-z0-9_-]{1,80}$'
          or p.marketplace='mercadolivre' and nullif(btrim(cfg.tracking_id),'') is not null and nullif(btrim(cfg.tool_id),'') is not null)
        and not exists(select 1 from garimpa.publication existing where existing.tenant_id=p.tenant_id
          and existing.affiliate_id=account.id and existing.product_id=p.id and existing.channel='web')
      on conflict(affiliate_id,product_id,channel) do nothing returning id`;
    return rows.length;
  });
}
