-- M-04: Campanhas comerciais, kits, publicações sociais e links de campanha (EP-04 / C-04 / C-05 / C-06).
--
-- Objetivos:
-- 1. Cria campaign e destination para gerenciamento comercial.
-- 2. Cria commercial_kit, commercial_kit_revision, kit_validation e kit_approval (ledger de conteúdo imutável).
-- 3. Cria campaign_publication para publicações sociais assistidas/integradas.
-- 4. Cria campaign_link com códigos de 12 caracteres (C-06) segregados dos 4 caracteres legados.
-- 5. Aplica isolamento estrito de tenant via RLS.

-- 1. Campanha e destinos ----------------------------------------------------
create table if not exists garimpa.campaign (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  name text not null,
  objective text not null,
  audience_policy_version_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version int not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (audience_policy_version_id, tenant_id) references garimpa.audience_policy_version(id, tenant_id)
);

create index if not exists idx_campaign_tenant_status
  on garimpa.campaign (tenant_id, status);

create table if not exists garimpa.destination (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  channel text not null,
  label text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  external_target_ref text,
  secret_ref text,
  automation_mode text not null default 'assisted' check (automation_mode in ('assisted', 'integrated', 'scheduled')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id)
);

create index if not exists idx_destination_tenant_channel
  on garimpa.destination (tenant_id, channel, status);

-- 2. Kit comercial e revisões ----------------------------------------------
create table if not exists garimpa.commercial_kit (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  campaign_id text not null,
  opportunity_id text not null,
  current_revision int not null default 1 check (current_revision > 0),
  version int not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'validating', 'needs_revision', 'approved', 'invalidated', 'archived')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id) references garimpa.campaign(id, tenant_id),
  foreign key (opportunity_id, tenant_id) references garimpa.opportunity(id, tenant_id)
);

create index if not exists idx_commercial_kit_campaign
  on garimpa.commercial_kit (tenant_id, campaign_id, status);

create table if not exists garimpa.commercial_kit_revision (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  kit_id text not null,
  revision int not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  claims jsonb not null check (jsonb_typeof(claims) = 'array'),
  materials jsonb not null check (jsonb_typeof(materials) = 'array'),
  template_version text not null default '1.0.0',
  prompt_version text,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  content_digest text not null,
  unique (kit_id, revision),
  unique (id, tenant_id),
  foreign key (kit_id, tenant_id) references garimpa.commercial_kit(id, tenant_id)
);

create index if not exists idx_kit_revision_lookup
  on garimpa.commercial_kit_revision (tenant_id, kit_id, revision desc);

create table if not exists garimpa.kit_validation (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  revision_id text not null,
  input_digest text not null,
  checked_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  result text not null check (result in ('valid', 'invalid', 'unknown')),
  blockers text[] not null default array[]::text[],
  validator_version text not null default '1.0.0',
  unique (id, tenant_id),
  foreign key (revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id)
);

create table if not exists garimpa.kit_approval (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  revision_id text not null,
  validation_id text not null,
  approved_by text not null,
  approved_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id),
  foreign key (validation_id, tenant_id) references garimpa.kit_validation(id, tenant_id)
);

-- 3. Publicações de campanha e links ---------------------------------------
create table if not exists garimpa.campaign_publication (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  campaign_id text not null,
  kit_id text not null,
  kit_revision_id text not null,
  destination_id text not null,
  channel text not null,
  version int not null default 1 check (version > 0),
  status text not null default 'planned' check (status in ('planned', 'ready', 'exported', 'published_confirmed', 'cancelled', 'expired', 'failed')),
  scheduled_at timestamptz,
  exported_at timestamptz,
  published_at timestamptz,
  confirmation_source text,
  publication_url text,
  failure_code text,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id) references garimpa.campaign(id, tenant_id),
  foreign key (kit_id, tenant_id) references garimpa.commercial_kit(id, tenant_id),
  foreign key (kit_revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id),
  foreign key (destination_id, tenant_id) references garimpa.destination(id, tenant_id)
);

create index if not exists idx_campaign_publication_status
  on garimpa.campaign_publication (tenant_id, campaign_id, status);

create table if not exists garimpa.campaign_link (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  publication_id text not null,
  web_publication_id text,
  code text not null unique check (length(code) = 12),
  target_url text,
  monetization_status text not null default 'reserved' check (monetization_status in ('reserved', 'valid', 'invalid', 'revoked')),
  capability_version text not null default '1.0.0',
  validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (publication_id, tenant_id),
  unique (id, tenant_id),
  foreign key (publication_id, tenant_id) references garimpa.campaign_publication(id, tenant_id)
);

create index if not exists idx_campaign_link_code
  on garimpa.campaign_link (code);

