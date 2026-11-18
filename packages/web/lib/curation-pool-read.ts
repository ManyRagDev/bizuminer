import type { AccountContext } from "./account-context.ts";
import { withAccountDb } from "./tenant-db.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

export type PoolClass = "hot" | "warm" | "cold";
export type CurationPool = {capacity:number;counts:Record<PoolClass,number>;items:Array<{
  id:string;title:string;marketplace:string;classification:PoolClass;score:number|null;
  inEdition:boolean;nextSlot:boolean;promotion:boolean;watchPriority:boolean;editoriallyBlocked:boolean;
}>};

/** Derives the pool at read time; it never changes a product or creates work. */
export async function readCurationPool(account:AccountContext):Promise<CurationPool|null> {
  try {
    return await withAccountDb(account,async tx=>{
      const [policy]=await tx<{version:number;enabled:boolean;config:{capacity?:number;scoreWeights?:ScoreWeights}}[]>`
        select version,enabled,config from garimpa.curation_policy_v2 where tenant_id=${account.tenantId}`;
      if(!policy?.enabled) return null;
      const capacity=policy.config.capacity ?? 24;
      if(!Number.isInteger(capacity) || capacity<1 || capacity>24) throw new Error('pool_capacity_invalid');
      const scoreVersion=scoreWeightsRevision(policy.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS);
      const rows=await tx<Array<{id:string;title:string;marketplace:string;classification:PoolClass;score:string|number|null;
        in_edition:boolean;next_slot:boolean;promotion:boolean;watch_priority:boolean;editorially_blocked:boolean;class_total:number}>>`
        with edition as materialized (
          select item->>'productId' as product_id from garimpa.recommendation_edition e
          join garimpa.recommendation_channel channel on channel.tenant_id=e.tenant_id and channel.channel=e.channel
          cross join lateral jsonb_array_elements(e.inputs) item
          join garimpa.price_observation o on o.tenant_id=e.tenant_id and o.product_id=item->>'productId' and o.id=item->>'observationId'
          where e.tenant_id=${account.tenantId} and e.channel='home' and channel.enabled
            and e.config_version=channel.version and (channel.valid_until is null or channel.valid_until>now())
            and item->>'curationPolicyVersion'=${String(policy.version)}
            and (item->>'validUntil')::timestamptz>now()
            and now()<garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id)
            and garimpa.has_current_curation_assessment(o.tenant_id,o.product_id,o.id)
            and not garimpa.equivalent_human_veto(o.tenant_id,o.product_id,o.id)
            and o.id=(select newest.id from garimpa.price_observation newest where newest.tenant_id=o.tenant_id and newest.product_id=o.product_id
              and newest.option_key=o.option_key order by newest.observed_at desc,newest.id desc limit 1)
        ), next_slots as materialized (
          select distinct on(slot.channel) slot.predicted from garimpa.pauta_slot_occurrence slot
          join garimpa.pauta_slot_config config on config.tenant_id=slot.tenant_id and config.channel=slot.channel
            and config.enabled and config.version=slot.config_version
          join garimpa.recommendation_channel channel on channel.tenant_id=slot.tenant_id and channel.channel=slot.channel and channel.enabled
          where slot.tenant_id=${account.tenantId} and slot.status='pending' and slot.scheduled_at>now()-interval '30 minutes'
            and (channel.valid_until is null or channel.valid_until>now())
          order by slot.channel,slot.scheduled_at
        ), slot_items as materialized (
          select distinct item->>'productId' as product_id from next_slots cross join lateral jsonb_array_elements(predicted) item
        ), active_promotions as materialized (
          select distinct product_id from garimpa.curation_promotion where tenant_id=${account.tenantId}
            and reason in ('promotion','renewal','slot') and status in ('pending','claimed') and deadline>now() and policy_version=${policy.version}
        ), watch_tasks as materialized (
          select distinct target.product_id from garimpa.recapture_target target
          join garimpa.recapture_task task on task.tenant_id=target.tenant_id and task.id=target.task_id
          where target.tenant_id=${account.tenantId} and target.watched and target.status='pending'
            and task.status in ('pending','claimed') and task.deadline>now()
          union select product_id from garimpa.curation_promotion where tenant_id=${account.tenantId}
            and reason='watch' and status in ('pending','claimed') and deadline>now()
          union select product_id from garimpa.recapture_unroutable where tenant_id=${account.tenantId}
            and watched and resolved_at is null and deadline>now()
        ), pool as materialized (
          select p.id,p.title,p.marketplace,score.score_vitrine as score,
            (edition.product_id is not null) as in_edition,(slot.product_id is not null) as next_slot,
            (promotion.product_id is not null) as promotion,(watch.product_id is not null) as watch_priority,
            coalesce(c.status='rejected',false) as editorially_blocked,
            score.product_id is not null and observation.observed_at>=now()-case when p.marketplace='shopee' then interval '72 hours' else interval '48 hours' end
              and observation.observed_at<=now() and coalesce(c.status,'pending')<>'rejected' as current_candidate
          from garimpa.product p
          left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
          left join lateral (select o.id,o.observed_at from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
            and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
              or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
            order by o.observed_at desc,o.id desc limit 1) observation on true
          left join garimpa.curation_score_projection score on score.tenant_id=p.tenant_id and score.product_id=p.id
            and score.observation_id=observation.id and score.policy_version=${scoreVersion}
          left join edition on edition.product_id=p.id left join slot_items slot on slot.product_id=p.id
          left join active_promotions promotion on promotion.product_id=p.id left join watch_tasks watch on watch.product_id=p.id
          where p.tenant_id=${account.tenantId} and (coalesce(c.status,'pending')<>'rejected' or watch.product_id is not null)
        ), non_hot as (
          select id,row_number() over(order by score desc nulls last,id) as position from pool
          where not (in_edition or next_slot or promotion) and current_candidate
        ), classified as (
          select pool.*,case when editorially_blocked then 'cold' when in_edition or next_slot or promotion then 'hot'
            when non_hot.position<=${capacity*3} then 'warm' else 'cold' end as class
          from pool left join non_hot using(id)
        ), ranked as (
          select *,count(*) over(partition by class)::int as class_total,
            row_number() over(partition by class order by case when watch_priority then 0 else 1 end,score desc nulls last,id) as class_position from classified
        ) select id,title,marketplace,class as classification,score,in_edition,next_slot,promotion,watch_priority,editorially_blocked,class_total
          from ranked where class_position<=case class when 'hot' then 100 when 'warm' then 72 else 10 end
          order by case class when 'hot' then 0 when 'warm' then 1 else 2 end,class_position`;
      const counts:Record<PoolClass,number>={hot:0,warm:0,cold:0};
      for(const row of rows) counts[row.classification]=row.class_total;
      return {capacity,counts,items:rows.map(row=>({id:row.id,title:row.title,marketplace:row.marketplace,
        classification:row.classification,score:row.score===null ? null : Number(row.score),inEdition:row.in_edition,
        nextSlot:row.next_slot,promotion:row.promotion,watchPriority:row.watch_priority,editoriallyBlocked:row.editorially_blocked}))};
    });
  } catch {return null;}
}
