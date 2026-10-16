"""Build reviewed replacement artifacts locally; never connects to a database.
CLI-generated filenames are preserved. Original SQL remains historical evidence.
Run --seal after recording the expansion catalogue in the disposable fixture.
"""
from pathlib import Path
import json, hashlib, re, sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'packages/persistence/supabase/rollouts/v2'
ORIGINAL=ROOT/'packages/persistence/supabase/migrations'
EVIDENCE=ROOT/'docs/implementation/evidencias'
q=lambda s: "'"+s.replace("'","''")+"'"
ident=lambda s: '"'+s.replace('"','""')+'"'
js=lambda x: json.dumps(x,separators=(',',':'),ensure_ascii=False)
sha=lambda x: hashlib.sha256(x).hexdigest()
base=json.loads((EVIDENCE/'mcp-26-r26baseline.json').read_text())
full=json.loads((EVIDENCE/'rollout-27-inventory.json').read_text())
base_tables=base['tables']; all_tables=[r['tablename'] for r in full['tables']]
new_tables=sorted(set(all_tables)-set(base_tables))
legacy=[p for p in base['policies'] if p['tablename']!='affiliate_secret']
assert len(legacy)==28
names={}
for phase in ['foundation','expansion','scoped_cutover']:
 files=list(OUT.glob('*_garimpa_v2_'+phase+'.sql'))
 if not files:
  source=list(Path('/tmp/bizuminer-rollout27/supabase/migrations').glob('*_garimpa_v2_'+phase+'.sql'))
  assert len(source)==1,'Generate filename with Supabase CLI first'
  target=OUT/source[0].name;target.write_bytes(source[0].read_bytes());files=[target]
 assert len(files)==1
 names[phase]=files[0]

def table_guard(tables):
 return """do $guard$ begin
 if (select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_tables where schemaname='garimpa') <> %s::jsonb then raise exception 'rollout_table_inventory_mismatch'; end if;
 end $guard$;
""" % q(js(sorted(tables)))

def policy_guard(policies):
 # Column selection is deliberate: no role/name/suffix heuristics are used.
 items=[{k:p[k] for k in ('tablename','policyname','permissive','roles','cmd','qual','with_check')} for p in policies]
 items.sort(key=lambda p:(p['tablename'],p['policyname']))
 return """do $guard$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('tablename',tablename,'policyname',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname),'[]'::jsonb) from pg_policies where schemaname='garimpa') <> %s::jsonb then raise exception 'rollout_policy_inventory_mismatch'; end if;
 end $guard$;
"""%q(js(items))