-- 4. Permissões e RLS ------------------------------------------------------
revoke all on
  garimpa.campaign,
  garimpa.destination,
  garimpa.commercial_kit,
  garimpa.commercial_kit_revision,
  garimpa.kit_validation,
  garimpa.kit_approval,
  garimpa.campaign_publication,
  garimpa.campaign_link
from public, anon, authenticated;

grant select, insert, update on
  garimpa.campaign,
  garimpa.destination,
  garimpa.commercial_kit,
  garimpa.commercial_kit_revision,
  garimpa.kit_validation,
  garimpa.kit_approval,
  garimpa.campaign_publication,
  garimpa.campaign_link
to garimpa_app;

alter table garimpa.campaign enable row level security;
alter table garimpa.destination enable row level security;
alter table garimpa.commercial_kit enable row level security;
alter table garimpa.commercial_kit_revision enable row level security;
alter table garimpa.kit_validation enable row level security;
alter table garimpa.kit_approval enable row level security;
alter table garimpa.campaign_publication enable row level security;
alter table garimpa.campaign_link enable row level security;

create policy campaign_isolation on garimpa.campaign
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy destination_isolation on garimpa.destination
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy commercial_kit_isolation on garimpa.commercial_kit
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy commercial_kit_revision_isolation on garimpa.commercial_kit_revision
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy kit_validation_isolation on garimpa.kit_validation
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy kit_approval_isolation on garimpa.kit_approval
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy campaign_publication_isolation on garimpa.campaign_publication
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy campaign_link_isolation on garimpa.campaign_link
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

-- Frozen revisions, validations and approvals are append-only.
revoke update,delete on garimpa.commercial_kit_revision,garimpa.kit_validation,garimpa.kit_approval from garimpa_app;
alter table garimpa.campaign_link add constraint campaign_link_web_publication_fkey
 foreign key(web_publication_id,tenant_id) references garimpa.publication(id,tenant_id) on delete restrict;

-- Public projections: no private account/configuration DTO is returned.
create or replace function garimpa.public_offer_rows(p_tenant text default null)
returns table(id text,tenant_id text,publication_id text,title text,image_url text,category text,marketplace text,slug text,
 price_cents int,original_price_cents int,claimed_discount_rate double precision,rating_star double precision,
 sales_label text,sales_count int,evidence_observed_at timestamptz,min_price_cents int,previous_min_price_cents int,
 observation_count int,history_days int,lowest_verified boolean)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select f.id,f.tenant_id,pub.id,f.title,f.image_url,f.category,f.marketplace,pub.slug,
 f.price_cents,f.original_price_cents,f.claimed_discount_rate,f.rating_star,f.sales_label,f.sales_count,f.observed_at,
 f.previous_min_price_cents,f.previous_min_price_cents,f.observation_count,f.history_days,f.lowest_verified
 from garimpa.curation_queue_facts f
 join lateral(select p.* from garimpa.publication p join garimpa.affiliate_account a on a.id=p.affiliate_id and a.tenant_id=p.tenant_id and a.status='active'
   where p.product_id=f.id and p.tenant_id=f.tenant_id and p.channel='web' and p.status='active' order by p.published_at desc,p.id limit 1) pub on true
 where f.status='approved' and f.price_cents>0 and f.last_seen_at>=now()-interval '7 days'
   and (p_tenant is null or f.tenant_id=p_tenant);
$$;

create or replace function garimpa.public_deal_detail(p_slug text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select jsonb_build_object('deal',to_jsonb(f)-'tenant_id'-'publication_id','price_history',coalesce((
   select jsonb_agg(jsonb_build_object('price_cents',o.price_cents,'observed_at',o.observed_at) order by o.observed_at,o.id)
   from garimpa.price_observation o
   where o.product_id=f.id and o.tenant_id=f.tenant_id and o.observed_at>=now()-interval '90 days' and o.price_cents>0
     and o.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
     and garimpa.offer_configuration_key(latest.offer_evidence) is not null
     and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)
 ),'[]'::jsonb))
 from garimpa.public_offer_rows(null) f join lateral(select offer_evidence from garimpa.price_observation where product_id=f.id and tenant_id=f.tenant_id order by observed_at desc,id desc limit 1) latest on true
 where f.slug=p_slug limit 1;
$$;

