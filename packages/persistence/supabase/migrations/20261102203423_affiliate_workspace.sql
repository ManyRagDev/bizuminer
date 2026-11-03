-- Affiliate workspace. Additive; local verification precedes any remote rollout.
set local lock_timeout='5s';
set local statement_timeout='45s';
create table garimpa.work_draft (
  id uuid primary key,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  author_id text not null references garimpa.app_user(id),
  kind text not null check (kind in ('offer','content')),
  channel text not null check (channel in ('whatsapp','stories','instagram_feed')),
  title text not null default '' check (length(title)<=250),
  product_id text,
  option_key text,
  source_url text not null default '',
  content jsonb not null default '{}' check (jsonb_typeof(content)='object' and octet_length(content::text)<=100000),
  version integer not null default 1 check (version>0),
  state text not null default 'editing' check (state in ('editing','review','prepared','published','archived')),
  publication_id text,
  legacy_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,tenant_id),
  unique(tenant_id,author_id,legacy_ref),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(publication_id,tenant_id) references garimpa.campaign_publication(id,tenant_id)
);
create index work_draft_author_recent on garimpa.work_draft(tenant_id,author_id,updated_at desc,id);
create index work_draft_publication on garimpa.work_draft(publication_id,tenant_id) where publication_id is not null;
alter table garimpa.work_draft enable row level security;
revoke all on garimpa.work_draft from public,anon,authenticated;
grant select,insert,update on garimpa.work_draft to garimpa_app;
create policy work_draft_read on garimpa.work_draft for select to garimpa_app using (
  tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and
  (author_id=nullif(current_setting('garimpa.actor_app_user_id',true),'') or state='published'
    or (state in ('review','prepared') and current_setting('garimpa.membership_role',true)='owner'))
);
create policy work_draft_insert on garimpa.work_draft for insert to garimpa_app with check (
  tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and
  author_id=nullif(current_setting('garimpa.actor_app_user_id',true),'') and state='editing'
);
create policy work_draft_update on garimpa.work_draft for update to garimpa_app using (
  tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and
  (author_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
    or (state in ('review','prepared') and current_setting('garimpa.membership_role',true)='owner'))
) with check (
  tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and
  (author_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
    or (state in ('review','prepared','published') and current_setting('garimpa.membership_role',true)='owner'))
);
create function garimpa.work_draft_identity_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.id<>old.id or new.tenant_id<>old.tenant_id or new.author_id<>old.author_id then
   raise exception 'draft_identity_immutable';
 end if;
 return new;
end $$;
create trigger work_draft_identity before update on garimpa.work_draft for each row execute function garimpa.work_draft_identity_immutable();
revoke all on function garimpa.work_draft_identity_immutable() from public,anon,authenticated;

alter table garimpa.commercial_kit alter column campaign_id drop not null;
alter table garimpa.campaign_publication alter column campaign_id drop not null;
alter table garimpa.commercial_kit add column audience_policy_version_id text;
alter table garimpa.commercial_kit add column workspace_author_id text references garimpa.app_user(id);
alter table garimpa.commercial_kit add column workspace_visibility text check (workspace_visibility in ('private','review','published'));
alter table garimpa.commercial_kit add constraint kit_workspace_identity check ((workspace_author_id is null)=(workspace_visibility is null));
update garimpa.commercial_kit k set audience_policy_version_id=c.audience_policy_version_id from garimpa.campaign c where c.id=k.campaign_id and c.tenant_id=k.tenant_id;
create function garimpa.kit_workspace_identity_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.workspace_author_id is not null and (new.workspace_author_id is distinct from old.workspace_author_id or new.audience_policy_version_id is distinct from old.audience_policy_version_id) then raise exception 'kit_workspace_identity_immutable'; end if;
 return new;
end $$;
create trigger kit_workspace_identity before update on garimpa.commercial_kit for each row execute function garimpa.kit_workspace_identity_immutable();
revoke all on function garimpa.kit_workspace_identity_immutable() from public,anon,authenticated;

-- Legacy materials retain their access. New personal work is private until
-- explicitly submitted to an owner or confirmed as published.
do $$ declare r text; predicate text; begin
 foreach r in array array['commercial_kit','commercial_kit_revision','campaign_publication','campaign_link','kit_validation','kit_approval'] loop
  if to_regclass('garimpa.'||r) is null then continue; end if;
  predicate := 'tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),'''')';
  if r='commercial_kit' then
   predicate := predicate || ' and (workspace_author_id is null or workspace_author_id=nullif(current_setting(''garimpa.actor_app_user_id'',true),'''') or workspace_visibility=''published'' or (workspace_visibility=''review'' and current_setting(''garimpa.membership_role'',true)=''owner'') or current_setting(''garimpa.actor_type'',true)=''worker'')';
  elsif r in ('commercial_kit_revision','campaign_publication') then
   predicate := predicate || format(' and exists(select 1 from garimpa.commercial_kit k where k.id=%I.kit_id and k.tenant_id=%I.tenant_id)',r,r);
  elsif r='campaign_link' then
   predicate := predicate || ' and exists(select 1 from garimpa.campaign_publication p where p.id=campaign_link.publication_id and p.tenant_id=campaign_link.tenant_id)';
  else
   predicate := predicate || format(' and exists(select 1 from garimpa.commercial_kit_revision r where r.id=%I.revision_id and r.tenant_id=%I.tenant_id)',r,r);
  end if;
  execute format('create policy %I on garimpa.%I as restrictive for all to garimpa_app using (%s) with check (%s)',r||'_workspace_scope',r,predicate,predicate);
 end loop;
