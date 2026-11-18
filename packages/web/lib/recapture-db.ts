import { createHash } from "node:crypto";
import { db } from "./db.ts";
import { withDeviceCapture, persistCaptureItem, manualExtensionItemRequestId, type DeviceIdentity } from "./extension-db.ts";
import { recaptureMarketplaceEnabled } from "./flags.ts";
import type { RecaptureObservation } from "./recapture-contract.ts";
import { pageObservationMethod } from "../../capture/src/source-page-url.ts";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const sha = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type RecaptureClaim = { requestId:string; sessionId:string; taskId:string; revision:string; claimToken:string; supportsClaimTargets?:boolean };

export async function setRecaptureSessionStatus(device:DeviceIdentity, sessionId:string, action:"pause"|"resume"|"cancel", factory:typeof db=db, controlSequence?:number) {
  if (!uuid.test(sessionId)) throw new Error("recapture_session_invalid");
  if (controlSequence!==undefined && (!Number.isInteger(controlSequence) || controlSequence<1 || controlSequence>2147483647)) throw new Error("recapture_session_invalid");
  return withDeviceCapture(device,sessionId,async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-claim-tenant:${device.tenantId}`},0))`;
    const status=action==='pause' ? 'paused' : action==='resume' ? 'active' : 'cancelled';
    const [prior]=await tx<{status:string;control_sequence:number;control_action:string|null}[]>`select status,control_sequence,control_action
      from garimpa.recapture_session where tenant_id=${device.tenantId} and device_id=${device.deviceId} and id=${sessionId}::uuid for update`;
    if (prior && controlSequence===undefined && prior.control_sequence>0) throw new Error("recapture_control_stale");
    if (prior && controlSequence!==undefined && controlSequence<=prior.control_sequence) {
      if (controlSequence===prior.control_sequence && action===prior.control_action) return;
      throw new Error("recapture_control_stale");
    }
    if (prior && ['cancelled','completed'].includes(prior.status)) {
      if (action==='cancel' && prior.status==='cancelled') return;
      throw new Error("recapture_session_unavailable");
    }
    const rows=await tx<{id:string}[]>`update garimpa.recapture_session set status=${status},updated_at=now()
      where tenant_id=${device.tenantId} and device_id=${device.deviceId} and id=${sessionId}::uuid
        and status in ('active','paused') returning id`;
    if (action==='cancel' && rows.length) {
      await tx`update garimpa.recapture_target_lease set lease_until=clock_timestamp()
        where tenant_id=${device.tenantId} and device_id=${device.deviceId} and session_id=${sessionId}::uuid
          and exists(select 1 from garimpa.recapture_task t where t.tenant_id=recapture_target_lease.tenant_id
            and t.id=recapture_target_lease.task_id and t.status='claimed')`;
      await tx`update garimpa.curation_promotion p set status='pending',device_id=null,claim_token_hash=null,lease_until=null,updated_at=now()
        from garimpa.recapture_task t where t.tenant_id=${device.tenantId} and t.device_id=${device.deviceId}
          and t.session_id=${sessionId}::uuid and t.status='claimed' and p.tenant_id=t.tenant_id
          and p.device_id=t.device_id and p.status='claimed' and p.claim_token_hash=t.claim_token_hash`;
      await tx`update garimpa.recapture_task set status='cancelled',updated_at=now()
        where tenant_id=${device.tenantId} and device_id=${device.deviceId} and session_id=${sessionId}::uuid and status='claimed'`;
    }
    // Persist the stop even if the first claim has not arrived yet. A claim
    // whose response was lost may still be in flight; the same tenant lock
    // ensures it cannot create an active session after this stop commits.
    if (!rows.length && (action!=='resume' || controlSequence!==undefined)) {
      await tx`insert into garimpa.recapture_session(id,tenant_id,device_id,status,control_sequence,control_action)
        values(${sessionId}::uuid,${device.tenantId},${device.deviceId},${status},${controlSequence ?? 0},${controlSequence===undefined ? null : action}) on conflict(id) do nothing`;
    }
    if (controlSequence!==undefined && rows.length) await tx`update garimpa.recapture_session
      set control_sequence=${controlSequence},control_action=${action} where tenant_id=${device.tenantId} and device_id=${device.deviceId} and id=${sessionId}::uuid`;
    if (!rows.length && action==='resume' && controlSequence===undefined) {
      const [existing]=await tx<{status:string}[]>`select status from garimpa.recapture_session
        where tenant_id=${device.tenantId} and device_id=${device.deviceId} and id=${sessionId}::uuid`;
      if (existing) throw new Error("recapture_session_unavailable");
    }
  },factory);
}