create or replace function garimpa.public_catalog(p_tenant text,q jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with selected as(select id,version from garimpa.editorial_selection where tenant_id=p_tenant and status='active' and valid_until>now() order by version desc limit 1),
 filtered as (
  select f.*,item.position from garimpa.public_offer_rows(p_tenant) f
  left join garimpa.editorial_selection_item item on item.product_id=f.id and item.tenant_id=f.tenant_id and item.selection_id=(select id from selected) and 'home'=any(item.destinations)
  where (q->>'category' is null or f.category=q->>'category') and (q->>'search' is null or f.title ilike '%'||(q->>'search')||'%')
   and (q->>'marketplace' is null or f.marketplace=q->>'marketplace')
   and (q->>'minPriceCents' is null or f.price_cents>=(q->>'minPriceCents')::int)
   and (q->>'maxPriceCents' is null or f.price_cents<=(q->>'maxPriceCents')::int)
   and (q->>'minRating' is null or f.rating_star>=(q->>'minRating')::numeric)
   and (q->>'minDiscount' is null or f.claimed_discount_rate>=(q->>'minDiscount')::numeric/100)
   and (not coalesce((q->>'lowestOnly')::boolean,false) or f.lowest_verified)
   and (not coalesce((q->>'hasHistory')::boolean,false) or (f.observation_count>=3 and f.history_days>=7))
   and (q->>'freshnessDays' is null or f.evidence_observed_at>=now()-least(7,(q->>'freshnessDays')::int)*interval '1 day')
 ), paged as(select * from filtered order by
   case when coalesce(q->>'sort','signal')='signal' then position end nulls last,
   case when q->>'sort'='price' then price_cents end asc nulls last,
   case when q->>'sort'='popularity' then sales_count end desc nulls last,
   evidence_observed_at desc,id limit least(24,greatest(1,coalesce((q->>'limit')::int,12))) offset greatest(0,coalesce((q->>'offset')::int,0)))
 select jsonb_build_object('deals',coalesce((select jsonb_agg(to_jsonb(p)-'tenant_id'-'publication_id'-'position') from paged p),'[]'::jsonb),
  'total',(select count(*) from filtered),'selectionVersion',(select version from selected),'selectionStateKey','public-v1');
$$;

create or replace function garimpa.public_campaign_link(p_code text,p_slug text default null)
returns table(code text,slug text,tenant_id text,link_id text,social_publication_id text,web_publication_id text)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select cl.code,f.slug,f.tenant_id,cl.id,cp.id,f.publication_id
 from garimpa.campaign_link cl join garimpa.campaign_publication cp on cp.id=cl.publication_id and cp.tenant_id=cl.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id
 join garimpa.public_offer_rows(null) f on f.id=o.product_id and f.tenant_id=cl.tenant_id and f.publication_id=cl.web_publication_id
 where cl.code=p_code and cl.monetization_status='valid' and cl.revoked_at is null
   and (p_slug is null or f.slug=p_slug);
$$;

create or replace function garimpa.uri_component(p_text text)
returns text language plpgsql immutable set search_path=pg_catalog as $$
declare bytes bytea:=convert_to(p_text,'UTF8'); result text:=''; b int; i int; begin
 for i in 0..length(bytes)-1 loop b:=get_byte(bytes,i);
  result:=result||case when (b between 48 and 57) or (b between 65 and 90) or (b between 97 and 122) or b in (45,46,95,126) then chr(b) else '%'||upper(lpad(to_hex(b),2,'0')) end;
 end loop; return result;
end $$;

create or replace function garimpa.public_monetized_target(p_slug text)
returns table(url text,publication_id text,tenant_id text)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
declare f record; p record; c record; pair text; kept text[]:=array[]::text[]; base text; fragment text; query text; begin
 select * into f from garimpa.public_offer_rows(null) where slug=p_slug limit 1;
 if not found then return; end if;
 select pub.*,product.product_url into p from garimpa.publication pub join garimpa.product product on product.id=pub.product_id and product.tenant_id=pub.tenant_id where pub.id=f.publication_id;
 if f.marketplace in ('shopee','aliexpress') then
  if p.affiliate_url is null or p.affiliate_url !~ '^https://' then return; end if;
  return query select p.affiliate_url::text,f.publication_id::text,f.tenant_id::text; return;
 end if;
 if f.marketplace<>'mercadolivre' or p.product_url !~ '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/' then return; end if;
 select * into c from garimpa.affiliate_marketplace_config where affiliate_id=p.affiliate_id and marketplace=f.marketplace and status='active';
 if not found or c.tracking_id is null or c.tool_id is null or c.tracking_id='' or c.tool_id='' then return; end if;
 base:=split_part(split_part(p.product_url,'#',1),'?',1); fragment:=case when position('#' in p.product_url)>0 then '#'||split_part(p.product_url,'#',2) else '' end;
 query:=case when position('?' in split_part(p.product_url,'#',1))>0 then split_part(split_part(p.product_url,'#',1),'?',2) else '' end;
 foreach pair in array string_to_array(query,'&') loop if pair<>'' and split_part(pair,'=',1) not in ('matt_word','matt_tool','forceInApp') then kept:=array_append(kept,pair); end if; end loop;
 kept:=kept||array['matt_word='||garimpa.uri_component(c.tracking_id||'_'||p_slug),'matt_tool='||garimpa.uri_component(c.tool_id),'forceInApp=true'];
 return query select (base||'?'||array_to_string(kept,'&')||fragment)::text,f.publication_id::text,f.tenant_id::text;
end $$;

revoke all on function garimpa.public_offer_rows(text),garimpa.public_deal_detail(text),garimpa.public_catalog(text,jsonb),garimpa.public_campaign_link(text,text),garimpa.public_monetized_target(text),garimpa.uri_component(text) from public,anon,authenticated;
grant execute on function garimpa.public_offer_rows(text),garimpa.public_deal_detail(text),garimpa.public_catalog(text,jsonb),garimpa.public_campaign_link(text,text),garimpa.public_monetized_target(text) to garimpa_public_runtime;

-- Tenant equality alone does not establish kit/campaign/revision ownership.
alter table garimpa.commercial_kit add unique(id,campaign_id,tenant_id);
alter table garimpa.commercial_kit_revision add unique(id,kit_id,tenant_id);
alter table garimpa.kit_validation add unique(id,revision_id,tenant_id);
alter table garimpa.campaign_publication add foreign key(kit_id,campaign_id,tenant_id)
 references garimpa.commercial_kit(id,campaign_id,tenant_id);
alter table garimpa.campaign_publication add foreign key(kit_revision_id,kit_id,tenant_id)
 references garimpa.commercial_kit_revision(id,kit_id,tenant_id);
alter table garimpa.kit_approval add foreign key(validation_id,revision_id,tenant_id)
 references garimpa.kit_validation(id,revision_id,tenant_id);

-- Existing four-character links retain a public, eligibility-checked resolver.
create or replace function garimpa.public_short_link(p_code text,p_tenant text)
returns text language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select s.slug from garimpa.short_link s join garimpa.public_offer_rows(p_tenant) f on f.slug=s.slug and f.tenant_id=s.tenant_id
 where s.code=p_code and (p_tenant is null or s.tenant_id=p_tenant) limit 1;
$$;
revoke all on function garimpa.public_short_link(text,text) from public,anon,authenticated;
grant execute on function garimpa.public_short_link(text,text) to garimpa_public_runtime;

create or replace function garimpa.public_catalog_stats(p_tenant text,p_days int)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with rows as (select f.* from garimpa.public_offer_rows(p_tenant) f join garimpa.product p on p.id=f.id and p.tenant_id=f.tenant_id
  where p.last_seen_at>=now()-least(7,greatest(1,p_days))*interval '1 day'),
 categories as(select category,count(*)::int as count,sum(coalesce(sales_count,0))::bigint as "totalSales",sum(price_cents)::bigint as "sumPriceCents" from rows where category is not null group by category)
 select jsonb_build_object('categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
 'marketplaces',coalesce((select jsonb_object_agg(m,n) from (select marketplace m,count(*)::int n from rows group by marketplace) counts),'{}'::jsonb),
 'categoryStats',coalesce((select jsonb_agg(c) from categories c),'[]'::jsonb));
$$;
revoke all on function garimpa.public_catalog_stats(text,int) from public,anon,authenticated;
grant execute on function garimpa.public_catalog_stats(text,int) to garimpa_public_runtime;

create or replace function garimpa.public_mint_short_link(p_slug text,p_tenant text,p_code text)
returns text language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare result text; begin
 if p_code !~ '^[abcdefghjkmnpqrtuvwxyz2346789]{4}$' or not exists(select 1 from garimpa.public_offer_rows(p_tenant) where slug=p_slug) then return null; end if;
 select code into result from garimpa.short_link where slug=p_slug and tenant_id=p_tenant;
 if found then return result; end if;
 insert into garimpa.short_link(code,tenant_id,slug) values(p_code,p_tenant,p_slug) on conflict do nothing;
 select code into result from garimpa.short_link where slug=p_slug and tenant_id=p_tenant;
 return result;
end $$;
revoke all on function garimpa.public_mint_short_link(text,text,text) from public,anon,authenticated;
grant execute on function garimpa.public_mint_short_link(text,text,text) to garimpa_public_runtime;

create or replace function garimpa.public_hero_candidates(p_tenant text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select coalesce(jsonb_agg(to_jsonb(f)-'tenant_id'-'publication_id'),'[]'::jsonb)
 from garimpa.public_offer_rows(p_tenant) f where image_url is not null;
$$;
revoke all on function garimpa.public_hero_candidates(text) from public,anon,authenticated;
grant execute on function garimpa.public_hero_candidates(text) to garimpa_public_runtime;
