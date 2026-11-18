begin;
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
commit;
