-- M-07: Atribuição de Cliques e Canais de Distribuição (EP-07 / C-06).
-- Adiciona colunas nullable e índices em garimpa.click_event para vincular cliques a publicações sociais e links de campanha.
-- Autorizado apenas para revisão e testes locais em ambiente isolado. Proibida aplicação remota desautorizada.

alter table garimpa.click_event
  add column if not exists campaign_publication_id text,
  add column if not exists campaign_link_id text,
  add column if not exists classification text default 'observed' check (classification in ('observed', 'known_preview', 'unknown')),
  add column if not exists classifier_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'click_event_campaign_publication_fk'
  ) then
    alter table garimpa.click_event
      add constraint click_event_campaign_publication_fk
      foreign key (campaign_publication_id, tenant_id)
      references garimpa.campaign_publication(id, tenant_id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'click_event_campaign_link_fk'
  ) then
    alter table garimpa.click_event
      add constraint click_event_campaign_link_fk
      foreign key (campaign_link_id, tenant_id)
      references garimpa.campaign_link(id, tenant_id) on delete set null;
  end if;
end $$;

create index if not exists click_event_campaign_pub_idx
  on garimpa.click_event (tenant_id, campaign_publication_id);

create index if not exists click_event_campaign_link_idx
  on garimpa.click_event (tenant_id, campaign_link_id);

-- Limited public telemetry writer: resolves ownership again, never accepts tenant ids.
create or replace function garimpa.record_public_click(p_slug text,p_code text,p_agent text,p_referer text,p_ip_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare target record; link record; begin
 select null::text as social_publication_id,null::text as link_id into link;
 select * into target from garimpa.public_monetized_target(p_slug);
 if not found then return false; end if;
 if p_code is not null then
  select * into link from garimpa.public_campaign_link(p_code,p_slug);
  if not found or link.web_publication_id<>target.publication_id or link.tenant_id<>target.tenant_id then return false; end if;
 end if;
 insert into garimpa.click_event(id,tenant_id,publication_id,campaign_publication_id,campaign_link_id,user_agent,referer,ip_hash)
 values(gen_random_uuid()::text,target.tenant_id,target.publication_id,link.social_publication_id,link.link_id,left(p_agent,500),left(p_referer,2000),left(p_ip_hash,64));
 return true;
end $$;
revoke all on function garimpa.record_public_click(text,text,text,text,text) from public,anon,authenticated;
grant execute on function garimpa.record_public_click(text,text,text,text,text) to garimpa_public_runtime;
