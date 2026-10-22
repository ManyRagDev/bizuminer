-- Consultas de diagnóstico; NÃO são migration. Somente SELECT.
-- Confirmar projeto spbuwcwmxlycchuwhfir / schema garimpa antes de executar.
-- MCP pode retornar somente último resultset: executar cada SELECT separadamente.
select current_database(), current_user, current_setting('server_version');

select
 (select count(*) from garimpa.product) products,
 (select count(*) from garimpa.price_observation) observations,
 (select count(*) from garimpa.price_observation where offer_evidence->>'variantKey' is not null) variant_keys,
 (select count(*) from garimpa.price_observation where offer_evidence is not null) evidence_present,
 (select count(*) from garimpa.publication) publications,
 (select count(*) from garimpa.click_event) clicks,
 (select count(*) from garimpa.app_user) app_users,
 (select count(*) from garimpa.affiliate_account) accounts;

select count(*) as total, count(*) filter(where lowest_verified) as verified
from garimpa.curation_queue_facts;

select pg_get_viewdef('garimpa.curation_queue_facts'::regclass,true);

select count(*) all_products,count(*) filter(where n<3) under_3,
 count(*) filter(where n=0) zero_observations
from (select p.id,count(o.id) n from garimpa.product p
 left join garimpa.price_observation o on o.product_id=p.id and o.tenant_id=p.tenant_id
 group by p.id) x;

select count(*) total,count(*) filter(where family_key is not null) family_assigned
from garimpa.product;

select channel,status,count(*) from garimpa.publication group by channel,status;

select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='garimpa' order by tablename,policyname;

select grantee,privilege_type,count(*) from information_schema.role_table_grants
where table_schema='garimpa' group by grantee,privilege_type;

select rolname,rolsuper,rolbypassrls from pg_roles where rolname='garimpa_app';

select p.id,p.last_price_cents,c.status,e.created_at,e.actor_type,e.to_status,e.policy_version,
 e.metadata->'snapshot'->'priceCents' as snapshot_price,
 e.metadata->'snapshot'->'observationCount' as snapshot_observations
from garimpa.product p left join garimpa.product_curation c
 on c.product_id=p.id and c.tenant_id=p.tenant_id
left join garimpa.curation_event e on e.product_id=p.id and e.tenant_id=p.tenant_id
where p.id in ('05c1c335-c541-4696-8be6-7b6d0580e257','afbf6c4f-d8d8-42fa-ae06-14fb7cfd14f9')
order by p.id,e.created_at;

select count(*) from garimpa.product where id like '06497fba%';
select count(*) from garimpa.product where last_price_cents<=0;