header="""-- Replacement BizuMiner V2 rollout. Execute only the explicit manifest, one transaction per unit.
-- Supersedes pending original2--12 for this baseline; never reapply already-installed originals.
-- Candidate for isolated verification, NOT a production approval. Preserve history and data on recovery.
set local search_path=pg_catalog;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
"""
default_acl_guard="""do $guard$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('schema',case when d.defaclnamespace=0 then '<global>' else n.nspname end,'object_type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclnamespace,d.defaclobjtype),'[]'::jsonb) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole=(select oid from pg_roles where rolname=current_user) and (d.defaclnamespace=0 or n.nspname='garimpa')) <> '[{"schema":"garimpa","object_type":"r","acl":"{garimpa_app=arwd/postgres}"}]'::jsonb then raise exception 'rollout_default_privilege_inventory_mismatch'; end if;
end $guard$;
"""
foundation=header+table_guard(base_tables)+policy_guard(base['policies'])+default_acl_guard+"""
do $guard$ begin
 if to_regprocedure('garimpa.resolve_actor_identity(text)') is null or
    (select count(*) from pg_constraint where connamespace='garimpa'::regnamespace and conname in
      ('product_curation_reviewer_user_fkey','editorial_selection_actor_user_fkey') and convalidated)<>2 then
  raise exception 'rollout_installed_subset_required'; end if;
 if exists(select 1 from pg_roles where rolname='garimpa_public_runtime') or to_regprocedure('garimpa.active_tenant(text)') is not null then
  raise exception 'rollout_foundation_already_exists_or_drift'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_app' and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_runtime_role'; end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='garimpa_app') then raise exception 'unexpected_initial_runtime_membership'; end if;
end $guard$;
create role garimpa_public_runtime nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant garimpa_public_runtime to garimpa_app;
grant usage on schema garimpa to garimpa_public_runtime;
-- No grant on any existing private table.
create function garimpa.active_tenant(p_tenant text)
returns boolean language sql stable security definer set search_path=pg_catalog,garimpa
as $$ select exists(select 1 from garimpa.affiliate_account where tenant_id=p_tenant and status='active'); $$;
revoke all on function garimpa.active_tenant(text) from public,anon,authenticated;
grant execute on function garimpa.active_tenant(text) to garimpa_app;
create function garimpa.prevent_tenant_mutation()
returns trigger language plpgsql set search_path=pg_catalog,garimpa as $$ begin
 if new.tenant_id is distinct from old.tenant_id then raise exception 'tenant_immutable'; end if;
 return new;
end $$;
revoke all on function garimpa.prevent_tenant_mutation() from public,anon,authenticated;
create table garimpa.rollout_control (
 id text primary key check(id='bizuminer-v2'), enabled boolean not null default false
);
insert into garimpa.rollout_control(id) values('bizuminer-v2');
revoke all on garimpa.rollout_control from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select on garimpa.rollout_control to garimpa_app;
alter table garimpa.rollout_control enable row level security;
create policy rollout_status_read on garimpa.rollout_control for select to garimpa_app using(id='bizuminer-v2');
create function garimpa.commercial_rollout_ready()
returns boolean language sql stable security invoker set search_path=pg_catalog,garimpa
as $$ select coalesce((select enabled from garimpa.rollout_control where id='bizuminer-v2'),false); $$;
revoke all on function garimpa.commercial_rollout_ready() from public,anon,authenticated;
grant execute on function garimpa.commercial_rollout_ready() to garimpa_app;
"""
names['foundation'].write_text(foundation)
# A adds only one table and one SELECT policy. Existing consumers stay untouched.
status_policy={'tablename':'rollout_control','policyname':'rollout_status_read','permissive':'PERMISSIVE','roles':['garimpa_app'],'cmd':'SELECT','qual':"(id = 'bizuminer-v2'::text)",'with_check':None}
expansion=header+table_guard(base_tables+['rollout_control'])+policy_guard(base['policies']+[status_policy])+"""
do $guard$ begin
 if (select count(*) from garimpa.rollout_control where id='bizuminer-v2' and not enabled)<>1 or garimpa.commercial_rollout_ready() then raise exception 'rollout_gate_must_be_closed'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_public_runtime' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_public_runtime_role'; end if;
end $guard$;
"""
sources=sorted(p for p in ORIGINAL.glob('202610*.sql') if '20261014102000'<=p.name<='20261015021300z')
assert len(sources)==10
# M11's loops see the tables present after its CREATE TABLEs and before original12.
m11_tenant=sorted(set(r['table_name'] for r in full['beforeM11']) & set(all_tables) | {'account_entitlement','account_invitation','onboarding_progress','usage_event','account_lifecycle_event'})
for path in sources:
 content=path.read_text()
 if 'saas_onboarding_entitlements' in path.name:
  pattern1=r"for r in select c\.table_name from information_schema\.columns c join information_schema\.tables t.*?c\.table_name<>'affiliate_account' loop"
  arr=','.join(q(t) for t in m11_tenant if t!='affiliate_account')
  content,n=re.subn(pattern1,"for r in select unnest(array["+arr+"]::text[]) as table_name loop",content,flags=re.S);assert n==1
  pattern2=r"for r in select t\.table_name from information_schema\.tables t.*?c\.column_name='tenant_id'\)\s*loop"
  arr=','.join(q(t) for t in m11_tenant if t not in ('affiliate_account','account_lifecycle_event'))
  content,n=re.subn(pattern2,"for r in select unnest(array["+arr+"]::text[]) as table_name loop",content,flags=re.S);assert n==1
  token="  if p_actor_app_user_id is null or p_auth_user_id is null or p_verified_email is null then"
  assert content.count(token)==1
  content=content.replace(token,"  if not garimpa.commercial_rollout_ready() then raise exception 'commercial_rollout_not_ready'; end if;\n"+token)
 content='\n'.join(line for line in content.splitlines() if 'Proibida aplica' not in line and 'No remote application authorized' not in line)
 expansion+='\n-- Adopted source: '+path.name+' sha256='+sha(path.read_bytes())+'\n'+content+'\n'
