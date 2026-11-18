import type { Sql } from "postgres";
import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import type { PautaChannel } from "./pauta-policy.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

type Config = { version:number;enabled:boolean;timezone:string;hours:string[];items_per_slot:number;repeat_hours:number;
  impulse_limit_cents:number|null;allow_price_improvement:boolean;improvement_percent:number;dom_window_hours:number };
type ConfigInput = { version:number|null;enabled:boolean;timezone:string;hours:string[];itemsPerSlot:number;repeatHours:number;
  impulseLimitCents:number|null;allowPriceImprovement:boolean;improvementPercent:number;domWindowHours:number };

export async function readPautaSlots(context:AccountContext,channel:PautaChannel,sqlFactory:typeof db=db) {
  return withAccountDb(context,async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select to_regclass('garimpa.pauta_slot_config') is not null
      and to_regclass('garimpa.pauta_slot_occurrence') is not null as ready`;
    if(!schema?.ready) {
      return {config:{version:null,enabled:false,timezone:'America/Sao_Paulo',hours:[],items_per_slot:3,
        repeat_hours:240,impulse_limit_cents:20000,allow_price_improvement:false,improvement_percent:5,dom_window_hours:12},
        channelActive:false,slots:[],canConfigure:false};
    }
    const [config]=await tx<Config[]>`select version,enabled,timezone,hours,items_per_slot,repeat_hours,impulse_limit_cents,
      allow_price_improvement,improvement_percent,dom_window_hours from garimpa.pauta_slot_config
      where tenant_id=${context.tenantId} and channel=${channel}`;
    const [channelState]=await tx<{active:boolean}[]>`select enabled and (valid_until is null or valid_until>now()) as active
      from garimpa.recommendation_channel where tenant_id=${context.tenantId} and channel=${channel}`;
    const slots=await tx<{id:string;scheduled_at:Date;status:string;predicted:unknown}[]>`
      select o.id,o.scheduled_at,o.status,o.predicted from garimpa.pauta_slot_occurrence o
      join garimpa.pauta_slot_config c on c.tenant_id=o.tenant_id and c.channel=o.channel
        and c.version=o.config_version and c.enabled
      join garimpa.recommendation_channel ch on ch.tenant_id=o.tenant_id and ch.channel=o.channel
        and ch.enabled and (ch.valid_until is null or ch.valid_until>now())
      where o.tenant_id=${context.tenantId} and o.channel=${channel} and o.status='pending'
        and o.scheduled_at>now()-interval '30 minutes' order by o.scheduled_at limit 3`;
    return {config:config ?? {version:null,enabled:false,timezone:'America/Sao_Paulo',hours:[],items_per_slot:3,
      repeat_hours:240,impulse_limit_cents:20000,allow_price_improvement:false,improvement_percent:5,dom_window_hours:12},
      channelActive:channelState?.active===true,
      slots:slots.map(slot=>({id:slot.id,scheduledAt:slot.scheduled_at.toISOString(),status:slot.status,predicted:slot.predicted})),
      canConfigure:context.actor==='human' && context.membershipRole==='owner'};
  },sqlFactory);
}

export async function configurePautaSlots(context:AccountContext,channel:PautaChannel,input:ConfigInput,sqlFactory:typeof db=db) {
  if(context.actor!=='human' || context.membershipRole!=='owner') return 'forbidden' as const;
  if(!input || (input.version!==null && (!Number.isInteger(input.version) || input.version<1))
    || typeof input.enabled!=='boolean' || typeof input.timezone!=='string' || input.timezone.length>80
    || !Array.isArray(input.hours) || input.hours.length>5 || new Set(input.hours).size!==input.hours.length
    || input.hours.some(hour=>typeof hour!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour))
    || input.enabled && input.hours.length===0 || !Number.isInteger(input.itemsPerSlot) || input.itemsPerSlot<1 || input.itemsPerSlot>4
    || !Number.isInteger(input.repeatHours) || input.repeatHours<0 || input.repeatHours>720
    || input.impulseLimitCents!==null && (!Number.isInteger(input.impulseLimitCents) || input.impulseLimitCents<1 || input.impulseLimitCents>100_000_000)
    || typeof input.allowPriceImprovement!=='boolean' || !Number.isInteger(input.improvementPercent) || input.improvementPercent<1 || input.improvementPercent>50
    || ![12,24].includes(input.domWindowHours))
    return 'invalid' as const;
  return withAccountDb(context,async tx=>{
    const [zone]=await tx`select name from pg_catalog.pg_timezone_names where name=${input.timezone} limit 1`;
    if(!zone) return 'invalid' as const;
    // The scheduler reads all channels for this tenant in one transaction.
    // Serialize edits with it before changing config or pending occurrences.
    await tx`select pg_advisory_xact_lock(hashtextextended(${`pauta-slots:${context.tenantId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`pauta-slot:${context.tenantId}:${channel}`},0))`;
    const [previous]=await tx<{version:number;enabled:boolean;timezone:string;hours:string[]}[]>`select version,enabled,timezone,hours from garimpa.pauta_slot_config
      where tenant_id=${context.tenantId} and channel=${channel} for update`;
    if((previous?.version ?? null)!==input.version) return 'conflict' as const;
    await tx`insert into garimpa.pauta_slot_config(tenant_id,channel,version,enabled,timezone,hours,items_per_slot,
        repeat_hours,impulse_limit_cents,allow_price_improvement,improvement_percent,dom_window_hours)
      values(${context.tenantId},${channel},${(previous?.version ?? 0)+1},${input.enabled},${input.timezone},
        ${tx.json([...input.hours].sort())},${input.itemsPerSlot},${input.repeatHours},${input.impulseLimitCents},
        ${input.allowPriceImprovement},${input.improvementPercent},${input.domWindowHours})
      on conflict(tenant_id,channel) do update set version=excluded.version,enabled=excluded.enabled,
        timezone=excluded.timezone,hours=excluded.hours,items_per_slot=excluded.items_per_slot,repeat_hours=excluded.repeat_hours,
        impulse_limit_cents=excluded.impulse_limit_cents,allow_price_improvement=excluded.allow_price_improvement,
        improvement_percent=excluded.improvement_percent,dom_window_hours=excluded.dom_window_hours,updated_at=now()`;
    const sameSchedule=previous?.enabled===input.enabled && previous?.timezone===input.timezone
      && JSON.stringify([...(previous?.hours ?? [])].sort())===JSON.stringify([...input.hours].sort());
    if(sameSchedule) await tx`update garimpa.pauta_slot_occurrence set config_version=${(previous?.version ?? 0)+1},updated_at=now()
      where tenant_id=${context.tenantId} and channel=${channel} and status='pending'`;
    else await tx`update garimpa.pauta_slot_occurrence set status='cancelled',updated_at=now()
      where tenant_id=${context.tenantId} and channel=${channel} and status='pending'`;
    return 'ok' as const;
  },sqlFactory);
}

/** Reconstructs only the current/next occurrence, never a backlog of sends. */
export async function refreshPautaSlots(sql:Sql,tenantId:string):Promise<Date|null> {
  return withMonitoringDb(sql,tenantId,async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${`pauta-slots:${tenantId}`},0))`;
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [policy]=await tx<{enabled:boolean;config:{scoreWeights?:ScoreWeights}}[]>`select enabled,config
      from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    const scoreVersion=policy?.enabled ? scoreWeightsRevision(policy.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS) : null;
    await tx`update garimpa.pauta_slot_occurrence o set status=case when o.scheduled_at<=now()-interval '30 minutes'
      then 'expired' else 'cancelled' end,updated_at=now() where o.tenant_id=${tenantId} and o.status='pending'
      and (o.scheduled_at<=now()-interval '30 minutes' or not exists(select 1 from garimpa.pauta_slot_config c
        join garimpa.recommendation_channel channel on channel.tenant_id=c.tenant_id and channel.channel=c.channel
        where c.tenant_id=o.tenant_id and c.channel=o.channel and c.enabled and channel.enabled
          and (channel.valid_until is null or channel.valid_until>now()) and c.version=o.config_version))`;
    await tx`insert into garimpa.pauta_slot_occurrence(tenant_id,channel,scheduled_at,config_version)
      select c.tenant_id,c.channel,choice.scheduled_at,c.version from garimpa.pauta_slot_config c
      join garimpa.recommendation_channel channel on channel.tenant_id=c.tenant_id and channel.channel=c.channel
      cross join lateral (select (((now() at time zone c.timezone)::date+d.day + hour.value::time) at time zone c.timezone) as scheduled_at
        from generate_series(0,1) d(day) cross join jsonb_array_elements_text(c.hours) hour(value)
        where (((now() at time zone c.timezone)::date+d.day + hour.value::time) at time zone c.timezone)>now()-interval '30 minutes'
        order by scheduled_at limit 1) choice
      where c.tenant_id=${tenantId} and c.enabled and channel.enabled
        and (channel.valid_until is null or channel.valid_until>now())
      on conflict(tenant_id,channel,scheduled_at) do update set status='pending',config_version=excluded.config_version,
        predicted='[]'::jsonb,updated_at=now()
      where garimpa.pauta_slot_occurrence.status='cancelled' and garimpa.pauta_slot_occurrence.scheduled_at>now()`;
    // The forecast contains identities only. It reserves neither price nor
    // product and never records an exposure.
    await tx`with recent_category as materialized (
      select e.channel,coalesce(nullif(actual.product->>'category',''),previous.category,'sem_categoria') as category,
        count(*)::int as count
      from garimpa.recommendation_exposure e
      join garimpa.product previous on previous.tenant_id=e.tenant_id and previous.id=e.product_id
      left join garimpa.recommendation_edition_archive archive on archive.tenant_id=e.tenant_id
        and archive.channel=e.channel and archive.id=e.edition_id
      left join lateral (select value as product from jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb))
        where value->>'id'=e.product_id limit 1) actual on true
      where e.tenant_id=${tenantId} and e.confirmed_at>=now()-interval '240 hours'
      group by e.channel,coalesce(nullif(actual.product->>'category',''),previous.category,'sem_categoria')
    ) update garimpa.pauta_slot_occurrence slot set predicted=forecast.items,updated_at=now()
      from garimpa.pauta_slot_config config cross join lateral (select 1) anchor
      cross join lateral (select coalesce(jsonb_agg(jsonb_build_object('productId',ranked.product_id,
        'optionKey',ranked.option_key) order by ranked.manual_position,ranked.forecast_score desc,ranked.product_id),'[]'::jsonb) as items
        from (select * from (select s.product_id,s.option_key,s.score_pauta,
          s.score_pauta-least(12,coalesce(history.count,0)*2) as forecast_score,
          coalesce(manual.position,9223372036854775807) as manual_position,
          row_number() over (partition by coalesce('group:'||garimpa.equivalence_group_for_observation(p.tenant_id,p.id,o.id)::text,
              'product:'||p.id)
            order by manual.position nulls last,s.score_pauta-least(12,coalesce(history.count,0)*2) desc,s.product_id) as equivalent_rank
          from garimpa.curation_score_projection s
          join garimpa.product p on p.tenant_id=s.tenant_id and p.id=s.product_id
          join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='approved'
          join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id
          join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
          join garimpa.recommendation_channel channel on channel.tenant_id=config.tenant_id and channel.channel=config.channel
          left join recent_category history on history.channel=config.channel and history.category=p.category
            and p.category is not null and p.category<>'Geral'
          left join lateral (select ordinality as position from jsonb_array_elements_text(coalesce(channel.manual_order,'[]'::jsonb))
            with ordinality item(value,ordinality) where item.value=p.id limit 1) manual on true
          left join lateral (
            select e.product_id,e.option_key,e.price_cents,e.confirmed_at,entry.value->>'priceType' as price_type
            from garimpa.recommendation_exposure e
            left join garimpa.recommendation_edition_archive archive on archive.tenant_id=e.tenant_id
              and archive.channel=e.channel and archive.id=e.edition_id
            left join lateral (select value from jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb))
              where value->>'id'=e.product_id limit 1) entry on true
            where e.tenant_id=p.tenant_id and e.channel=config.channel
              and e.confirmed_at>=now()-config.repeat_hours*interval '1 hour'
              and (e.product_id=p.id or exists(select 1 from garimpa.curation_equivalence_member member
                where member.tenant_id=p.tenant_id and member.active and member.product_id=e.product_id
                  and member.option_key=e.option_key
                  and member.group_id=garimpa.equivalence_group_for_observation(p.tenant_id,p.id,o.id)))
            order by e.confirmed_at desc,e.id desc limit 1
          ) exposure on true
          where s.tenant_id=config.tenant_id and s.score_pauta is not null and s.policy_version=${scoreVersion} and o.observed_at<=now()
            and o.observed_at>=now()-case when p.marketplace='shopee' then interval '72 hours' else interval '48 hours' end
            and s.option_key=coalesce((select choice.option_key from garimpa.editorial_offer_choice choice
                where choice.tenant_id=p.tenant_id and choice.product_id=p.id),
              (select newest.option_key from garimpa.price_observation newest where newest.tenant_id=p.tenant_id and newest.product_id=p.id
                order by newest.observed_at desc,newest.id desc limit 1))
            and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=p.tenant_id
              and latest.product_id=p.id and latest.option_key=s.option_key order by latest.observed_at desc,latest.id desc limit 1)
            and a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
              where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
            and garimpa.has_current_curation_assessment(p.tenant_id,p.id,o.id)
            and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
            and not garimpa.equivalent_human_veto(p.tenant_id,p.id,o.id)
            and (channel.manual_order is null or manual.position is not null)
            and (exposure.product_id is null or coalesce(config.allow_price_improvement
              and exposure.product_id=p.id and s.option_key<>'listing' and s.option_key=exposure.option_key
              and o.offer_evidence->>'priceType'='exact' and exposure.price_type='exact'
              and o.observed_at>exposure.confirmed_at
              and o.price_cents<=exposure.price_cents*(1-config.improvement_percent::numeric/100),false))
            and (config.impulse_limit_cents is null or case o.offer_evidence->>'priceType'
              when 'exact' then o.price_cents<=config.impulse_limit_cents
              when 'range' then case when jsonb_typeof(o.offer_evidence->'priceMaxCents')='number'
                then (o.offer_evidence->>'priceMaxCents')::numeric<=config.impulse_limit_cents else false end
              else false end)
            and exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account
                on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id and account.status='active'
              left join garimpa.affiliate_marketplace_config store on store.affiliate_id=account.id and store.marketplace=p.marketplace and store.status='active'
              where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active'
                and (p.marketplace in ('shopee','aliexpress') and pub.affiliate_url ~ '^https://'
                  or p.marketplace='amazon' and store.tracking_id ~ '^[A-Za-z0-9_-]{1,80}$'
                  or p.marketplace='mercadolivre' and coalesce(store.tracking_id,'')<>'' and coalesce(store.tool_id,'')<>''))
          ) pool where pool.equivalent_rank=1
          order by pool.manual_position,pool.forecast_score desc,pool.product_id limit config.items_per_slot*3) ranked) forecast
      where slot.tenant_id=${tenantId} and slot.status='pending' and slot.scheduled_at between now()-interval '30 minutes' and now()+interval '30 minutes'
        and config.tenant_id=slot.tenant_id and config.channel=slot.channel and config.enabled and config.version=slot.config_version
        and exists(select 1 from garimpa.curation_policy_v2 policy where policy.tenant_id=slot.tenant_id and policy.enabled)
        and slot.predicted is distinct from forecast.items`;
    // Only stale finalists need a source check. Several slots can share one
    // open request for the same product/configuration.
    await tx`insert into garimpa.curation_promotion(tenant_id,product_id,option_key,price_type,requested_observation_id,
      requested_revision,policy_version,reason,priority,deadline,next_attempt_at)
      select distinct on(s.product_id,s.option_key,o.offer_evidence->>'priceType') slot.tenant_id,s.product_id,s.option_key,
        o.offer_evidence->>'priceType',o.id,s.source_revision,policy.version,'slot',s.score_pauta,
        slot.scheduled_at+interval '30 minutes',now()
      from garimpa.pauta_slot_occurrence slot
      join garimpa.curation_policy_v2 policy on policy.tenant_id=slot.tenant_id and policy.enabled
      join garimpa.pauta_slot_config config on config.tenant_id=slot.tenant_id and config.channel=slot.channel
        and config.enabled and config.version=slot.config_version
      cross join lateral jsonb_array_elements(slot.predicted) item
      join garimpa.curation_score_projection s on s.tenant_id=slot.tenant_id and s.product_id=item->>'productId' and s.option_key=item->>'optionKey'
        and s.policy_version=${scoreVersion}
      join garimpa.product p on p.tenant_id=s.tenant_id and p.id=s.product_id
      join garimpa.price_observation o on o.tenant_id=s.tenant_id and o.product_id=s.product_id and o.id=s.observation_id
      left join garimpa.offer_verification v on v.tenant_id=o.tenant_id and v.product_id=o.product_id
        and v.option_key=o.option_key and v.price_type=o.offer_evidence->>'priceType' and v.observation_id=o.id
      where slot.tenant_id=${tenantId} and slot.status='pending' and slot.scheduled_at between now()-interval '30 minutes' and now()+interval '30 minutes'
        and o.offer_evidence->>'priceType' in ('exact','range','from')
        and (v.verified_at is null or v.verified_at+case when p.marketplace='shopee' then interval '1 hour' else make_interval(hours=>config.dom_window_hours) end<=slot.scheduled_at
          or coalesce(garimpa.current_offer_valid_until(p.tenant_id,p.id,o.id),'-infinity'::timestamptz)<=slot.scheduled_at)
      order by s.product_id,s.option_key,o.offer_evidence->>'priceType',slot.scheduled_at asc
      on conflict(tenant_id,product_id,option_key,price_type,reason) where status in ('pending','claimed') do update
        set requested_observation_id=excluded.requested_observation_id,requested_revision=excluded.requested_revision,
          policy_version=excluded.policy_version,priority=excluded.priority,
          deadline=excluded.deadline,updated_at=now()
        where garimpa.curation_promotion.status='pending' and
          (garimpa.curation_promotion.requested_observation_id,garimpa.curation_promotion.requested_revision,
            garimpa.curation_promotion.policy_version,garimpa.curation_promotion.priority,garimpa.curation_promotion.deadline)
          is distinct from (excluded.requested_observation_id,excluded.requested_revision,excluded.policy_version,excluded.priority,excluded.deadline)`;
    await tx`update garimpa.curation_promotion p set status='cancelled',updated_at=now(),
      result=jsonb_build_object('reason','slot_no_longer_pending') where p.tenant_id=${tenantId} and p.reason='slot' and p.status='pending'
      and not exists(select 1 from garimpa.pauta_slot_occurrence slot cross join lateral jsonb_array_elements(slot.predicted) item
        where slot.tenant_id=p.tenant_id and slot.status='pending' and slot.scheduled_at>now()-interval '30 minutes'
          and item->>'productId'=p.product_id and item->>'optionKey'=p.option_key)`;
    const [next]=await tx<{due:Date|null}[]>`select min(case
      when scheduled_at>now()+interval '30 minutes' then scheduled_at-interval '30 minutes'
      when scheduled_at>now() then scheduled_at else scheduled_at+interval '30 minutes' end) as due
      from garimpa.pauta_slot_occurrence where tenant_id=${tenantId} and status='pending'`;
    return next?.due ? new Date(next.due) : null;
  });
}