/** Pure read: does not reserve a task, navigate or allocate quota. */
export async function readRecapturePlan(device:DeviceIdentity, requestId:string, factory:typeof db=db) {
  return withDeviceCapture(device,requestId,async tx => {
    const rows = await tx<Array<{id:string;marketplace:string;kind:string;page_url:string;plan_revision:string;priority:string;
      deadline:Date|string;product_id:string;option_key:string;expected_external_id:string}>>`
      with matched as materialized (
        select t.id,t.marketplace,t.kind,t.page_url,t.plan_revision,t.priority,t.deadline,
          target.product_id,target.option_key,target.expected_external_id,target.watched
        from garimpa.recapture_task t join garimpa.recapture_target target on target.tenant_id=t.tenant_id and target.task_id=t.id
        where t.tenant_id=${device.tenantId} and t.status='pending' and t.next_attempt_at<=now() and t.deadline>now()
          and not exists(select 1 from garimpa.recapture_target busy
            join garimpa.recapture_target_lease lease on lease.tenant_id=busy.tenant_id and lease.product_id=busy.product_id
              and lease.option_key=busy.option_key and lease.task_id<>busy.task_id and lease.lease_until>now()
            where busy.tenant_id=t.tenant_id and busy.task_id=t.id and busy.status='pending'
              and (exists(select 1 from garimpa.curation_promotion p where p.tenant_id=busy.tenant_id and p.product_id=busy.product_id
                and p.option_key=busy.option_key and garimpa.recapture_promotion_current(p.tenant_id,p.id))
                or (busy.watched and garimpa.recapture_watch_option_needs_check(busy.tenant_id,busy.product_id,busy.option_key))))
          and target.status='pending' and (exists(select 1 from garimpa.curation_promotion p
            where p.tenant_id=target.tenant_id and p.product_id=target.product_id and p.option_key=target.option_key
              and garimpa.recapture_promotion_current(p.tenant_id,p.id))
            or (target.watched and garimpa.recapture_watch_option_needs_check(t.tenant_id,target.product_id,target.option_key)))
      ), sizes as (
        select id,marketplace,kind,max(priority) as priority,bool_or(watched) as has_watch,count(*)::integer as size
        from matched group by id,marketplace,kind
      ), ordered as (
        select sizes.*,case when (coalesce((select consumed from garimpa.curation_external_budget budget
          where budget.tenant_id=${device.tenantId} and budget.local_day=(now() at time zone 'America/Sao_Paulo')::date
            and budget.marketplace='all' and budget.kind=sizes.kind),0)%4=0)=sizes.has_watch then 0 else 1 end as preference
        from sizes
      ), bounded as (
        select id,row_number() over(partition by marketplace order by preference,priority desc,id) as task_position,
          sum(size) over(partition by marketplace order by preference,priority desc,id rows unbounded preceding) as total_targets from ordered
      ) select matched.* from matched join bounded using(id)
        where bounded.task_position<=20 and bounded.total_targets<=500
        order by matched.marketplace,bounded.task_position,matched.product_id,matched.option_key`;
    const tasks = new Map<string,{id:string;marketplace:string;kind:string;url:string;revision:string;priority:number;deadline:string;
      targets:Array<{productId:string;optionKey:string;externalId:string}>}>();
    for (const row of rows) {
      if (!['mercadolivre','amazon','aliexpress'].includes(row.marketplace)
        || !recaptureMarketplaceEnabled(row.marketplace as 'mercadolivre'|'amazon'|'aliexpress',device.tenantId)) continue;
      const task=tasks.get(row.id) ?? { id:row.id,marketplace:row.marketplace,kind:row.kind,url:row.page_url,revision:row.plan_revision,
        priority:Number(row.priority),deadline:new Date(row.deadline).toISOString(),targets:[] };
      task.targets.push({productId:row.product_id,optionKey:row.option_key,externalId:row.expected_external_id});tasks.set(row.id,task);
    }
    const busy=await tx<{marketplace:string}[]>`select distinct t.marketplace from garimpa.recapture_task t
      where t.tenant_id=${device.tenantId} and t.status='pending' and t.next_attempt_at<=now() and t.deadline>now()
        and exists(select 1 from garimpa.recapture_target needed where needed.tenant_id=t.tenant_id and needed.task_id=t.id
          and needed.status='pending' and (exists(select 1 from garimpa.curation_promotion p
            where p.tenant_id=needed.tenant_id and p.product_id=needed.product_id and p.option_key=needed.option_key
              and garimpa.recapture_promotion_current(p.tenant_id,p.id))
            or (needed.watched and garimpa.recapture_watch_option_needs_check(t.tenant_id,needed.product_id,needed.option_key))))
        and exists(select 1 from garimpa.recapture_target target join garimpa.recapture_target_lease lease
          on lease.tenant_id=target.tenant_id and lease.product_id=target.product_id and lease.option_key=target.option_key
            and lease.task_id<>target.task_id and lease.lease_until>now()
          where target.tenant_id=t.tenant_id and target.task_id=t.id and target.status='pending'
            and (exists(select 1 from garimpa.curation_promotion p where p.tenant_id=target.tenant_id and p.product_id=target.product_id
              and p.option_key=target.option_key and garimpa.recapture_promotion_current(p.tenant_id,p.id))
              or (target.watched and garimpa.recapture_watch_option_needs_check(target.tenant_id,target.product_id,target.option_key))))`;
    const quotas=await tx<{kind:'listing'|'pdp';consumed:number}[]>`select kind,consumed from garimpa.curation_external_budget
      where tenant_id=${device.tenantId} and local_day=(now() at time zone 'America/Sao_Paulo')::date and marketplace='all' and kind in ('listing','pdp')`;
    const [projection]=await tx<{pending:boolean}[]>`select exists(select 1 from garimpa.curation_projection_job job
      where job.tenant_id=${device.tenantId} and (job.next_due_at<=now() or job.lease_until>now())) as pending`;
    const remaining=(kind:'listing'|'pdp') => {
      const limit=Number(kind==='listing' ? process.env.RECAPTURE_LISTING_DAILY_LIMIT : process.env.RECAPTURE_PDP_DAILY_LIMIT ?? '30');
      return Number.isInteger(limit) && limit>0 && limit<=(kind==='listing' ? 500 : 40)
        ? Math.max(0,limit-(quotas.find(item=>item.kind===kind)?.consumed ?? 0)) : null;
    };
    return { capabilities:["listing-v2","pdp-v2","claim-v2","claim-targets-v1","observation-v2"],remaining:{listing:remaining('listing'),pdp:remaining('pdp')},
      planUpdating:process.env.RECAPTURE_PLANNER_ENABLED==='true' && Boolean(projection?.pending),
      busyMarketplaces:busy.map(item=>item.marketplace).filter(store=>['mercadolivre','amazon','aliexpress'].includes(store)
        && recaptureMarketplaceEnabled(store as 'mercadolivre'|'amazon'|'aliexpress',device.tenantId)),tasks:[...tasks.values()] };
  },factory,true);
}

