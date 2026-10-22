select jsonb_build_object(
 'baseline',jsonb_build_object('database',current_database(),'version',current_setting('server_version'),
 'm1_identity_present',to_regprocedure('garimpa.resolve_actor_identity(text)') is not null,
 'secret_rls',(select relrowsecurity from pg_class where oid='garimpa.affiliate_secret'::regclass),
 'broad_rls_present',to_regprocedure('garimpa.active_tenant(text)') is not null,
 'orphan_curation_authors',(select count(*) from garimpa.product_curation p left join garimpa.app_user u on u.id=p.reviewed_by_app_user_id where p.reviewed_by_app_user_id is not null and u.id is null),
 'orphan_selection_authors',(select count(*) from garimpa.editorial_selection s left join garimpa.app_user u on u.id=s.actor_app_user_id where u.id is null),
 'products',(select count(*) from garimpa.product),
 'observations',(select count(*) from garimpa.price_observation),
 'publications',(select count(*) from garimpa.publication),
 'clicks',(select count(*) from garimpa.click_event),
 'short_links',(select count(*) from garimpa.short_link),
 'curations',(select count(*) from garimpa.product_curation),
 'editions',(select count(*) from garimpa.editorial_selection)),
 'policies',(select jsonb_agg(to_jsonb(x) order by x.tablename,x.policyname) from
  (select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='garimpa') x),
 'author_constraints',(select jsonb_agg(to_jsonb(x) order by x.conname) from
  (select c.conname,c.convalidated,pg_get_constraintdef(c.oid) as definition from pg_constraint c
    where c.conrelid in ('garimpa.product_curation'::regclass,'garimpa.editorial_selection'::regclass) and c.contype='f') x),
 'grants',(select jsonb_agg(to_jsonb(x) order by x.table_name,x.grantee,x.privilege_type) from
  (select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='garimpa') x)
) as verification;
