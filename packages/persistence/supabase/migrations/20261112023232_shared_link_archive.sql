begin;
set local lock_timeout='5s';
set local statement_timeout='45s';

-- An archive is not an offer. No product, price, curation or publication row is created.
create unique index if not exists shared_link_archive_account_identity_idx
  on garimpa.affiliate_account(id,tenant_id);
create table garimpa.shared_link_archive (
  alias text primary key check(alias in ('4bzr','4jt3','ptej','zpd7','bjjj','autk','bnfx','k7e3')),
  bio_code text not null check(bio_code=upper(right(alias,3))),
  slug text not null unique check(length(slug) between 1 and 512 and slug not in ('.','..')
    and slug !~ E'[[:space:][:cntrl:]/\\\\?#]'),
  tenant_id text not null check(tenant_id ~ '^[a-z0-9._-]{1,64}$'),
  affiliate_id text not null,
  title text not null check(btrim(title)<>''),
  image_url text check(image_url is null or (image_url ~* '^https://[^[:space:]]+$' and image_url !~ E'[[:cntrl:]\\\\]')),
  marketplace text not null check(marketplace='shopee'),
  affiliate_url text not null check(
    affiliate_url ~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*(shopee\.com\.br|shope\.ee)([/?#]|$)'
    and affiliate_url !~ E'[[:space:][:cntrl:]\\\\]'),
  provenance jsonb not null check(jsonb_typeof(provenance)='object'),
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  record_sha256 text not null check(record_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check(status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique(tenant_id,bio_code),
  foreign key(affiliate_id,tenant_id) references garimpa.affiliate_account(id,tenant_id) on delete restrict
);
alter table garimpa.shared_link_archive enable row level security;
-- Explicitly remove inherited default CRUD. Import/revoke requires the dedicated owner credential.
revoke all on garimpa.shared_link_archive from public,anon,authenticated,service_role,garimpa_app,garimpa_public_runtime;

-- Namespace writes are deliberately serialized, only inside short SQL transactions.
-- The advisory lock orders all three writers; touching one private row additionally
-- rejects stale REPEATABLE READ snapshots with serialization_failure. SELECT after
-- an advisory lock alone would not protect that isolation level from phantom collisions.
create table garimpa.shared_link_archive_namespace (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0
);
insert into garimpa.shared_link_archive_namespace(singleton) values(true);
alter table garimpa.shared_link_archive_namespace enable row level security;
revoke all on garimpa.shared_link_archive_namespace from public,anon,authenticated,service_role,garimpa_app,garimpa_public_runtime;

create function garimpa.guard_shared_link_archive() returns trigger
language plpgsql security definer set search_path=pg_catalog,garimpa as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'shared_link_archive_immutable'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
      raise exception 'shared_link_archive_immutable';
    end if;
    return new; -- Status changes do not change or release the reserved namespace.
  end if;
  perform pg_advisory_xact_lock(hashtextextended('garimpa:shared-link-namespace',0));
  update garimpa.shared_link_archive_namespace set revision=revision+1 where singleton;
  if not found then raise exception 'shared_link_archive_namespace_unavailable'; end if;
  if exists(select 1 from garimpa.short_link s where s.code=new.alias or s.slug=new.slug)
    or exists(select 1 from garimpa.publication p where p.slug=new.slug) then
    raise exception 'shared_link_archive_namespace_conflict';
  end if;
  return new;
end $$;
revoke all on function garimpa.guard_shared_link_archive() from public,anon,authenticated,service_role,garimpa_app,garimpa_public_runtime;
create trigger shared_link_archive_immutable_and_reserved before insert or update or delete on garimpa.shared_link_archive
for each row execute function garimpa.guard_shared_link_archive();
create trigger shared_link_archive_no_truncate before truncate on garimpa.shared_link_archive
for each statement execute function garimpa.guard_shared_link_archive();

create function garimpa.reserve_shared_link_archive_namespace() returns trigger
language plpgsql security definer set search_path=pg_catalog,garimpa as $$
begin
  if tg_table_name='short_link' then
    if tg_op='UPDATE' then
      if new.code is not distinct from old.code and new.slug is not distinct from old.slug then return new; end if;
    end if;
  elsif tg_table_name='publication' then
    if tg_op='UPDATE' then
      if new.slug is not distinct from old.slug then return new; end if;
    end if;
  else raise exception 'shared_link_archive_invalid_writer';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('garimpa:shared-link-namespace',0));
  update garimpa.shared_link_archive_namespace set revision=revision+1 where singleton;
  if not found then raise exception 'shared_link_archive_namespace_unavailable'; end if;
  if tg_table_name='short_link' then
    if exists(select 1 from garimpa.shared_link_archive a where a.alias=new.code or a.slug=new.slug) then
      raise exception 'shared_link_archive_namespace_conflict';
    end if;
  else
    if exists(select 1 from garimpa.shared_link_archive a where a.slug=new.slug) then
      raise exception 'shared_link_archive_namespace_conflict';
    end if;
  end if;
  return new;
end $$;
revoke all on function garimpa.reserve_shared_link_archive_namespace() from public,anon,authenticated,service_role,garimpa_app,garimpa_public_runtime;
create trigger short_link_reserves_archive_namespace before insert or update of code,slug on garimpa.short_link
for each row execute function garimpa.reserve_shared_link_archive_namespace();
create trigger publication_reserves_archive_namespace before insert or update of slug on garimpa.publication
for each row execute function garimpa.reserve_shared_link_archive_namespace();

create function garimpa.public_shared_link_archive(p_kind text,p_key text,p_tenant text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
declare archived garimpa.shared_link_archive; account_active boolean;
begin
  if p_kind not in ('alias','slug','bio') or p_key is null or (p_kind='bio' and p_tenant is null) then return null; end if;
  select a.* into archived from garimpa.shared_link_archive a
    where (p_tenant is null or a.tenant_id=p_tenant)
      and case p_kind when 'alias' then a.alias=p_key when 'slug' then a.slug=p_key
        when 'bio' then a.bio_code=upper(p_key) else false end;
  if not found then return null; end if;
  select a.status='active' into account_active from garimpa.affiliate_account a
    where a.id=archived.affiliate_id and a.tenant_id=archived.tenant_id;
  if archived.status<>'active' or account_active is distinct from true then
    return jsonb_build_object('archived',true,'available',false);
  end if;
  return jsonb_build_object('archived',true,'available',true,'alias',archived.alias,'bioCode',archived.bio_code,
    'slug',archived.slug,'tenantId',archived.tenant_id,'title',archived.title,'imageUrl',archived.image_url,'marketplace',archived.marketplace);
end $$;

create function garimpa.public_shared_link_archive_target(p_slug text) returns text
language sql stable security definer set search_path=pg_catalog,garimpa as $$
  select a.affiliate_url from garimpa.shared_link_archive a
  join garimpa.affiliate_account account on account.id=a.affiliate_id and account.tenant_id=a.tenant_id and account.status='active'
  where a.slug=p_slug and a.status='active'
$$;
revoke all on function garimpa.public_shared_link_archive(text,text,text),garimpa.public_shared_link_archive_target(text)
  from public,anon,authenticated,service_role,garimpa_app,garimpa_public_runtime;
grant execute on function garimpa.public_shared_link_archive(text,text,text),garimpa.public_shared_link_archive_target(text)
  to garimpa_public_runtime;
commit;
