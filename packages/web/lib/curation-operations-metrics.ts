import type { AccountContext } from "./account-context.ts";
import { db } from "./db.ts";
import { withAccountDb } from "./tenant-db.ts";
import { readRecommendationEdition } from "./recommendation-db.ts";

export type CurationOperationsMetrics = {
  tenantId:string;
  budget: Array<{kind:string;marketplace:string;consumed:number;watchConsumed:number}>;
  uncertainAttributes:{total:number;items:Array<{id:string;productId:string;title:string;updatedAt:string}>}|null;
  shopeeAuthPending:number;
  shopeeConfigurationMismatch:number;
  shopeeAuthAsOf:string;
  canManageShopeeAuth:boolean;
  reviews:{open:number;opened:number;resolved:number;expired:number};
  reviewTime:{reviews:number;minutes:number};
  recapture:Array<{marketplace:string;kind:string;pending:number;claimed:number;oldestOpenAt:string|null;completed:number;observed:number;residual:number;conflicts:number;no_price:number;not_found:number;unreported:number;unavailable:number}>;
  unroutable:{total:number;items:Array<{productId:string;title:string;marketplace:string;optionKey:string;watched:boolean}>};
  exposures:Array<{channel:string;count:number;expired:number}>;
  edition:{id:string;capacity:number;prepared:number;visible:number|null;oldestObservedAt:string|null}|null;
  selection:{editions:number;entries:number;exits:number;exceptions:number;reasons:Array<{reason:string;count:number}>}|null;
};

