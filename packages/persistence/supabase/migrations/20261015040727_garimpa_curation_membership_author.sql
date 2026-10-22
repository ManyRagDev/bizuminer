-- Supplemental repair: M1 has already been applied, so preserve its history.
-- A reviewer is a global person; account authorization stays in the checked
-- account transaction. The product/tenant FK and RLS remain unchanged.
do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid='garimpa.product_curation'::regclass
      and conname='product_curation_reviewer_user_fkey') then
    alter table garimpa.product_curation
      add constraint product_curation_reviewer_user_fkey
      foreign key (reviewed_by_app_user_id) references garimpa.app_user(id)
      on delete restrict not valid;
  end if;
end $$;
alter table garimpa.product_curation
  validate constraint product_curation_reviewer_user_fkey;
alter table garimpa.product_curation
  drop constraint if exists product_curation_reviewer_tenant_fkey;

-- The edition is also authored by a global person. Its items retain their
-- composite selection/product/assessment tenant keys without alteration.
do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid='garimpa.editorial_selection'::regclass
      and conname='editorial_selection_actor_user_fkey') then
    alter table garimpa.editorial_selection
      add constraint editorial_selection_actor_user_fkey
      foreign key (actor_app_user_id) references garimpa.app_user(id)
      on delete restrict not valid;
  end if;
end $$;
alter table garimpa.editorial_selection
  validate constraint editorial_selection_actor_user_fkey;
alter table garimpa.editorial_selection
  drop constraint if exists editorial_selection_actor_app_user_id_tenant_id_fkey;
