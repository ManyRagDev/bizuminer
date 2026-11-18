import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";

/** Creates bounded work only for explicit, active watches; favorites are not watches. */
export async function planShopeeWatches(sql:Sql, tenantId:string) {
  return withMonitoringDb(sql,tenantId,async tx=>{
    // A withdrawn watch no longer causes external work. A lookup already in
    // flight is reconciled separately and is not falsified as a cancellation.
    await tx`update garimpa.curation_promotion p set status='cancelled',updated_at=now(),
      result=jsonb_build_object('reason',case when p.price_type is distinct from
        (select o.offer_evidence->>'priceType' from garimpa.price_observation o
          where o.tenant_id=p.tenant_id and o.product_id=p.product_id and o.option_key=p.option_key
          order by o.observed_at desc,o.id desc limit 1) then 'watch_price_type_changed' else 'watch_inactive' end)
      where p.tenant_id=${tenantId} and p.reason='watch' and p.status='pending'
        and (not exists(select 1 from garimpa.monitoring_interest_options(${tenantId}) w where w.product_id=p.product_id
          and coalesce(w.option_key,'listing')=p.option_key and w.active_watches>0)
          or p.price_type is distinct from (select o.offer_evidence->>'priceType' from garimpa.price_observation o
            where o.tenant_id=p.tenant_id and o.product_id=p.product_id and o.option_key=p.option_key
            order by o.observed_at desc,o.id desc limit 1))`;
    const rows=await tx<{id:string}[]>`insert into garimpa.curation_promotion
      (tenant_id,product_id,option_key,price_type,requested_observation_id,requested_revision,policy_version,reason,priority,deadline,next_attempt_at)
      select ${tenantId},p.id,o.option_key,o.offer_evidence->>'priceType',o.id,'watch:'||o.id,1,'watch',100,
        now()+interval '48 hours',now()
      from (select product_id,coalesce(option_key,'listing') as option_key,sum(active_watches) as active_watches
        from garimpa.monitoring_interest_options(${tenantId}) group by product_id,coalesce(option_key,'listing')) w
      join garimpa.product p on p.tenant_id=${tenantId} and p.id=w.product_id and p.marketplace='shopee'
      join lateral (select o.id,o.option_key,o.offer_evidence,o.observed_at
        from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
          and o.option_key=coalesce(w.option_key,'listing')
        order by o.observed_at desc,o.id desc limit 1) o on true
      where w.active_watches>0 and o.observed_at<=now()-interval '24 hours'
        and o.offer_evidence->>'priceType' in ('exact','range','from')
        and o.offer_evidence->>'currency'='BRL'
        -- Do not let already planned watches consume the bounded scan and
        -- starve later products. A changed fact may still refresh a pending job.
        and not exists(select 1 from garimpa.curation_promotion active
          where active.tenant_id=p.tenant_id and active.product_id=p.id and active.option_key=o.option_key
            and active.price_type=o.offer_evidence->>'priceType' and active.reason='watch'
            and (active.status='claimed' or (active.status='pending' and active.requested_observation_id=o.id)))
      order by o.observed_at,p.id limit 200
      on conflict(tenant_id,product_id,option_key,price_type,reason) where status in ('pending','claimed') do update
        set requested_observation_id=excluded.requested_observation_id,requested_revision=excluded.requested_revision,
          updated_at=now()
        where garimpa.curation_promotion.status='pending'
          and garimpa.curation_promotion.requested_observation_id is distinct from excluded.requested_observation_id
      returning id`;
    return rows.length;
  });
}