end $$;
create policy workspace_approval_owner on garimpa.kit_approval as restrictive for insert to garimpa_app with check(current_setting('garimpa.membership_role',true)='owner');

alter table garimpa.recommendation_exposure alter column edition_id drop not null;
alter table garimpa.recommendation_exposure add column publication_id text;
alter table garimpa.recommendation_exposure add constraint exposure_publication_account foreign key(publication_id,tenant_id) references garimpa.campaign_publication(id,tenant_id);
alter table garimpa.recommendation_exposure add constraint exposure_origin check (edition_id is not null or publication_id is not null);
create unique index recommendation_exposure_publication on garimpa.recommendation_exposure(tenant_id,publication_id) where publication_id is not null;

alter table garimpa.affiliate_marketplace_config add column connection_checked_at timestamptz;
alter table garimpa.affiliate_marketplace_config add column connection_status text check (connection_status in ('configured','verified','failed'));
alter table garimpa.affiliate_marketplace_config add column connection_version text;

alter table garimpa.commercial_kit add constraint kit_policy_account foreign key(audience_policy_version_id,tenant_id) references garimpa.audience_policy_version(id,tenant_id);
create table garimpa.workspace_settings (
 tenant_id text primary key references garimpa.affiliate_account(tenant_id),
 audience_policy_version_id text not null,
 version integer not null default 1,
 updated_by text not null references garimpa.app_user(id),
 updated_at timestamptz not null default now(),
 foreign key(audience_policy_version_id,tenant_id) references garimpa.audience_policy_version(id,tenant_id)
);
alter table garimpa.workspace_settings enable row level security;
revoke all on garimpa.workspace_settings from public,anon,authenticated;
grant select,insert,update on garimpa.workspace_settings to garimpa_app;
create policy workspace_settings_read on garimpa.workspace_settings for select to garimpa_app using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy workspace_settings_write on garimpa.workspace_settings for all to garimpa_app using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner') with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner');

create table garimpa.workspace_rollout (
 tenant_id text primary key references garimpa.affiliate_account(tenant_id),
 enabled boolean not null default false,
 enabled_at timestamptz
);
alter table garimpa.workspace_rollout enable row level security;
revoke all on garimpa.workspace_rollout from public,anon,authenticated;
grant select on garimpa.workspace_rollout to garimpa_app;
create policy workspace_rollout_read on garimpa.workspace_rollout for select to garimpa_app using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
do $$ declare t text; begin
 foreach t in array array['work_draft','workspace_settings','workspace_rollout'] loop
  execute format('create policy active_account on garimpa.%I as restrictive for all to garimpa_app using(garimpa.active_tenant(tenant_id)) with check(garimpa.active_tenant(tenant_id))',t);
 end loop;
end $$;

-- Even a known artifact UUID must not reveal someone else's unpublished render.
create policy private_workspace_render on garimpa.private_artifact as restrictive for all to garimpa_app
 using(kind<>'kit_render' or exists(select 1 from garimpa.commercial_kit_revision r where r.id=private_artifact.owner_ref and r.tenant_id=private_artifact.tenant_id))
 with check(kind<>'kit_render' or exists(select 1 from garimpa.commercial_kit_revision r where r.id=private_artifact.owner_ref and r.tenant_id=private_artifact.tenant_id));

-- Keep the existing public link contract. New materials expose their immutable
-- option through a narrow projection; no draft text or author identity is public.
create function garimpa.public_workspace_link(p_code text,p_slug text default null)
 returns table(slug text,option_key text,workspace boolean,available boolean)
 language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select pub.slug,r.snapshot->>'optionKey',k.workspace_author_id is not null,
  (k.workspace_author_id is null or (cp.status in ('ready','exported','published_confirmed') and k.status='approved'
    and r.snapshot->>'optionKey' is not null and garimpa.public_confirmed_offer(pub.slug,r.snapshot->>'optionKey') is not null))
 from garimpa.campaign_link l join garimpa.campaign_publication cp on cp.id=l.publication_id and cp.tenant_id=l.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.commercial_kit_revision r on r.id=cp.kit_revision_id and r.tenant_id=cp.tenant_id
 join garimpa.publication pub on pub.id=l.web_publication_id and pub.tenant_id=l.tenant_id
 where l.code=p_code and l.monetization_status='valid' and l.revoked_at is null and pub.status='active' and (p_slug is null or pub.slug=p_slug);
$$;
revoke all on function garimpa.public_workspace_link(text,text) from public,anon,authenticated;
grant execute on function garimpa.public_workspace_link(text,text) to garimpa_public_runtime;

create or replace function garimpa.public_campaign_link(p_code text,p_slug text default null)
returns table(code text,slug text,tenant_id text,link_id text,social_publication_id text,web_publication_id text)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select cl.code,f.slug,f.tenant_id,cl.id,cp.id,f.publication_id
 from garimpa.campaign_link cl join garimpa.campaign_publication cp on cp.id=cl.publication_id and cp.tenant_id=cl.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.commercial_kit_revision r on r.id=cp.kit_revision_id and r.tenant_id=cp.tenant_id
 join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id
 join garimpa.public_offer_rows(null) f on f.id=o.product_id and f.tenant_id=cl.tenant_id and f.publication_id=cl.web_publication_id
 where cl.code=p_code and cl.monetization_status='valid' and cl.revoked_at is null and (p_slug is null or f.slug=p_slug)
  and (k.workspace_author_id is null or (k.status='approved' and cp.status in ('ready','exported','published_confirmed') and garimpa.public_confirmed_offer(f.slug,r.snapshot->>'optionKey') is not null));
$$;
