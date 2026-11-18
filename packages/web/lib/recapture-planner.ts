import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { ambiguousSourceIdentity, pageObservationMethod, sourcePageUrl } from "../../capture/src/source-page-url.ts";
import { recaptureMarketplaceEnabled } from "./flags.ts";

type Store = "mercadolivre" | "amazon" | "aliexpress";
type Target = { product_id:string; external_id:string; marketplace:Store; option_key:string; promotion_id:string|null;
  priority:number; deadline:Date|string; watched:boolean; page_url:string|null; page_rate:string|number|null; product_url:string; pdp_residual:boolean };
type Page = { marketplace:Store; url:string; targets:Map<string,Target>; expectedRate:number };
const digest = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Rebuilds a bounded page plan from facts, active watches and open promotions. */
export async function refreshRecapturePlan(sql: Sql, tenantId: string, now = new Date(),projectionOwner?:string) {
  const stores=(['mercadolivre','amazon','aliexpress'] as const).filter(store=>recaptureMarketplaceEnabled(store,tenantId));
  return withMonitoringDb(sql, tenantId, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-claim-tenant:${tenantId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-plan:${tenantId}`},0))`;
    await tx`update garimpa.recapture_task set status='pending',session_id=null,device_id=null,claim_request_id=null,
      claim_token_hash=null,lease_until=null,next_attempt_at=${now},updated_at=now()
      where tenant_id=${tenantId} and status='claimed' and lease_until<=${now} and deadline>${now}`;
    await tx`update garimpa.curation_promotion set status='pending',device_id=null,claim_token_hash=null,lease_until=null,updated_at=now()
      where tenant_id=${tenantId} and status='claimed' and lease_until<=${now} and deadline>${now}`;
    await tx`update garimpa.recapture_task set status='expired',updated_at=now()
      where tenant_id=${tenantId} and status in ('pending','claimed') and deadline<=${now}`;
    const rows = await tx<Target[]>`
      with page_rates as (
        select task.marketplace,task.page_url,
          (count(*) filter(where target.status='observed')+2)::numeric /
            (count(*) filter(where target.status='observed' or (target.status='residual'
              and target.residual_reason in ('not_found_on_listing','configuration_mismatch')))+2) as rate
        from garimpa.recapture_task task join garimpa.recapture_target target
          on target.tenant_id=task.tenant_id and target.task_id=task.id
        where task.tenant_id=${tenantId} and task.kind='listing' and task.status='completed'
          and task.updated_at>=${now}::timestamptz-interval '90 days'
        group by task.marketplace,task.page_url
      ), active_watches as (
        select product_id,coalesce(option_key,'listing') as option_key,active_watches from garimpa.monitoring_interest_options(${tenantId})
      ), targets as (
        select p.id as product_id,p.external_id,p.marketplace,r.option_key,r.id as promotion_id,p.product_url,
          (100+r.priority
            + case when r.reason='slot' then 45 when r.reason='renewal' then 25 else 0 end
            + greatest(0,40-least(40,extract(epoch from (r.deadline-${now}::timestamptz))/3600))
            + case when exists(select 1 from garimpa.recommendation_edition edition
                join garimpa.recommendation_channel channel on channel.tenant_id=edition.tenant_id
                  and channel.channel=edition.channel and channel.enabled
                cross join lateral jsonb_array_elements(edition.inputs) item
                where edition.tenant_id=r.tenant_id and edition.channel='home'
                  and edition.config_version=channel.version and (channel.valid_until is null or channel.valid_until>${now})
                  and item->>'productId'=r.product_id and (item->>'validUntil')::timestamptz>${now}) then 30 else 0 end)::numeric as priority,
          r.deadline,false as watched
        from garimpa.curation_promotion r join garimpa.product p on p.id=r.product_id and p.tenant_id=r.tenant_id
        join garimpa.curation_policy_v2 policy on policy.tenant_id=r.tenant_id and policy.enabled and policy.version=r.policy_version
        join garimpa.curation_score_projection score on score.tenant_id=r.tenant_id and score.product_id=r.product_id
          and score.option_key=r.option_key and score.observation_id=r.requested_observation_id and score.source_revision=r.requested_revision
        join garimpa.product_curation decision on decision.tenant_id=r.tenant_id and decision.product_id=r.product_id and decision.status='approved'
        where r.tenant_id=${tenantId} and r.status='pending' and r.next_attempt_at<=${now} and r.deadline>${now}
          and r.reason in ('promotion','renewal','slot')
          and r.requested_observation_id=(select latest.id from garimpa.price_observation latest
            where latest.tenant_id=r.tenant_id and latest.product_id=r.product_id and latest.option_key=r.option_key
            order by latest.observed_at desc,latest.id desc limit 1)
          and garimpa.has_current_curation_assessment(r.tenant_id,r.product_id,r.requested_observation_id)
          and not garimpa.equivalent_human_veto(r.tenant_id,r.product_id,r.requested_observation_id)
          and p.marketplace=any(${stores}::text[])
        union all
        select p.id,p.external_id,p.marketplace,w.option_key,null::uuid,p.product_url,200::numeric,${new Date(now.getTime()+24*3_600_000)},true
        from active_watches w join garimpa.product p on p.id=w.product_id and p.tenant_id=${tenantId}
        where w.active_watches>0 and p.marketplace=any(${stores}::text[])
          and garimpa.recapture_watch_option_needs_check(p.tenant_id,p.id,w.option_key)
      ) select t.*,page.page_url,rate.rate as page_rate,(exists(select 1 from garimpa.recapture_target old_target
        join garimpa.recapture_task old_task on old_task.id=old_target.task_id and old_task.tenant_id=old_target.tenant_id
        where old_target.tenant_id=${tenantId} and old_target.product_id=t.product_id and old_target.option_key=t.option_key
          and old_target.status='residual' and old_target.residual_reason in ('not_found_on_listing','configuration_mismatch')
          and old_task.kind='listing' and old_task.status='completed'
          and old_task.updated_at>coalesce((select max(o.observed_at) from garimpa.price_observation o
            where o.tenant_id=${tenantId} and o.product_id=t.product_id and o.option_key=t.option_key),'-infinity'::timestamptz))
        or coalesce((select garimpa.listing_conflicts_with_pdp(latest.tenant_id,latest.id)
          from garimpa.price_observation latest where latest.tenant_id=${tenantId} and latest.product_id=t.product_id
            and latest.option_key=t.option_key order by latest.observed_at desc,latest.id desc limit 1),false)) as pdp_residual
      from targets t left join garimpa.product_source_page page
        on page.tenant_id=${tenantId} and page.product_id=t.product_id and page.option_key=t.option_key
      left join page_rates rate on rate.marketplace=t.marketplace and rate.page_url=page.page_url
      order by t.watched desc,t.priority desc,t.product_id,page.last_seen_at desc limit 5000`;
    const pages = new Map<string,Page>(), allTargets = new Map<string,Target>(), hasListing = new Set<string>(), detailUrls=new Map<string,string>();
    for (const row of rows) {
      const id=`${row.product_id}\0${row.option_key}`, old=allTargets.get(id);
      if (!old) allTargets.set(id,row);
      else allTargets.set(id,{...old,promotion_id:old.promotion_id ?? row.promotion_id,watched:old.watched || row.watched,
        priority:Math.max(Number(old.priority),Number(row.priority)),pdp_residual:old.pdp_residual || row.pdp_residual,
        deadline:new Date(Math.min(new Date(old.deadline).getTime(),new Date(row.deadline).getTime()))});
      if (!row.page_url) continue;
      let url: URL;
      try { url = new URL(row.page_url); } catch { continue; }
      const host = row.marketplace === "mercadolivre" ? /(^|\.)mercadolivre\.com\.br$/i
        : row.marketplace === "amazon" ? /(^|\.)amazon\.com\.br$/i : /(^|\.)aliexpress\.com$/i;
      if (ambiguousSourceIdentity(url,row.marketplace) || url.protocol !== "https:" || url.username || url.password || url.port || !host.test(url.hostname)
        || /\/(?:login|checkout|ap\/signin|gp\/cart|p\/trade)(?:\/|$)/i.test(url.pathname)) continue;
      if(pageObservationMethod(row.marketplace,{kind:"product",url:url.toString()},row.external_id)==="product_page") {
        if(!detailUrls.has(id)) detailUrls.set(id,sourcePageUrl(url,row.marketplace));
        continue;
      }
      const safe = sourcePageUrl(url,row.marketplace), key = `${row.marketplace}\0${safe}`;
      hasListing.add(id);
      if (row.pdp_residual) continue;
      const page = pages.get(key) ?? { marketplace:row.marketplace,url:safe,targets:new Map<string,Target>(),
        expectedRate:row.page_rate===null ? 1 : Math.max(0,Math.min(1,Number(row.page_rate))) };
      const targetKey = `${row.product_id}\0${row.option_key}`;
      const prior = page.targets.get(targetKey);
      if (!prior) page.targets.set(targetKey,row);
      else page.targets.set(targetKey,{ ...prior, promotion_id:prior.promotion_id ?? row.promotion_id,
        watched:prior.watched || row.watched,priority:Math.max(Number(prior.priority),Number(row.priority)),
        deadline:new Date(Math.min(new Date(prior.deadline).getTime(),new Date(row.deadline).getTime())) });
      pages.set(key,page);
    }
    const covered = new Set<string>(), chosen:Page[] = [], planned = new Map<Page,Target[]>();
    const targetKey = (target:Target) => `${target.product_id}\0${target.option_key}`;
    while (chosen.length < 5) {
      const available = [...pages.values()].filter(page => !chosen.includes(page)).map(page => {
        const remaining = [...page.targets.values()].filter(target => !covered.has(targetKey(target)))
          .sort((a,b)=>Number(b.watched)-Number(a.watched) || Number(b.priority)-Number(a.priority) || targetKey(a).localeCompare(targetKey(b))).slice(0,500);
        return { page,remaining,weight:remaining.reduce((total,target) => total+Number(target.priority),0)*page.expectedRate,
          watches:remaining.filter(target => target.watched).length,
          expectedWatches:remaining.filter(target => target.watched).length*page.expectedRate };
      }).filter(item => item.remaining.length);
      if (!available.length) break;
      // Reserve the first directed page for watches when one can be served.
      if (!chosen.length && available.some(item => item.watches)) available.sort((a,b) => b.expectedWatches-a.expectedWatches || b.weight-a.weight || a.page.url.localeCompare(b.page.url));
      else available.sort((a,b) => b.weight-a.weight || b.remaining.length-a.remaining.length || a.page.url.localeCompare(b.page.url));
      const next = available[0]!; chosen.push(next.page); planned.set(next.page,next.remaining);
      for (const target of next.remaining) covered.add(targetKey(target));
    }
    let created = 0;
    for (const page of chosen) {
      const targets = [...planned.get(page)!].sort((a,b) => targetKey(a).localeCompare(targetKey(b)));
      const revision = digest(targets.map(target => [target.product_id,target.option_key,target.promotion_id,target.watched,target.external_id]));
      const deadline = new Date(Math.min(...targets.map(target => new Date(target.deadline).getTime())));
      const [task] = await tx<{id:string}[]>`insert into garimpa.recapture_task(tenant_id,marketplace,kind,page_url,plan_revision,priority,deadline)
        values(${tenantId},${page.marketplace},'listing',${page.url},${revision},${targets.reduce((sum,target)=>sum+Number(target.priority),0)},${deadline})
        on conflict(tenant_id,marketplace,kind,(md5(page_url))) where status in ('pending','claimed') do update
        set plan_revision=excluded.plan_revision,priority=excluded.priority,deadline=least(garimpa.recapture_task.deadline,excluded.deadline),updated_at=now()
        where garimpa.recapture_task.status='pending' returning id`;
      if (!task) continue;
      const records=targets.map(target => ({product_id:target.product_id,option_key:target.option_key,promotion_id:target.promotion_id,external_id:target.external_id,watched:target.watched}));
      await tx`insert into garimpa.recapture_target(tenant_id,task_id,product_id,option_key,promotion_id,expected_external_id,watched)
        select ${tenantId},${task.id}::uuid,x.product_id,x.option_key,x.promotion_id::uuid,x.external_id,x.watched
        from jsonb_to_recordset(${tx.json(records)}::jsonb) x(product_id text,option_key text,promotion_id text,external_id text,watched boolean)
        on conflict(tenant_id,task_id,product_id,option_key) do update
          set promotion_id=excluded.promotion_id,watched=excluded.watched,expected_external_id=excluded.expected_external_id,
            status='pending',residual_reason=null
          where garimpa.recapture_target.status in ('pending','superseded')`;
      await tx`update garimpa.recapture_target target set status='superseded',residual_reason=null
        where target.tenant_id=${tenantId} and target.task_id=${task.id}::uuid and target.status='pending'
          and not exists(select 1 from jsonb_to_recordset(${tx.json(records)}::jsonb) x(product_id text,option_key text)
            where x.product_id=target.product_id and x.option_key=target.option_key)`;
      created++;
    }
    // Only the residue of an unsuccessful listing or targets without a known
    // listing are eligible for individual pages. No login/block bypass.
    const detailPages=new Map<string,Page>(), routeable=new Set<string>();
    for (const [id,target] of allTargets) {
      if (covered.has(id) || hasListing.has(id) && !target.pdp_residual) {routeable.add(id);continue;}
      let url:URL; try {url=new URL(detailUrls.get(id) ?? target.product_url);} catch {continue;}
      const host=target.marketplace==='mercadolivre' ? /(^|\.)mercadolivre\.com\.br$/i
        : target.marketplace==='amazon' ? /(^|\.)amazon\.com\.br$/i : /(^|\.)aliexpress\.com$/i;
      if (ambiguousSourceIdentity(url,target.marketplace) || url.protocol!=='https:' || url.username || url.password || url.port || !host.test(url.hostname)) continue;
      const safe=sourcePageUrl(url,target.marketplace);
      if (pageObservationMethod(target.marketplace,{kind:'product',url:safe},target.external_id)!=='product_page') continue;
      routeable.add(id);
      const key=`${target.marketplace}\0${safe}`,page=detailPages.get(key) ?? {marketplace:target.marketplace,url:safe,targets:new Map<string,Target>(),expectedRate:1};
      page.targets.set(id,target);detailPages.set(key,page);
    }
    const missing=[...allTargets.entries()].filter(([id])=>!routeable.has(id)).map(([,target])=>({
      product_id:target.product_id,option_key:target.option_key,marketplace:target.marketplace,watched:target.watched,
      deadline:target.watched ? new Date(now.getTime()+24*3_600_000).toISOString() : new Date(target.deadline).toISOString()}));
    if(missing.length) await tx`insert into garimpa.recapture_unroutable(tenant_id,product_id,option_key,marketplace,watched,deadline)
      select ${tenantId},x.product_id,x.option_key,x.marketplace,x.watched,x.deadline
      from jsonb_to_recordset(${tx.json(missing)}::jsonb) x(product_id text,option_key text,marketplace text,watched boolean,deadline timestamptz)
      on conflict(tenant_id,product_id,option_key) do update set marketplace=excluded.marketplace,watched=excluded.watched,
        deadline=excluded.deadline,updated_at=now(),resolved_at=null`;
    const routes=[...routeable].map(id=>{const target=allTargets.get(id)!;return {product_id:target.product_id,option_key:target.option_key};});
    if(routes.length) await tx`update garimpa.recapture_unroutable missing set resolved_at=now(),updated_at=now()
      where missing.tenant_id=${tenantId} and missing.resolved_at is null and exists(
        select 1 from jsonb_to_recordset(${tx.json(routes)}::jsonb) x(product_id text,option_key text)
        where x.product_id=missing.product_id and x.option_key=missing.option_key)`;
    await tx`with watches as materialized (select product_id,coalesce(option_key,'listing') as option_key
        from garimpa.monitoring_interest_options(${tenantId}) where active_watches>0)
      update garimpa.recapture_unroutable missing set resolved_at=now(),updated_at=now()
      where missing.tenant_id=${tenantId} and missing.resolved_at is null and
        (missing.deadline<=${now} or (not exists(select 1 from watches where watches.product_id=missing.product_id and watches.option_key=missing.option_key)
          and not exists(select 1 from garimpa.curation_promotion p where p.tenant_id=missing.tenant_id and p.product_id=missing.product_id
            and p.option_key=missing.option_key and p.status in ('pending','claimed') and p.deadline>${now})))`;
    let details=0;
    const ordered=[...detailPages.values()].sort((a,b)=>
      Number([...b.targets.values()].some(t=>t.watched))-Number([...a.targets.values()].some(t=>t.watched)) ||
      Math.max(...[...b.targets.values()].map(t=>Number(t.priority)))-Math.max(...[...a.targets.values()].map(t=>Number(t.priority))) || a.url.localeCompare(b.url)).slice(0,30);
    for (const page of ordered) {
      const targets=[...page.targets.values()].sort((a,b)=>Number(b.watched)-Number(a.watched) || Number(b.priority)-Number(a.priority) || targetKey(a).localeCompare(targetKey(b))).slice(0,500)
        .sort((a,b)=>targetKey(a).localeCompare(targetKey(b)));
      const revision=digest(targets.map(target=>[target.product_id,target.option_key,target.promotion_id,target.watched,target.external_id]));
      const deadline=new Date(Math.min(...targets.map(target=>new Date(target.deadline).getTime())));
      const [task]=await tx<{id:string}[]>`insert into garimpa.recapture_task(tenant_id,marketplace,kind,page_url,plan_revision,priority,deadline)
        values(${tenantId},${page.marketplace},'pdp',${page.url},${revision},${Math.max(...targets.map(t=>Number(t.priority)))},${deadline})
        on conflict(tenant_id,marketplace,kind,(md5(page_url))) where status in ('pending','claimed') do update
        set plan_revision=excluded.plan_revision,priority=excluded.priority,deadline=least(garimpa.recapture_task.deadline,excluded.deadline),updated_at=now()
        where garimpa.recapture_task.status='pending' returning id`;
      if (!task) continue;
      const records=targets.map(target=>({product_id:target.product_id,option_key:target.option_key,promotion_id:target.promotion_id,external_id:target.external_id,watched:target.watched}));
      await tx`insert into garimpa.recapture_target(tenant_id,task_id,product_id,option_key,promotion_id,expected_external_id,watched)
        select ${tenantId},${task.id}::uuid,x.product_id,x.option_key,x.promotion_id::uuid,x.external_id,x.watched
        from jsonb_to_recordset(${tx.json(records)}::jsonb) x(product_id text,option_key text,promotion_id text,external_id text,watched boolean)
        on conflict(tenant_id,task_id,product_id,option_key) do update
          set promotion_id=excluded.promotion_id,watched=excluded.watched,expected_external_id=excluded.expected_external_id,
            status='pending',residual_reason=null
          where garimpa.recapture_target.status in ('pending','superseded')`;
      await tx`update garimpa.recapture_target target set status='superseded',residual_reason=null
        where target.tenant_id=${tenantId} and target.task_id=${task.id}::uuid and target.status='pending'
          and not exists(select 1 from jsonb_to_recordset(${tx.json(records)}::jsonb) x(product_id text,option_key text)
            where x.product_id=target.product_id and x.option_key=target.option_key)`;
      details++;
    }
    if(projectionOwner) {
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    }
    return { pages:created,details,covered:covered.size,uncovered:[...allTargets.keys()].filter(key=>!covered.has(key)).length };
  });
}