expansion+='\n'+(ROOT/'tools/editorial-tests/rollout-monitoring-fragment.sql').read_text()+'\n'
extension_preflight=(ROOT/'tools/editorial-tests/rollout-extension-preflight.sql').read_text()
expansion+='\n'+extension_preflight+'\n'+(ROOT/'tools/editorial-tests/rollout-extension-fragment.sql').read_text()+'\n'
privileges=json.loads((ROOT/'tools/editorial-tests/rollout-privilege-matrix.json').read_text())['tables']
assert sorted(privileges)==new_tables, 'Privilege matrix must cover exactly the new commercial tables'
expansion+='\n-- Normalize ONLY new-table privileges: production defaults grant unintended UPDATE/DELETE.\n'
for t, grants in sorted(privileges.items()):
 assert grants['table'] in [['SELECT','INSERT'],['SELECT','INSERT','UPDATE']]
 expansion+=f"revoke all on garimpa.{ident(t)} from public,anon,authenticated,garimpa_app,garimpa_public_runtime;\n"
 for column in sorted(grants['columns']):
  assert grants['columns'][column]==['UPDATE']
  expansion+=f"revoke all ({ident(column)}) on garimpa.{ident(t)} from public,anon,authenticated,garimpa_app,garimpa_public_runtime;\n"
 expansion+=f"grant {','.join(grants['table']).lower()} on garimpa.{ident(t)} to garimpa_app;\n"
 for column, allowed in sorted(grants['columns'].items()):
  expansion+=f"grant update ({ident(column)}) on garimpa.{ident(t)} to garimpa_app;\n"
expansion+="revoke all on garimpa.effective_price_evidence_policy from public,anon,authenticated,garimpa_app,garimpa_public_runtime;\ngrant select on garimpa.effective_price_evidence_policy to garimpa_app;\n"
expansion+='\n-- All new commercial relations remain inaccessible to runtime until the explicit final cutover.\n'
for t in new_tables:
 expansion+=f"create policy rollout_pending on garimpa.{ident(t)} as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());\n"
