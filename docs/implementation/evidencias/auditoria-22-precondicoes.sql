-- Auditoria 22. SOMENTE LEITURA. O projeto deve ser confirmado fora deste SQL:
-- https://spbuwcwmxlycchuwhfir.supabase.co. Não é autorização de aplicação.
-- P0: no alvo atual, esperado M1 e complemento presentes; M2..M12 ausentes.
select version(),current_database(),current_user;
select version,name from supabase_migrations.schema_migrations
 where name like 'garimpa_%' order by version;
select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles
 where rolname in ('garimpa_app','garimpa_public_runtime');
select 'product' relation,count(*) from garimpa.product
 union all select 'price_observation',count(*) from garimpa.price_observation
 union all select 'publication',count(*) from garimpa.publication
 union all select 'short_link',count(*) from garimpa.short_link
 union all select 'click_event',count(*) from garimpa.click_event
 union all select 'affiliate_secret',count(*) from garimpa.affiliate_secret;
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
 from pg_policies where schemaname='garimpa' order by tablename,policyname;
select name,to_regprocedure(name) is not null present from (values
 ('garimpa.resolve_actor_identity(text)'),('garimpa.resolve_actor_accounts(text)'),
 ('garimpa.authenticate_extension_device(text)'),('garimpa.active_tenant(text)'),
 ('garimpa.public_deal_detail(text)'),('garimpa.public_catalog(text,jsonb)'),
 ('garimpa.public_monetized_target(text)'),('garimpa.record_public_click(text,text,text,text,text)')
) q(name);
select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='garimpa' and c.relkind='r' order by c.relname;
select conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid)
 from pg_constraint where connamespace='garimpa'::regnamespace order by conrelid::regclass::text,conname;
select count(*) mismatched_publications from garimpa.publication p
 join garimpa.affiliate_account a on a.id=p.affiliate_id
 join garimpa.product pr on pr.id=p.product_id
 where p.tenant_id is distinct from a.tenant_id or p.tenant_id is distinct from pr.tenant_id;
select count(*) orphan_curation_authors from garimpa.product_curation c
 left join garimpa.app_user u on u.id=c.reviewed_by_app_user_id
 where c.reviewed_by_app_user_id is not null and u.id is null;
select count(*) from information_schema.role_table_grants
 where table_schema='garimpa' and grantee in ('anon','authenticated');
select id,public from storage.buckets where id='bizuminer-private';

-- P1: execute estas consultas APENAS após existirem os objetos das antecessoras
-- no staging identificado; não tentar usar erro por relação ausente como aceite.
-- M3: seed draft, E3 desativado; configuração continua sem aprovação inventada.
select tenant_id,version,status,config->>'e3Enabled' e3,approved_at is not null approved
 from garimpa.price_evidence_policy_version order by tenant_id,version;
select attnum,attname,format_type(atttypid,atttypmod) type from pg_attribute
 where attrelid='garimpa.curation_queue_facts'::regclass and attnum>0 and not attisdropped order by attnum;
-- M4/M5: autoria, referência de avaliação e política sempre no produto/tenant certo.
select count(*) invalid_comparisons from garimpa.comparison_review c
 join garimpa.analysis_assessment a on a.id=c.analysis_assessment_id
 left join garimpa.editorial_assessment e on e.id::text=c.editorial_assessment_id
 where a.tenant_id<>c.tenant_id or a.product_id<>c.product_id
 or (c.editorial_assessment_id is not null and (e.id is null or e.tenant_id<>c.tenant_id or e.product_id<>c.product_id));
select count(*) invalid_opportunities from garimpa.opportunity o
 join garimpa.audience_policy_version p on p.id=o.policy_version_id
 where o.tenant_id<>p.tenant_id;
-- M6/M8: não executar funções públicas com efeito de escrita durante preflight.
select count(*) invalid_campaign_links from garimpa.campaign_link l
 join garimpa.campaign_publication p on p.id=l.publication_id
 where l.tenant_id<>p.tenant_id or length(l.code)<>12;
select p.proname,p.prosecdef,p.proconfig,p.proacl,
 has_function_privilege('anon',p.oid,'execute') anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='garimpa' order by p.proname;
-- M7: preservar os vínculos de origem e predecessors.
select count(*) invalid_commissions from garimpa.commission_entry c
 left join garimpa.conversion v on v.id=c.conversion_id
 left join garimpa.commission_entry p on p.id=c.predecessor_id
 where (v.id is not null and v.tenant_id<>c.tenant_id) or (p.id is not null and p.tenant_id<>c.tenant_id);
-- M9: a expansão M12 permite históricos não atribuídos, mas deve identificar quantidade.
select count(*) unassigned_evaluations from garimpa.experiment_evaluation e
 left join garimpa.experiment_assignment a on a.tenant_id=e.tenant_id and a.experiment_id=e.experiment_id and a.unit_id=e.unit_id
 where a.id is null;
-- M10: deve resultar zero e haver FK COMPOSTA job_id,tenant_id, não apenas duas FKs independentes.
select count(*) cross_tenant_attempts from garimpa.dispatch_attempt a
 join garimpa.dispatch_job j on j.id=a.job_id where a.tenant_id<>j.tenant_id;
select conname,pg_get_constraintdef(oid) from pg_constraint
 where conrelid='garimpa.dispatch_attempt'::regclass and contype='f';
-- M11: zero não substitui a FK composta nem o teste negativo de INSERT.
select 'invitation' kind,count(*) bad from garimpa.account_invitation i
 join garimpa.affiliate_account a on a.id=i.affiliate_id where a.tenant_id<>i.tenant_id
 union all select 'entitlement',count(*) from garimpa.account_entitlement i join garimpa.affiliate_account a on a.id=i.affiliate_id where a.tenant_id<>i.tenant_id
 union all select 'progress',count(*) from garimpa.onboarding_progress i join garimpa.affiliate_account a on a.id=i.affiliate_id where a.tenant_id<>i.tenant_id
 union all select 'lifecycle',count(*) from garimpa.account_lifecycle_event i join garimpa.affiliate_account a on a.id=i.affiliate_id where a.tenant_id<>i.tenant_id;
-- M12: E3 só por calibração não sintética compatível. A ausência de approved é saudável.
select tenant_id,version,status,config->>'e3Enabled' effective_e3 from garimpa.effective_price_evidence_policy;
select tenant_id,kill_switch from garimpa.dispatch_control;
select conrelid::regclass,conname,convalidated from pg_constraint
 where connamespace='garimpa'::regnamespace and not convalidated;
select id,public from storage.buckets where id='bizuminer-private';

-- P2: conexão real garimpa_app, nunca postgres; somente após instalação em staging.
-- BEGIN READ ONLY;
-- SELECT current_user,row_security_active('garimpa.product'::regclass);
-- SELECT count(*) FROM garimpa.product; -- 0 sem contexto depois da M2
-- SELECT set_config('garimpa.tenant_id','TENANT_SINTETICO_A',true);
-- SELECT set_config('garimpa.actor_app_user_id','USUARIO_SINTETICO_A',true);
-- SELECT set_config('garimpa.membership_role','owner',true);
-- SELECT count(*) FROM garimpa.product; -- somente dados A conhecidos da fixture
-- ROLLBACK;
-- Repetir A/B/A em duas conexões independentes e após rollback; nenhum GUC pode vazar.
-- Os testes negativos DML pertencem EXCLUSIVAMENTE ao staging sintético autorizado.