/** Reserves one navigation atomically. The same claim never consumes quota twice. */
export async function claimRecaptureTask(device:DeviceIdentity, input:RecaptureClaim, factory:typeof db=db) {
  if (![input.requestId,input.sessionId,input.taskId].every(value => uuid.test(value))
    || !/^[a-f0-9]{64}$/i.test(input.claimToken) || !/^[a-f0-9]{64}$/i.test(input.revision)) throw new Error("recapture_claim_invalid");
  const listingLimit=Number(process.env.RECAPTURE_LISTING_DAILY_LIMIT), pdpLimit=Number(process.env.RECAPTURE_PDP_DAILY_LIMIT ?? "30");
  const claimIdentity=[input.taskId,input.sessionId,input.revision,input.claimToken.toLowerCase()];
  const fingerprint=sha(input.supportsClaimTargets ? [...claimIdentity,true] : claimIdentity);
  const tokenHash=sha(input.claimToken.toLowerCase());
  return withDeviceCapture(device,input.requestId,async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-claim:${device.tenantId}:${device.deviceId}:${input.requestId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-claim-tenant:${device.tenantId}`},0))`;
    const [previous] = await tx<{fingerprint:string;task_id:string;lease_until:Date|string;skipped:boolean}[]>`
      select fingerprint,task_id,lease_until,skipped from garimpa.recapture_claim_receipt
      where tenant_id=${device.tenantId} and device_id=${device.deviceId} and request_id=${input.requestId}::uuid`;
    if (previous) {
      if (previous.fingerprint!==fingerprint || previous.task_id!==input.taskId) throw new Error("recapture_claim_conflict");
      if (previous.skipped) return {duplicate:true,taskId:input.taskId,skipped:true};
      if (new Date(previous.lease_until).getTime()<=Date.now()) throw new Error("recapture_claim_expired");
      const [active]=await tx<{id:string}[]>`select id from garimpa.recapture_task where id=${input.taskId}::uuid and tenant_id=${device.tenantId}
        and status='claimed' and device_id=${device.deviceId} and session_id=${input.sessionId}::uuid and claim_token_hash=${tokenHash} and lease_until>now()`;
      if (!active) throw new Error("recapture_claim_expired");
      const targets=await tx<{productId:string;optionKey:string;externalId:string}[]>`select product_id as "productId",option_key as "optionKey",
        expected_external_id as "externalId" from garimpa.recapture_target where tenant_id=${device.tenantId}
          and task_id=${input.taskId}::uuid and status='pending' order by product_id,option_key`;
      return { duplicate:true,taskId:input.taskId,leaseUntil:new Date(previous.lease_until).toISOString(),targets };
    }
    await tx`insert into garimpa.recapture_session(id,tenant_id,device_id,status) values(${input.sessionId}::uuid,${device.tenantId},${device.deviceId},'active') on conflict(id) do nothing`;
    const [session]=await tx<{status:string;listing_used:number;listing_limit:number;pdp_used:number;pdp_limit:number}[]>`
      select status,listing_used,listing_limit,pdp_used,pdp_limit from garimpa.recapture_session
      where id=${input.sessionId}::uuid and tenant_id=${device.tenantId} and device_id=${device.deviceId} for update`;
    if (!session || session.status!=="active") throw new Error("recapture_session_unavailable");
    const [task]=await tx<{marketplace:string;kind:'listing'|'pdp';plan_revision:string;deadline:Date|string}[]>`
      select marketplace,kind,plan_revision,deadline from garimpa.recapture_task where id=${input.taskId}::uuid and tenant_id=${device.tenantId}
        and status='pending' and next_attempt_at<=clock_timestamp() and deadline>clock_timestamp() for update`;
    if (!task || task.plan_revision!==input.revision) throw new Error("recapture_plan_changed");
    if (!['mercadolivre','amazon','aliexpress'].includes(task.marketplace)
      || !recaptureMarketplaceEnabled(task.marketplace as 'mercadolivre'|'amazon'|'aliexpress',device.tenantId)) throw new Error("marketplace_capture_unavailable");
    const cap=task.kind==='listing' ? listingLimit : pdpLimit;
    if (!Number.isInteger(cap) || cap<1 || cap>(task.kind==='listing' ? 500 : 40)) throw new Error("recapture_budget_not_configured");
    if (task.kind==='listing' ? session.listing_used>=session.listing_limit : session.pdp_used>=session.pdp_limit) throw new Error("recapture_session_budget_exhausted");
    await tx`select p.id from garimpa.curation_promotion p join garimpa.recapture_target target
      on target.tenant_id=p.tenant_id and target.product_id=p.product_id and target.option_key=p.option_key
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending' for update of p`;
    // The device must own the pending task before RLS allows it to update
    // targets. Any subsequent failure rolls this assignment back.
    await tx`update garimpa.recapture_task set device_id=${device.deviceId},session_id=${input.sessionId}::uuid
      where tenant_id=${device.tenantId} and id=${input.taskId}::uuid and status='pending'`;
    if(input.supportsClaimTargets) await tx`update garimpa.recapture_target target set status='superseded',residual_reason=null
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending'
        and not exists(select 1 from garimpa.curation_promotion p where p.tenant_id=target.tenant_id and p.product_id=target.product_id
          and p.option_key=target.option_key and garimpa.recapture_promotion_current(p.tenant_id,p.id))
        and not (target.watched and garimpa.recapture_watch_option_needs_check(target.tenant_id,target.product_id,target.option_key))`;
    const [busy]=await tx<{busy:boolean}[]>`select exists(select 1 from garimpa.recapture_target target
      join garimpa.recapture_target_lease active on active.tenant_id=target.tenant_id and active.product_id=target.product_id
        and active.option_key=target.option_key and active.task_id<>target.task_id and active.lease_until>clock_timestamp()
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending') as busy`;
    if(busy?.busy) throw new Error("recapture_target_busy");
    const [needed] = await tx<{needed:boolean}[]>`select exists(select 1 from garimpa.recapture_target target
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending'
        and (exists(select 1 from garimpa.curation_promotion p where p.tenant_id=target.tenant_id and p.product_id=target.product_id
          and p.option_key=target.option_key and garimpa.recapture_promotion_current(p.tenant_id,p.id))
          or (target.watched and garimpa.recapture_watch_option_needs_check(target.tenant_id,target.product_id,target.option_key)))) as needed`;
    if (!needed?.needed) {
      await tx`update garimpa.recapture_task set status='cancelled',device_id=${device.deviceId},session_id=${input.sessionId}::uuid,updated_at=now()
        where tenant_id=${device.tenantId} and id=${input.taskId}::uuid and status='pending'`;
      await tx`insert into garimpa.recapture_claim_receipt(tenant_id,device_id,request_id,session_id,task_id,fingerprint,lease_until,skipped)
        values(${device.tenantId},${device.deviceId},${input.requestId}::uuid,${input.sessionId}::uuid,${input.taskId}::uuid,${fingerprint},now(),true)`;
      return {duplicate:false,taskId:input.taskId,skipped:true};
    }
    await tx`insert into garimpa.curation_external_budget(tenant_id,local_day,kind,marketplace)
      select ${device.tenantId},(now() at time zone 'America/Sao_Paulo')::date,${task.kind},m from unnest(${['all',task.marketplace]}::text[]) m
      on conflict do nothing`;
    const quotas=await tx<{marketplace:string;consumed:number;watch_consumed:number}[]>`select marketplace,consumed,watch_consumed from garimpa.curation_external_budget where tenant_id=${device.tenantId}
      and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind=${task.kind} and marketplace=any(${['all',task.marketplace]}::text[])
      order by marketplace for update`;
    if (quotas.length!==2 || quotas.some(quota=>quota.consumed>=cap)) throw new Error("recapture_daily_budget_exhausted");
    const enabledStores=(['mercadolivre','amazon','aliexpress'] as const).filter(store=>recaptureMarketplaceEnabled(store,device.tenantId));
    const [watchWork]=await tx<{on_task:boolean;waiting:boolean}[]>`with due as materialized (
      select distinct t.id from garimpa.recapture_task t join garimpa.recapture_target target
        on target.tenant_id=t.tenant_id and target.task_id=t.id
      where t.tenant_id=${device.tenantId} and t.kind=${task.kind} and t.marketplace=any(${enabledStores}::text[])
        and t.status='pending' and t.next_attempt_at<=now() and t.deadline>now() and target.status='pending' and target.watched
        and garimpa.recapture_watch_option_needs_check(t.tenant_id,target.product_id,target.option_key)
        and not exists(select 1 from garimpa.recapture_target busy join garimpa.recapture_target_lease lease
          on lease.tenant_id=busy.tenant_id and lease.product_id=busy.product_id and lease.option_key=busy.option_key
            and lease.task_id<>busy.task_id and lease.lease_until>now()
          where busy.tenant_id=t.tenant_id and busy.task_id=t.id and busy.status='pending'
            and (exists(select 1 from garimpa.curation_promotion p where p.tenant_id=busy.tenant_id and p.product_id=busy.product_id
              and p.option_key=busy.option_key and garimpa.recapture_promotion_current(p.tenant_id,p.id))
              or (busy.watched and garimpa.recapture_watch_option_needs_check(busy.tenant_id,busy.product_id,busy.option_key))))
    ) select exists(select 1 from due where id=${input.taskId}::uuid) as on_task,exists(select 1 from due) as waiting`;
    const accountBudget=quotas.find(quota=>quota.marketplace==='all')!;
    const reserved=Math.ceil(cap/4),unfilled=Math.max(0,reserved-accountBudget.watch_consumed);
    if(!watchWork?.on_task && watchWork?.waiting && cap-accountBudget.consumed<=unfilled)
      throw new Error('recapture_watch_capacity_reserved');
    const leaseUntil=new Date(Math.min(Date.now()+5*60_000,new Date(task.deadline).getTime()));
    if (leaseUntil.getTime()<=Date.now()) throw new Error("recapture_plan_changed");
    await tx`update garimpa.curation_external_budget set consumed=consumed+1,watch_consumed=watch_consumed+${watchWork?.on_task ? 1 : 0} where tenant_id=${device.tenantId}
      and local_day=(now() at time zone 'America/Sao_Paulo')::date and kind=${task.kind} and marketplace=any(${['all',task.marketplace]}::text[])`;
    await tx`update garimpa.recapture_session set listing_used=listing_used+${task.kind==='listing' ? 1 : 0},
      pdp_used=pdp_used+${task.kind==='pdp' ? 1 : 0},updated_at=now() where id=${input.sessionId}::uuid and tenant_id=${device.tenantId} and device_id=${device.deviceId}`;
    await tx`update garimpa.recapture_task set status='claimed',session_id=${input.sessionId}::uuid,device_id=${device.deviceId},
      claim_request_id=${input.requestId}::uuid,claim_token_hash=${tokenHash},lease_until=${leaseUntil},attempts=attempts+1,updated_at=now()
      where id=${input.taskId}::uuid and tenant_id=${device.tenantId}`;
    const [targetCount]=await tx<{count:number}[]>`select count(*)::integer as count from garimpa.recapture_target
      where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and status='pending'`;
    const leased=await tx<{product_id:string}[]>`insert into garimpa.recapture_target_lease as lease
      (tenant_id,product_id,option_key,task_id,session_id,device_id,lease_until)
      select tenant_id,product_id,option_key,task_id,${input.sessionId}::uuid,${device.deviceId},${leaseUntil}
      from garimpa.recapture_target where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and status='pending'
      order by product_id,option_key
      on conflict (tenant_id,product_id,option_key) do update set task_id=excluded.task_id,session_id=excluded.session_id,
        device_id=excluded.device_id,lease_until=excluded.lease_until
      where lease.lease_until<=clock_timestamp() or (lease.task_id=excluded.task_id and lease.device_id=excluded.device_id)
      returning product_id`;
    if (!targetCount || leased.length!==targetCount.count) throw new Error("recapture_target_busy");
    await tx`update garimpa.curation_promotion p set status='claimed',device_id=${device.deviceId},claim_token_hash=${tokenHash},
      lease_until=${leaseUntil},attempts=p.attempts+1,updated_at=now() from garimpa.recapture_target target
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending'
        and target.tenant_id=p.tenant_id and target.product_id=p.product_id and target.option_key=p.option_key and p.status='pending'
        and garimpa.recapture_promotion_current(p.tenant_id,p.id)`;
    await tx`insert into garimpa.recapture_claim_receipt(tenant_id,device_id,request_id,session_id,task_id,fingerprint,lease_until)
      values(${device.tenantId},${device.deviceId},${input.requestId}::uuid,${input.sessionId}::uuid,${input.taskId}::uuid,${fingerprint},${leaseUntil})`;
    const targets=await tx<{productId:string;optionKey:string;externalId:string}[]>`select product_id as "productId",option_key as "optionKey",
      expected_external_id as "externalId" from garimpa.recapture_target where tenant_id=${device.tenantId}
        and task_id=${input.taskId}::uuid and status='pending' order by product_id,option_key`;
    return {duplicate:false,taskId:input.taskId,leaseUntil:leaseUntil.toISOString(),targets};
  },factory);
}