expansion+="revoke all on function garimpa.accept_account_invitation(text,text,text,text) from public,anon,authenticated,garimpa_app;\n"
expansion+=table_guard(all_tables+['rollout_control'])
names['expansion'].write_text(expansion)
# C is sealed against the actual catalogue generated by A/B on PostgreSQL17.6.
if '--seal' in sys.argv:
 stage=json.loads((EVIDENCE/'rollout-31-expansion-catalog.json').read_text())
 assert stage['engine']=='postgres (PostgreSQL) 17.6'
 assert stage['inputs']==[{'file':names[x].name,'sha256':sha(names[x].read_bytes())} for x in ['foundation','expansion']], 'Recapture expansion catalogue after any SQL change'
 cutover='-- Expansion catalogue sha256: '+sha((EVIDENCE/'rollout-31-expansion-catalog.json').read_bytes())+'\n'+header+table_guard(all_tables+['rollout_control'])+policy_guard(stage['policies'])+default_acl_guard
 cutover+="""do $guard$ begin
 if (select count(*) from garimpa.rollout_control where id='bizuminer-v2' and not enabled)<>1 or garimpa.commercial_rollout_ready() then raise exception 'rollout_gate_must_be_closed'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_public_runtime' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_public_runtime_role'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_app' and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_runtime_role'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and c.relkind in ('r','p','v','m','f') and (has_table_privilege('garimpa_public_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('garimpa_public_runtime',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) then raise exception 'public_runtime_private_privilege'; end if;
 if has_table_privilege('garimpa_app','garimpa.rollout_control','INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege('garimpa_app','garimpa.rollout_control','INSERT,UPDATE') then raise exception 'runtime_can_enable_rollout'; end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='garimpa_public_runtime') then raise exception 'unexpected_public_runtime_membership'; end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member join pg_roles parent on parent.oid=m.roleid where r.rolname='garimpa_app' and (parent.rolname<>'garimpa_public_runtime' or m.admin_option)) then raise exception 'unexpected_runtime_role_membership'; end if;
 if has_schema_privilege('garimpa_app','garimpa','CREATE') then raise exception 'runtime_can_create_schema_objects'; end if;
 if not pg_has_role('garimpa_app','garimpa_public_runtime','MEMBER') then raise exception 'missing_public_role_membership'; end if;
 if not pg_has_role('garimpa_app','garimpa_public_runtime','SET') then raise exception 'missing_public_role_set'; end if;
 if not has_schema_privilege('garimpa_public_runtime','garimpa','USAGE') then raise exception 'missing_public_schema_usage'; end if;
end $guard$;
"""
 # Exact signatures prevent unexpected overloads; include the verified legacy seed function.
 expected_signatures=sorted(f['signature'] for f in stage['functions'])
 cutover+="do $guard$ begin if (select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text COLLATE \"C\"),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='garimpa')<>"+q(js(expected_signatures))+"::jsonb then raise exception 'rollout_function_inventory_mismatch'; end if; end $guard$;\n"
 # Complete definitions include strictness, language, volatility, defaults and return type.

 for f in stage['functions']:
  cutover+="do $guard$ begin if not exists(select 1 from pg_proc where oid=to_regprocedure("+q(f['signature'])+") and pg_get_functiondef(oid)="+q(f['definition'])+" and prosrc="+q(f['prosrc'])+" and prosecdef="+str(f['prosecdef']).lower()+" and proconfig::text is not distinct from "+(q(f['config']) if f['config'] is not None else 'null')+" and proacl::text is not distinct from "+(q(f['acl']) if f['acl'] is not None else 'null')+" and proowner=(select oid from pg_roles where rolname=current_user)) then raise exception 'rollout_function_mismatch: %',"+q(f['signature'])+"; end if; end $guard$;\n"
 assert len(stage['views'])==2
 for v in stage['views']:
  cutover+="do $guard$ begin if not exists(select 1 from pg_class c where c.oid=to_regclass("+q('garimpa.'+v['name'])+") and c.relkind='v' and pg_get_viewdef(c.oid,true)="+q(v['definition'])+" and c.reloptions::text is not distinct from "+(q(v['options']) if v['options'] is not None else 'null')+" and c.relacl::text is not distinct from "+(q(v['acl']) if v['acl'] is not None else 'null')+" and c.relowner=(select oid from pg_roles where rolname=current_user)) then raise exception 'rollout_view_mismatch: %',"+q(v['name'])+"; end if; end $guard$;\n"
 for t in stage['tables']:
  cutover+="do $guard$ begin if not exists(select 1 from pg_class where oid=to_regclass("+q('garimpa.'+t['name'])+") and relrowsecurity="+str(t['rls']).lower()+" and relforcerowsecurity="+str(t['force_rls']).lower()+" and relowner=(select oid from pg_roles where rolname=current_user) and relacl::text is not distinct from "+(q(t['acl']) if t['acl'] is not None else 'null')+") then raise exception 'rollout_table_security_mismatch: %',"+q(t['name'])+"; end if; end $guard$;\n"
 column_query="select coalesce(jsonb_agg(jsonb_build_object('table_name',c.relname,'column_name',a.attname,'acl',a.attacl::text) order by c.relname,a.attname),'[]'::jsonb) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and a.attnum>0 and not a.attisdropped and cardinality(a.attacl)>0"
 cutover+="do $guard$ begin if ("+column_query+")<>"+q(js(stage['columnAcls']))+"::jsonb then raise exception 'rollout_column_privilege_inventory_mismatch'; end if; end $guard$;\n"
 for k in stage['constraints']:
  cutover+="do $guard$ begin if not exists(select 1 from pg_constraint where conrelid=to_regclass("+q('garimpa.'+k['table_name'])+") and conname="+q(k['name'])+" and pg_get_constraintdef(oid)="+q(k['definition'])+" and convalidated="+str(k['validated']).lower()+") then raise exception 'rollout_constraint_mismatch: %',"+q(k['name'])+"; end if; end $guard$;\n"
 for t in stage['triggers']:
  cutover+="do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid=to_regclass("+q('garimpa.'+t['table_name'])+") and tgname="+q(t['name'])+" and pg_get_triggerdef(oid)="+q(t['definition'])+" and tgenabled="+q(t['enabled'])+") then raise exception 'rollout_trigger_mismatch: %',"+q(t['name'])+"; end if; end $guard$;\n"
 fk_query="select coalesce(jsonb_agg(jsonb_build_object('table_name',c.relname,'name',k.conname,'target',nt.nspname||'.'||ct.relname,'source_columns',array_to_string(array(select a.attname from unnest(k.conkey) with ordinality x(num,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.num order by x.ord),','),'target_columns',array_to_string(array(select a.attname from unnest(k.confkey) with ordinality x(num,ord) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=x.num order by x.ord),','),'validated',k.convalidated) order by c.relname,k.conname),'[]'::jsonb) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class ct on ct.oid=k.confrelid join pg_namespace nt on nt.oid=ct.relnamespace where n.nspname='garimpa' and k.contype='f'"
 cutover+="do $guard$ begin if ("+fk_query+")<>"+q(js(stage['foreignKeys']))+"::jsonb then raise exception 'rollout_foreign_key_inventory_mismatch'; end if; end $guard$;\n"
 cutover+='\n'+extension_preflight+'\n'
 # Every predicate is scoped to an explicit legacy table. Never discover policies to delete.
 for p in legacy:
  cutover+=f"drop policy {ident(p['policyname'])} on garimpa.{ident(p['tablename'])};\n"
 children=['affiliate_membership','affiliate_marketplace_config','affiliate_monitoring_policy','affiliate_monitoring_policy_event','affiliate_monitoring_skip','extension_device']
 for t in sorted(set(p['tablename'] for p in legacy)-set(children)-{'app_user_role'}):
  pred="tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)"
  if t=='app_user':pred+=" and id=nullif(current_setting('garimpa.actor_app_user_id',true),'')"
  if t in ['favorite','price_watch','buyer_profile']:pred+=" and user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')"
  cutover+=f"create policy {ident(t+'_tenant_scope')} on garimpa.{ident(t)} for all to garimpa_app using({pred}) with check({pred});\n"
  # M11 already protects all other tenant tables; affiliate_account was deliberately excluded there.
  if t=='affiliate_account':cutover+="create trigger trg_prevent_tenant_mutation before update on garimpa.affiliate_account for each row execute function garimpa.prevent_tenant_mutation();\n"
 for t in children:
  pred="exists(select 1 from garimpa.affiliate_account a where a.id=affiliate_id and a.tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))"
  cutover+=f"create policy {ident(t+'_read')} on garimpa.{ident(t)} for select to garimpa_app using({pred});\n"
  pred+=" and current_setting('garimpa.membership_role',true)='owner'"
  cutover+=f"create policy {ident(t+'_manage')} on garimpa.{ident(t)} for all to garimpa_app using({pred}) with check({pred});\n"
 cutover+="create policy app_user_role_runtime_read on garimpa.app_user_role for select to garimpa_app using(app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),''));\n"
 cutover+="grant execute on function garimpa.accept_account_invitation(text,text,text,text) to garimpa_app;\n"
 cutover+="""do $state$ declare affected integer; begin
 update garimpa.rollout_control set enabled=true where id='bizuminer-v2' and not enabled;
 get diagnostics affected=row_count;
 if affected<>1 or not garimpa.commercial_rollout_ready() then raise exception 'rollout_activation_failed'; end if;
end $state$;
"""
 names['scoped_cutover'].write_text(cutover)
