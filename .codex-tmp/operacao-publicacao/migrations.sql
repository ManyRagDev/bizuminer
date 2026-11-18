begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- 20261115234320_capture_activity_history.sql sha256 64d549ccdcd42242680966a0df88e88444071e9fb8fbe8e93cb0554d581f3e02
set local lock_timeout='5s';

-- History belongs to the active account, including receipts from retired devices.
-- This SELECT-only policy does not broaden the device's INSERT policy.
create policy extension_capture_receipt_history_read on garimpa.extension_capture_receipt
for select to garimpa_app using (
  tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
  and garimpa.active_tenant(tenant_id)
  and current_setting('garimpa.actor_type',true)='human'
  and exists(select 1 from garimpa.affiliate_membership m
    join garimpa.affiliate_account a on a.id=m.affiliate_id
    where a.tenant_id=extension_capture_receipt.tenant_id and a.status='active'
      and m.app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
      and m.role in ('owner','operator') and m.revoked_at is null)
);

-- Exact historical identity, identical to manualExtensionItemRequestId in JS.
-- No timing heuristic, credentials, data writes or privilege elevation.
create function garimpa.manual_extension_item_request_id(p_device text,p_request uuid,p_marketplace text,p_external text)
returns uuid language sql immutable strict security invoker set search_path=pg_catalog as $$
  with input as (select sha256(convert_to('["extension-manual-v1",'||to_json(p_device)::text||','||
    to_json(p_request::text)::text||','||to_json(p_marketplace)::text||','||to_json(p_external)::text||']','UTF8')) as bytes)
  select encode(substring(set_byte(set_byte(bytes,6,(get_byte(bytes,6)&15)|80),8,(get_byte(bytes,8)&63)|128) from 1 for 16),'hex')::uuid from input
$$;
revoke all on function garimpa.manual_extension_item_request_id(text,uuid,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.manual_extension_item_request_id(text,uuid,text,text) to garimpa_app;

create index extension_capture_receipt_history on garimpa.extension_capture_receipt(tenant_id,created_at desc,device_id,request_id);
create index extension_capture_receipt_products on garimpa.extension_capture_receipt using gin ((result->'productIds') jsonb_path_ops);
create index capture_run_operation_history on garimpa.capture_run(tenant_id,(parameters->>'operationBatchId'),started_at,id)
where parameters->>'operationBatchId' is not null;
create index price_observation_individual_history on garimpa.price_observation(tenant_id,observed_at desc,id desc)
where capture_run_id is null;
-- 20261116195549_curation_operation_diagnostic.sql sha256 bf16d96c70cc45a55d42dde4be811bd6647f32b3ada23ee46b9ddadf6c15cb59
set local lock_timeout='5s';
-- Private, sanitized diagnostics. Existing uncertain calls are deliberately not backfilled.
alter table garimpa.curation_attribute_job add column diagnostic jsonb
  check(diagnostic is null or jsonb_typeof(diagnostic)='object');
create index curation_attribute_history on garimpa.curation_attribute_job(tenant_id,updated_at desc,id desc);
alter table garimpa.curation_external_budget add column configured_limit integer check(configured_limit between 1 and 1000);
-- 20261117003000_curation_operation_reader.sql sha256 fa6939af1588d6387c939d7ea0beb8a22b3fe8bde6dd527a16de3ac11a4ee03e
-- Operational projection for active human owners/operators. Keep raw jobs and
-- reconciliation audit under their existing RLS. This intentionally uses the
-- view owner's privileges; every row independently proves current membership.
-- No prompt, input_snapshot, model response, worker id or release action is exposed.
create view garimpa.curation_operation_job with (security_barrier=true) as
      select j.tenant_id,j.id::text,j.product_id,j.observation_id,latest.id as current_observation_id,p.title,j.status,j.lease_until,j.next_attempt_at,j.updated_at,case when j.diagnostic->>'version'='1' and j.diagnostic->>'stage' in ('context','provider','commit','lease','configuration') then jsonb_build_object(
          'version',1,'stage',j.diagnostic->>'stage',
          'kind',case when j.diagnostic->>'kind' in ('credential','quota','rate_limit','transient','permanent') then j.diagnostic->>'kind' else 'unknown' end,
          'certainty',case when j.diagnostic->>'stage'='configuration' then 'not_started' else 'uncertain' end,
          'at',to_char(j.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'nextAt',case when j.diagnostic->>'nextAt' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' then j.diagnostic->>'nextAt' end) else null end as diagnostic,
        coalesce(j.input_snapshot#>>'{basis,policyVersion}'='attributes-policy-v2'
          and j.input_snapshot#>>'{basis,promptVersion}'='attributes-prompt-v2.4'
          and jsonb_typeof(j.input_snapshot->'materialSnapshot')='object'
          and j.input_snapshot#>>'{materialSnapshot,title}'=p.title
          and j.input_snapshot#>>'{materialSnapshot,imageUrl}' is not distinct from p.image_url
          and j.input_snapshot#>>'{materialSnapshot,category}' is not distinct from p.category
          and j.input_snapshot#>>'{materialSnapshot,productUrl}'=p.product_url
          and j.input_snapshot->>'latestEventId' is not distinct from (select e.id::text from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1)
          and j.input_snapshot->>'curationStatus' is not distinct from c.status and coalesce(c.status,'pending')<>'rejected'
          and original.option_key=latest.option_key
          and original.price_cents>0 and abs(latest.price_cents-original.price_cents)::numeric/nullif(original.price_cents,0)<0.1
          and garimpa.curation_material_evidence(original.offer_evidence)=garimpa.curation_material_evidence(latest.offer_evidence)
          and nullif(greatest(original.rating_star,0),0) is not distinct from nullif(greatest(latest.rating_star,0),0),false) as applicable
      from garimpa.curation_attribute_job j join garimpa.product p on p.tenant_id=j.tenant_id and p.id=j.product_id
      join garimpa.price_observation original on original.tenant_id=j.tenant_id and original.product_id=j.product_id and original.id=j.observation_id
      left join garimpa.product_curation c on c.tenant_id=j.tenant_id and c.product_id=j.product_id
      left join lateral(select * from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
          or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by o.observed_at desc,o.id desc limit 1) latest on true
      where j.tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
        and garimpa.active_tenant(j.tenant_id)
        and current_setting('garimpa.actor_type',true)='human'
        and current_setting('garimpa.membership_role',true) in ('owner','operator')
        and exists(select 1 from garimpa.affiliate_membership m
          join garimpa.affiliate_account account on account.id=m.affiliate_id and account.status='active'
          join garimpa.app_user_role role on role.app_user_id=m.app_user_id and role.role='afiliado' and role.revoked_at is null
          where account.tenant_id=j.tenant_id and m.revoked_at is null
            and m.app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
            and m.role=current_setting('garimpa.membership_role',true));
revoke all on garimpa.curation_operation_job from public,anon,authenticated,garimpa_public_runtime,garimpa_app;
grant select on garimpa.curation_operation_job to garimpa_app;
comment on view garimpa.curation_operation_job is 'Read-only scoped status/history; raw job payload and owner-only reconciliation permissions remain private.';
commit;
