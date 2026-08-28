-- Integridade e isolamento por tenant (E2, 26/08/2026).
-- Transforma tenant_id de convenção em barreira verificável no banco:
--   1. toda linha de negócio passa a referenciar um affiliate_account (tenant tem pai);
--   2. FKs de negócio passam a carregar o tenant junto (relação nunca cruza tenant);
--   3. índices cobrem as FKs e os predicados de tenant.
-- Depende da migration de E1 (affiliate_account + aff_local). NÃO aplicada nesta
-- sessão (ação externa pendente de autorização).

-- 1. Chave de referência composta nas tabelas-pai -------------------------
alter table garimpa.product
  add constraint product_id_tenant_key unique (id, tenant_id);
alter table garimpa.capture_run
  add constraint capture_run_id_tenant_key unique (id, tenant_id);
alter table garimpa.app_user
  add constraint app_user_id_tenant_key unique (id, tenant_id);
alter table garimpa.publication
  add constraint publication_id_tenant_key unique (id, tenant_id);

-- 2. tenant_id agora referencia a conta-pai (tenant sem conta não existe) ---
do $$
declare
  rel text;
begin
  foreach rel in array array[
    'product', 'price_observation', 'capture_run', 'publication', 'click_event',
    'subscriber', 'app_user', 'favorite', 'price_watch', 'buyer_profile'
  ]
  loop
    execute format(
      'alter table garimpa.%I add constraint %I foreign key (tenant_id) references garimpa.affiliate_account (tenant_id) on delete restrict not valid',
      rel, rel || '_tenant_id_fkey'
    );
    execute format(
      'alter table garimpa.%I validate constraint %I',
      rel, rel || '_tenant_id_fkey'
    );
  end loop;
end $$;

-- 3. FKs compostas: relação nunca cruza tenant -----------------------------
-- price_observation -> product
alter table garimpa.price_observation drop constraint if exists price_observation_product_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_observation_product_tenant_fkey' and conrelid = 'garimpa.price_observation'::regclass) then
    alter table garimpa.price_observation
      add constraint price_observation_product_tenant_fkey
      foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete restrict;
  end if;
end $$;

-- price_observation -> capture_run
alter table garimpa.price_observation drop constraint if exists price_observation_capture_run_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_observation_capture_run_tenant_fkey' and conrelid = 'garimpa.price_observation'::regclass) then
    alter table garimpa.price_observation
      add constraint price_observation_capture_run_tenant_fkey
      foreign key (capture_run_id, tenant_id) references garimpa.capture_run (id, tenant_id) on delete restrict;
  end if;
end $$;

-- publication -> product
alter table garimpa.publication drop constraint if exists publication_product_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'publication_product_tenant_fkey' and conrelid = 'garimpa.publication'::regclass) then
    alter table garimpa.publication
      add constraint publication_product_tenant_fkey
      foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete cascade;
  end if;
end $$;

-- click_event -> publication
alter table garimpa.click_event drop constraint if exists click_event_publication_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'click_event_publication_tenant_fkey' and conrelid = 'garimpa.click_event'::regclass) then
    alter table garimpa.click_event
      add constraint click_event_publication_tenant_fkey
      foreign key (publication_id, tenant_id) references garimpa.publication (id, tenant_id) on delete cascade;
  end if;
end $$;

-- favorite -> app_user / product
alter table garimpa.favorite drop constraint if exists favorite_user_id_fkey;
alter table garimpa.favorite drop constraint if exists favorite_product_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'favorite_user_tenant_fkey' and conrelid = 'garimpa.favorite'::regclass) then
    alter table garimpa.favorite
      add constraint favorite_user_tenant_fkey
      foreign key (user_id, tenant_id) references garimpa.app_user (id, tenant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'favorite_product_tenant_fkey' and conrelid = 'garimpa.favorite'::regclass) then
    alter table garimpa.favorite
      add constraint favorite_product_tenant_fkey
      foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete restrict;
  end if;
end $$;

-- price_watch -> app_user / product
alter table garimpa.price_watch drop constraint if exists price_watch_user_id_fkey;
alter table garimpa.price_watch drop constraint if exists price_watch_product_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_watch_user_tenant_fkey' and conrelid = 'garimpa.price_watch'::regclass) then
    alter table garimpa.price_watch
      add constraint price_watch_user_tenant_fkey
      foreign key (user_id, tenant_id) references garimpa.app_user (id, tenant_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_watch_product_tenant_fkey' and conrelid = 'garimpa.price_watch'::regclass) then
    alter table garimpa.price_watch
      add constraint price_watch_product_tenant_fkey
      foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete restrict;
  end if;
end $$;

-- buyer_profile -> app_user
alter table garimpa.buyer_profile drop constraint if exists buyer_profile_user_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'buyer_profile_user_tenant_fkey' and conrelid = 'garimpa.buyer_profile'::regclass) then
    alter table garimpa.buyer_profile
      add constraint buyer_profile_user_tenant_fkey
      foreign key (user_id, tenant_id) references garimpa.app_user (id, tenant_id) on delete cascade;
  end if;
end $$;

-- product -> capture_run (nullable last_capture_run_id)
alter table garimpa.product drop constraint if exists product_last_capture_run_id_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'product_last_capture_run_tenant_fkey' and conrelid = 'garimpa.product'::regclass) then
    alter table garimpa.product
      add constraint product_last_capture_run_tenant_fkey
      foreign key (last_capture_run_id, tenant_id) references garimpa.capture_run (id, tenant_id) on delete restrict;
  end if;
end $$;

-- 4. Índices para os predicados de tenant e colunas de FK ------------------
create index if not exists price_observation_tenant_idx on garimpa.price_observation (tenant_id, product_id, observed_at desc);
create index if not exists publication_tenant_idx on garimpa.publication (tenant_id, product_id);
create index if not exists click_event_tenant_idx on garimpa.click_event (tenant_id, publication_id, clicked_at);
create index if not exists favorite_tenant_user_idx on garimpa.favorite (tenant_id, user_id, created_at desc);
create index if not exists favorite_tenant_product_idx on garimpa.favorite (tenant_id, product_id);
create index if not exists price_watch_tenant_user_idx on garimpa.price_watch (tenant_id, user_id, created_at desc);
create index if not exists price_watch_tenant_product_idx on garimpa.price_watch (tenant_id, product_id);
create index if not exists buyer_profile_tenant_idx on garimpa.buyer_profile (tenant_id, user_id);