/** Commits a report and facts atomically; missing targets remain residual. */
export async function reportRecaptureObservation(device:DeviceIdentity, input:RecaptureObservation, factory:typeof db=db) {
  const fingerprint=sha(input),tokenHash=sha(input.claimToken.toLowerCase());
  return withDeviceCapture(device,input.requestId,async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-report:${device.tenantId}:${device.deviceId}:${input.requestId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recapture-claim-tenant:${device.tenantId}`},0))`;
    const [receipt]=await tx<{fingerprint:string;result:Record<string,unknown>}[]>`select fingerprint,result from garimpa.recapture_report_receipt
      where tenant_id=${device.tenantId} and device_id=${device.deviceId} and request_id=${input.requestId}::uuid`;
    if (receipt) {
      if (receipt.fingerprint!==fingerprint) throw new Error("recapture_report_conflict");
      return { ...receipt.result,duplicate:true };
    }
    const [task]=await tx<{id:string;marketplace:string;kind:string;page_url:string}[]>`select t.id,t.marketplace,t.kind,t.page_url
      from garimpa.recapture_task t join garimpa.recapture_session session on session.id=t.session_id and session.tenant_id=t.tenant_id and session.device_id=t.device_id
      where t.tenant_id=${device.tenantId} and t.id=${input.taskId}::uuid and t.device_id=${device.deviceId} and t.session_id=${input.sessionId}::uuid
        and t.status='claimed' and t.claim_token_hash=${tokenHash} and t.lease_until>clock_timestamp() and t.deadline>clock_timestamp()
        and session.status in ('active','paused') for update of t`;
    if (!task || task.marketplace!==input.marketplace || task.page_url!==input.page.url
      || (task.kind==='pdp' ? input.page.kind!=='product' : input.page.kind!=='listing')) throw new Error("recapture_claim_expired");
    const [time]=await tx<{observed_at:Date}[]>`select least(clock_timestamp(),${input.observedAt}::timestamptz) as observed_at`;
    const observedAt=time!.observed_at;
    const targets=await tx<Array<{product_id:string;external_id:string;option_key:string;promotion_id:string|null}>>`
      select target.product_id,target.expected_external_id as external_id,target.option_key,target.promotion_id
      from garimpa.recapture_target target where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid and target.status='pending'
      order by target.product_id,target.option_key for update`;
    const targetByKey=new Map(targets.map(target=>[`${target.product_id}\0${target.option_key}`,target]));
    for (const result of input.results) {
      const target=targetByKey.get(`${result.productId}\0${result.optionKey}`);
      if (!target || target.external_id!==result.externalId) throw new Error("recapture_target_mismatch");
      if (result.status==='observed' && !input.products.some(product=>product.externalId===result.externalId)) throw new Error("recapture_observation_invalid");
    }
    const observations=new Map<string,{productId:string;observationId:string;optionKey:string;priceType:string|null;currency:string|null;verified:boolean;conflict:boolean}>();
    let discovered=0;
    for (const product of [...input.products].sort((a,b)=>a.externalId.localeCompare(b.externalId))) {
      const result=await persistCaptureItem(tx,device,{version:1,marketplace:input.marketplace,clientCapturedAt:input.observedAt,
        requestId:manualExtensionItemRequestId(device.deviceId,input.requestId,input.marketplace,product.externalId),
        page:input.page,product},"manual");
      if (result.created) discovered++;
      const [observation]=await tx<{option_key:string;price_type:string|null;currency:string|null;verified:boolean;conflict:boolean}[]>`
        select o.option_key,o.offer_evidence->>'priceType' as price_type,o.offer_evidence->>'currency' as currency,
          exists(select 1 from garimpa.offer_verification v where v.tenant_id=o.tenant_id and v.product_id=o.product_id
            and v.option_key=o.option_key and v.price_type=o.offer_evidence->>'priceType' and v.observation_id=o.id
            and v.availability<>'unavailable') as verified,
          garimpa.listing_conflicts_with_pdp(o.tenant_id,o.id) as conflict
        from garimpa.price_observation o where o.tenant_id=${device.tenantId} and o.id=${result.observationId} and o.product_id=${result.productId}`;
      if (!observation) throw new Error("recapture_observation_missing");
      observations.set(product.externalId,{productId:result.productId,observationId:result.observationId,optionKey:observation.option_key,
        priceType:observation.price_type,currency:observation.currency,verified:observation.verified,conflict:observation.conflict});
    }
    let observed=0,residual=0,confirmed=0,unavailable=0,unreported=0;
    const outcomes:Array<{productId:string;optionKey:string;status:'observed'|'unavailable_confirmed'|'residual'|'unreported';reason?:string;confirmedPromotions?:number}>=[];
    for (const target of targets) {
      const reported=input.results.find(result=>result.productId===target.product_id && result.optionKey===target.option_key);
      const observation=observations.get(target.external_id);
      if(!reported) {
        await tx`update garimpa.recapture_target set status='unreported',residual_reason=null
          where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and product_id=${target.product_id} and option_key=${target.option_key}`;
        unreported++;
        outcomes.push({productId:target.product_id,optionKey:target.option_key,status:'unreported'});
        continue;
      }
      const isUnavailable=reported?.status==='unavailable_confirmed' && reported.evidence==='explicit_product_unavailable'
        && task.kind==='pdp' && target.option_key==='listing'
        && pageObservationMethod(input.marketplace,input.page,target.external_id)==='product_page';
      const matches=reported?.status==='observed' && observation?.productId===target.product_id
        && observation.optionKey===target.option_key && observation.currency==='BRL' && ['exact','range','from'].includes(observation.priceType ?? '');
      if (matches && observation?.verified) {
        await tx`update garimpa.recapture_target set status='observed',observed_at=${observedAt}
          where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and product_id=${target.product_id} and option_key=${target.option_key}`;
        observed++;
        {
          const updated=await tx<{id:string}[]>`update garimpa.curation_promotion p set status='confirmed',result_observation_id=${observation.observationId},
            result=${tx.json({status:'observed',taskId:input.taskId})},updated_at=now()
            where p.tenant_id=${device.tenantId} and p.product_id=${target.product_id} and p.option_key=${target.option_key} and p.status='claimed'
              and p.device_id=${device.deviceId} and p.claim_token_hash=${tokenHash} and p.price_type=${observation.priceType}
              and not exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.product_id and c.status='rejected') returning id`;
          confirmed+=updated.length;
          outcomes.push({productId:target.product_id,optionKey:target.option_key,status:'observed',confirmedPromotions:updated.length});
        }
      } else if (isUnavailable) {
        await tx`insert into garimpa.offer_availability_observation(tenant_id,product_id,option_key,task_id,request_id,source_page_url,observed_at,status,evidence)
          values(${device.tenantId},${target.product_id},${target.option_key},${input.taskId}::uuid,${input.requestId}::uuid,${input.page.url},${observedAt},
            'unavailable_confirmed','explicit_product_unavailable') on conflict do nothing`;
        await tx`update garimpa.offer_verification set availability='unavailable'
          where tenant_id=${device.tenantId} and product_id=${target.product_id} and verified_at<=${observedAt}`;
        await tx`update garimpa.recapture_target set status='unavailable_confirmed',observed_at=${observedAt}
          where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and product_id=${target.product_id} and option_key=${target.option_key}`;
        await tx`update garimpa.curation_promotion set status='cancelled',result=${tx.json({status:'unavailable_confirmed',taskId:input.taskId})},updated_at=now()
          where tenant_id=${device.tenantId} and product_id=${target.product_id} and option_key=${target.option_key}
            and status='claimed' and device_id=${device.deviceId} and claim_token_hash=${tokenHash}`;
        unavailable++;
        outcomes.push({productId:target.product_id,optionKey:target.option_key,status:'unavailable_confirmed'});
      } else {
        // An absent target, login screen, parser error or unsupported stock
        // assertion never changes the last known price or availability.
        const reason=reported?.status==='no_price' && (task.kind!=='pdp'
          || pageObservationMethod(input.marketplace,input.page,target.external_id)!=='product_page') ? 'configuration_mismatch'
          : matches && observation?.conflict ? 'price_conflict'
          : matches ? 'superseded_observation'
          : reported?.status==='observed' || reported?.status==='unavailable_confirmed'
            ? 'configuration_mismatch' : reported?.status ?? 'not_found_on_listing';
        await tx`update garimpa.recapture_target set status='residual',residual_reason=${reason},
          observed_at=case when ${reason}='no_price' and option_key='listing' then ${observedAt} else observed_at end where tenant_id=${device.tenantId}
          and task_id=${input.taskId}::uuid and product_id=${target.product_id} and option_key=${target.option_key}`;
        residual++;
        outcomes.push({productId:target.product_id,optionKey:target.option_key,status:'residual',reason});
      }
    }
    await tx`update garimpa.curation_promotion p set status='pending',device_id=null,claim_token_hash=null,lease_until=null,
      next_attempt_at=case when target.residual_reason='price_conflict' then now() else now()+interval '1 hour' end,
      updated_at=now() from garimpa.recapture_target target
      where target.tenant_id=${device.tenantId} and target.task_id=${input.taskId}::uuid
        and p.tenant_id=target.tenant_id and p.product_id=target.product_id and p.option_key=target.option_key
        and p.status='claimed' and p.device_id=${device.deviceId} and p.claim_token_hash=${tokenHash}`;
    await tx`update garimpa.recapture_target_lease set lease_until=clock_timestamp()
      where tenant_id=${device.tenantId} and task_id=${input.taskId}::uuid and device_id=${device.deviceId} and session_id=${input.sessionId}::uuid`;
    await tx`update garimpa.recapture_task set status='completed',updated_at=now() where tenant_id=${device.tenantId} and id=${input.taskId}::uuid`;
    const result={ok:true,observed,residual,confirmed,unavailable,unreported,discovered,processedProducts:input.products.length,
      results:outcomes,replan:true};
    await tx`insert into garimpa.recapture_report_receipt(tenant_id,device_id,request_id,task_id,fingerprint,result)
      values(${device.tenantId},${device.deviceId},${input.requestId}::uuid,${input.taskId}::uuid,${fingerprint},${tx.json(result)})`;
    return { ...result,duplicate:false };
  },factory);
}