compatibility_extra=['.github/workflows/capture-offers.yml', '.github/workflows/monitor-prices.yml', 'packages/persistence/bin/backfill-family.ts', 'packages/persistence/bin/bootstrap-affiliate-house.ts', 'packages/persistence/bin/cleanup-lifecycle.ts', 'packages/persistence/bin/curate-initial-catalog.ts', 'packages/persistence/bin/purge-catalog.ts', 'packages/persistence/bin/seed-house-marketplace-config.ts', 'packages/persistence/bin/verify-tenant-isolation.ts', 'packages/persistence/src/catalog-maintenance.ts', 'packages/persistence/src/house-maintenance.ts', 'packages/persistence/src/ingest.ts', 'packages/persistence/src/maintenance-cli.ts', 'packages/persistence/src/store.ts', 'packages/web/app/api/admin/captura/route.ts', 'packages/web/app/api/admin/extension/devices/route.ts', 'packages/web/app/api/admin/rodagem/lote/route.ts', 'packages/web/app/api/admin/rodagem/navegador/route.ts', 'packages/web/app/api/extension/capture-batches/route.ts', 'packages/web/app/api/extension/pairing-codes/route.ts', 'packages/web/bin/reconcile-capture-batches.ts', 'packages/web/bin/run-capture-batch.ts', 'packages/web/bin/run-dispatch.mts', 'packages/web/bin/run-triage.ts', 'packages/web/lib/account-context.ts', 'packages/web/lib/account-scope.ts', 'packages/web/lib/browser-capture-db.ts', 'packages/web/lib/capture-batch-db.ts', 'packages/web/lib/capture-batch-worker.ts', 'packages/web/lib/capture-dispatch.ts', 'packages/web/lib/capture-process.ts', 'packages/web/lib/commercial-financial-db.ts', 'packages/web/lib/commercial-rollout.ts', 'packages/web/lib/commercial-workflow.ts', 'packages/web/lib/dispatch-worker.ts', 'packages/web/lib/experiment-db.ts', 'packages/web/lib/extension-admin.ts', 'packages/web/lib/extension-db.ts', 'packages/web/lib/github-monitoring.ts', 'packages/web/lib/governance-db.ts', 'packages/web/lib/kit-artifact-db.ts', 'packages/web/lib/manual-capture.ts', 'packages/web/lib/owner-account-db.ts', 'packages/web/lib/private-artifact-db.ts', 'packages/web/lib/public-offer-db.ts', 'packages/web/lib/rubric-db.ts', 'packages/web/lib/saas-onboarding-db.ts', 'packages/web/lib/tenant-db.ts', 'packages/web/lib/workflow-readiness.ts']
manifest={'version':1,'sealed':('--seal' in sys.argv),'catalogueSha256':sha((EVIDENCE/'rollout-31-expansion-catalog.json').read_bytes()) if '--seal' in sys.argv else None,'productionApproved':False,'environmentPrerequisite':'isolated rehearsal and independent approval of exact SQL/code; compatible deployment and writers before C',
 'installedSubset':[{'file':f,'sha256':sha((ORIGINAL/f).read_bytes())} for f in ['20261014100000_garimpa_account_context_and_membership.sql','20261015035001_garimpa_affiliate_secret_bootstrap_rls.sql','20261015040727_garimpa_curation_membership_author.sql']],
 'compatibilitySources':[{'path':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes())} for p in [ROOT/'tools/editorial-tests/rollout-privilege-matrix.json',ROOT/'tools/editorial-tests/rollout-monitoring-fragment.sql',ROOT/'tools/editorial-tests/rollout-extension-fragment.sql',ROOT/'tools/editorial-tests/rollout-extension-preflight.sql',ROOT/'packages/persistence/src/monitoring-db.ts',ROOT/'packages/persistence/src/monitoring-candidates.ts',ROOT/'packages/persistence/src/monitoring-schedule.ts',ROOT/'packages/persistence/bin/monitor-prices.ts',ROOT/'packages/persistence/bin/monitoring-plan.ts',ROOT/'packages/persistence/src/pg-store.ts']+[ROOT/p for p in compatibility_extra]],
 'supersedes':[{'file':p.name,'sha256':sha(p.read_bytes())} for p in [ORIGINAL/'20261014101000_garimpa_tenant_rls_scoped.sql']+sources],
 'legacyPoliciesReplaced':legacy,'newCommercialTables':new_tables,'m11TenantTables':m11_tenant,
 'units':[{'phase':phase,'file':path.name,'sha256':sha(path.read_bytes()),'lockTimeout':'5s','statementTimeout':'45s','manualTransactionSha256':sha(('BEGIN;\n'+path.read_text()+'\nCOMMIT;\n').encode()),'transactionRequired':True,'dependsOn':(['installedSubset'] if i==0 else [list(names)[i-1]])} for i,(phase,path) in enumerate(names.items())]}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':[p.name for p in names.values()],'newTables':len(new_tables),'legacyPolicies':len(legacy),'sealed':'--seal' in sys.argv}))