/** Operational counts from this account only; the last seven days are not a cost estimate. */
export async function readCurationOperationsMetrics(account:AccountContext,sqlFactory:typeof db=db):Promise<CurationOperationsMetrics|null> {
  try {
    const metrics = await withAccountDb(account,async tx=>{
      const budget=await tx<CurationOperationsMetrics['budget']>`select kind,marketplace,consumed,watch_consumed as "watchConsumed" from garimpa.curation_external_budget
        where tenant_id=${account.tenantId} and local_day=(now() at time zone 'America/Sao_Paulo')::date
        order by kind,marketplace`;
      const uncertain=account.membershipRole==='owner' ? await tx<Array<{id:string;product_id:string;title:string;updated_at:Date|string;total:number}>>`
        select j.id::text,j.product_id,p.title,j.updated_at,count(*) over()::int as total
        from garimpa.curation_attribute_job j join garimpa.product p on p.tenant_id=j.tenant_id and p.id=j.product_id
        where j.tenant_id=${account.tenantId} and j.status='reconciliation' order by j.updated_at,j.id limit 20` : null;
      const [reviews]=await tx<{open:number;opened:number;resolved:number;expired:number}[]>`select
        count(*) filter(where status='open')::int as open,
        count(*) filter(where opened_at>=now()-interval '7 days')::int as opened,
        count(*) filter(where status='resolved' and closed_at>=now()-interval '7 days')::int as resolved,
        count(*) filter(where status='expired' and closed_at>=now()-interval '7 days')::int as expired
        from garimpa.curation_exception where tenant_id=${account.tenantId}`;
      const [reviewTime]=await tx<{reviews:number;milliseconds:string}[]>`select count(*)::int as reviews,
        coalesce(sum(case when jsonb_typeof(snapshot->'reviewDurationMs')='number'
          then case when (snapshot->>'reviewDurationMs')::numeric between 0 and 14400000
            then (snapshot->>'reviewDurationMs')::numeric else 0 end else 0 end),0)::text as milliseconds
        from garimpa.editorial_assessment where tenant_id=${account.tenantId} and actor_app_user_id is not null
          and created_at>=now()-interval '7 days' and jsonb_typeof(snapshot->'reviewDurationMs')='number'`;
      const [shopeeAuth]=await tx<{total:number;as_of:Date|string}[]>`select count(*)::int as total,statement_timestamp() as as_of from garimpa.curation_promotion request
        join garimpa.product p on p.tenant_id=request.tenant_id and p.id=request.product_id
        where request.tenant_id=${account.tenantId} and p.marketplace='shopee' and request.status='pending'
          and request.deadline>now() and request.result->>'reason'='auth'`;
      const [shopeeMismatch]=await tx<{total:number}[]>`select count(*)::int as total from garimpa.curation_promotion request
        join garimpa.product p on p.tenant_id=request.tenant_id and p.id=request.product_id
        where request.tenant_id=${account.tenantId} and p.marketplace='shopee' and request.status='pending'
          and request.deadline>now() and request.result->>'reason'='configuration_mismatch'`;
      const recapture=await tx<CurationOperationsMetrics['recapture']>`select t.marketplace,t.kind,
        count(distinct t.id) filter(where t.status='pending')::int as pending,
        count(distinct t.id) filter(where t.status='claimed')::int as claimed,
        to_char(min(t.created_at) filter(where t.status in ('pending','claimed')) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "oldestOpenAt",
        count(distinct t.id) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days')::int as completed,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.status='observed')::int as observed,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.status='residual')::int as residual,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.residual_reason='price_conflict')::int as conflicts,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.residual_reason='no_price')::int as no_price,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.residual_reason='not_found_on_listing')::int as not_found,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.status='unreported')::int as unreported,
        count(*) filter(where t.status='completed' and t.updated_at>=now()-interval '7 days' and target.status='unavailable_confirmed')::int as unavailable
        from garimpa.recapture_task t left join garimpa.recapture_target target on target.tenant_id=t.tenant_id and target.task_id=t.id
        where t.tenant_id=${account.tenantId} and (t.status in ('pending','claimed') or t.updated_at>=now()-interval '7 days')
        group by t.marketplace,t.kind order by t.marketplace,t.kind`;
      const exposures=await tx<CurationOperationsMetrics['exposures']>`select channel,count(*)::int as count,
        count(*) filter(where preparation_expired)::int as expired from garimpa.recommendation_exposure
        where tenant_id=${account.tenantId} and confirmed_at>=now()-interval '7 days' group by channel order by channel`;
      const noRoute=await tx<Array<{product_id:string;title:string;marketplace:string;option_key:string;watched:boolean;total:number}>>`
        select missing.product_id,p.title,missing.marketplace,missing.option_key,missing.watched,count(*) over()::int as total
        from garimpa.recapture_unroutable missing join garimpa.product p on p.tenant_id=missing.tenant_id and p.id=missing.product_id
        where missing.tenant_id=${account.tenantId} and missing.resolved_at is null and missing.deadline>now()
        order by missing.watched desc,missing.deadline,missing.product_id,missing.option_key limit 30`;
      const [edition]=await tx<{id:string;capacity:number;prepared:number;oldest_observed_at:Date|string|null}[]>`
        select e.id::text,case when jsonb_typeof(policy.config->'capacity')='number' then
          case when (policy.config->>'capacity')::numeric between 1 and 24
            then (policy.config->>'capacity')::numeric::int else 24 end else 24 end as capacity,
          jsonb_array_length(e.inputs)::int as prepared,min(obs.observed_at) as oldest_observed_at
        from garimpa.recommendation_edition e join garimpa.curation_policy_v2 policy on policy.tenant_id=e.tenant_id and policy.enabled
        left join lateral jsonb_array_elements(e.inputs) input on true
        left join garimpa.price_observation obs on obs.tenant_id=e.tenant_id and obs.product_id=input->>'productId' and obs.id=input->>'observationId'
        where e.tenant_id=${account.tenantId} and e.channel='home' group by e.id,policy.config,e.inputs`;
      const [selectionReady]=await tx<{ready:boolean}[]>`select to_regclass('garimpa.curation_selection_event') is not null as ready`;
      let selection:CurationOperationsMetrics['selection']=null;
      if(selectionReady?.ready) {
        const [totals]=await tx<Array<{editions:number;entries:number;exits:number;exceptions:number}>>`select count(*)::int as editions,
          coalesce(sum(jsonb_array_length(entries)),0)::int as entries,coalesce(sum(jsonb_array_length(exits)),0)::int as exits,
          coalesce(sum(jsonb_array_length(exceptions)),0)::int as exceptions from garimpa.curation_selection_event
          where tenant_id=${account.tenantId} and created_at>=now()-interval '7 days'`;
        const reasons=await tx<Array<{reason:string;count:number}>>`select item->>'reason' as reason,count(*)::int as count
          from garimpa.curation_selection_event event cross join lateral jsonb_array_elements(event.exits) item
          where event.tenant_id=${account.tenantId} and event.created_at>=now()-interval '7 days'
          group by item->>'reason' order by count(*) desc,item->>'reason'`;
        selection={...totals,reasons};
      }
      return {tenantId:account.tenantId,budget,shopeeAuthPending:shopeeAuth?.total ?? 0,shopeeConfigurationMismatch:shopeeMismatch?.total ?? 0,
        shopeeAuthAsOf:new Date(shopeeAuth!.as_of).toISOString(),canManageShopeeAuth:account.membershipRole==='owner',
        uncertainAttributes:uncertain ? {total:uncertain[0]?.total ?? 0,
        items:uncertain.map(row=>({id:row.id,productId:row.product_id,title:row.title,updatedAt:new Date(row.updated_at).toISOString()}))} : null,
        reviews:reviews ?? {open:0,opened:0,resolved:0,expired:0},reviewTime:{reviews:reviewTime?.reviews ?? 0,
          minutes:Math.round(Number(reviewTime?.milliseconds ?? 0)/6000)/10},recapture,exposures,selection,
        unroutable:{total:noRoute[0]?.total ?? 0,items:noRoute.map(row=>({productId:row.product_id,title:row.title,
          marketplace:row.marketplace,optionKey:row.option_key,watched:row.watched}))},
        edition:edition ? {id:edition.id,capacity:edition.capacity,prepared:edition.prepared,visible:null as number|null,
          oldestObservedAt:edition.oldest_observed_at ? new Date(edition.oldest_observed_at).toISOString() : null} : null};
    },sqlFactory);
    if(metrics.edition) {
      // Use the public reader's complete gates, but don't combine the count
      // with a different edition if publication changes between transactions.
      const visible=await readRecommendationEdition('home',account.tenantId,sqlFactory).catch(()=>null);
      if(visible?.homepageEditionId===metrics.edition.id && Array.isArray(visible.products))
        metrics.edition.visible=visible.products.length;
    }
    return metrics;
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden_account_scope") throw error;
    return null;
  }
}
