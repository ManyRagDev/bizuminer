from pathlib import Path
import subprocess,json,hashlib,datetime
R=Path('/opt/platform-staging/runtime');p=R/'releases/operation-20261117T030142Z'
def cmd(a):return subprocess.run(a,check=True,capture_output=True,text=True).stdout
before=json.loads((p/'before.json').read_text());deploy=json.loads((p/'deployment.json').read_text())
def inspect(n):return json.loads(cmd(['docker','inspect',n]))[0]
names=cmd(['docker','ps','--format','{{.Names}}']).splitlines();services={}
for s,image in deploy['newImages'].items():
 c=inspect('platform-app-trial-'+s+'-1');assert c['Image']==image
 services[s]={'image':c['Image'],'state':c['State']['Status'],'health':c['State']['Health']['Status']}
 assert services[s]['state']=='running' and services[s]['health']=='healthy'
others={n:inspect(n)['Id'] for n in names if n not in ['platform-app-trial-'+s+'-1' for s in services]};assert others==before['otherContainers']
config=dict(l.split('=',1) for l in (R/'.env').read_text().splitlines() if l and not l.startswith('#') and '=' in l)
assert config['GARIMPA_CONTEXTS_DIR']==deploy['context']
assert (R/'.env').read_text().replace('GARIMPA_CONTEXTS_DIR='+deploy['context'],'GARIMPA_CONTEXTS_DIR='+before['context'])==(p/'runtime-before.env').read_text()
for name,digest in before['environmentFileHashes'].items():assert hashlib.sha256((Path(config['RUNTIME_ENV_DIR'])/name).read_bytes()).hexdigest()==digest
q="""begin read only;select json_build_object(
 'schemaObjects',json_build_object('history',exists(select 1 from pg_policies where schemaname='garimpa' and tablename='extension_capture_receipt' and policyname='extension_capture_receipt_history_read'),'reader',to_regclass('garimpa.curation_operation_job') is not null,'diagnostic',exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_attribute_job' and column_name='diagnostic'),'configuredLimit',exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_external_budget' and column_name='configured_limit')),
 'uncertain',(select count(*) from garimpa.curation_attribute_job where status='reconciliation'),
 'cloneRemaining',exists(select 1 from pg_database where datname='garimpa_ops_verify_20261117_030142'),
 'viewOwner',(select pg_get_userbyid(relowner) from pg_class where oid='garimpa.curation_operation_job'::regclass),
 'securityBarrier',(select reloptions from pg_class where oid='garimpa.curation_operation_job'::regclass),
 'applicationRoleRestricted',(select not rolsuper and not rolbypassrls from pg_roles where rolname='bizuminer_web'));
rollback;"""
r=subprocess.run(['docker','exec','-i','platform-staging-db','psql','-X','-At','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=q,check=True,capture_output=True,text=True);db=json.loads(r.stdout.splitlines()[1]);assert all(db['schemaObjects'].values()) and not db['cloneRemaining'] and db['applicationRoleRestricted'];assert db['viewOwner']=='supabase_admin' and 'security_barrier=true' in db['securityBarrier']
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':services,'environmentPreserved':True,'otherServicesUnchanged':True,'otherContainerCount':len(others),'database':db,'context':deploy['context'],'sourcePackageSha256':deploy['sourcePackageSha256']}
(p/'final-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
