"""Run only on the authorized VPS. Preserve configuration, data and unrelated services."""
from pathlib import Path
import os,sys,json,subprocess,hashlib,fcntl,tempfile,datetime,urllib.parse,re,tarfile
os.umask(0o077)
R=Path('/opt/platform-staging/runtime');release=Path(__file__).resolve().parent
meta=json.loads((release/'release.json').read_text());context=R/meta['context'];database='garimpa_ops_verify_'+meta['release'].removeprefix('operation-').replace('T','_').replace('Z','')
assert re.fullmatch(r'garimpa_ops_verify_[0-9]{8}_[0-9]{6}',database)
assert re.fullmatch(r'contexts-operation-[0-9]{8}T[0-9]{6}Z',meta['context'])
SERVICES={'garimpa-web':'garimpa-web-trial:local','garimpa-capture-executor':'garimpa-capture-executor-trial:local'}
PREFIX='platform-app-trial-';DB='platform-staging-db';runtime=R/'.env'
lock=open('/opt/platform-staging/.runtime-maintenance.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
steps=[];switched=False;stopped=False;db_created=False;old={};candidates={};config_original=runtime.read_bytes();images_before={};envfiles={}
def note(stage,**values):
 item={'stage':stage,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),**values};steps.append(item);(release/'progress.json').write_text(json.dumps(steps,indent=2)+'\n');print(json.dumps(item),flush=True)
def run(args,**kw):
 p=subprocess.run(args,capture_output=True,**kw)
 if p.returncode:
  raw=p.stderr or p.stdout or b'';raw=raw.encode() if isinstance(raw,str) else raw;(release/'last-command-error.log').write_bytes(raw)
  raise RuntimeError('command failed; private details retained: '+str(args[0]))
 return p.stdout

def inspect(name):return json.loads(run(['docker','inspect',name],text=True))[0]
def others():return {x:inspect(x)['Id'] for x in run(['docker','ps','--format','{{.Names}}'],text=True).splitlines() if x not in [PREFIX+s+'-1' for s in SERVICES]}
def sql(q,db='postgres'):
 return run(['docker','exec','-i',DB,'psql','-X','-At','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],input=q,text=True).strip()
def read_env(p):return dict(l.split('=',1) for l in p.read_text().splitlines() if l and not l.startswith('#') and '=' in l)
def atomic(path,data):
 fd,name=tempfile.mkstemp(prefix='.operation-env-',dir=path.parent);os.fchmod(fd,0o600)
 with os.fdopen(fd,'wb') as out:out.write(data);out.flush();os.fsync(out.fileno())
 os.replace(name,path)
def set_context(expected,new):
 data=runtime.read_bytes().decode();lines=data.splitlines(keepends=True);matches=[l for l in lines if l.startswith('GARIMPA_CONTEXTS_DIR=')];assert len(matches)==1 and matches[0].strip().split('=',1)[1]==expected,'context changed concurrently'
 updated=''.join('GARIMPA_CONTEXTS_DIR='+new+'\n' if l.startswith('GARIMPA_CONTEXTS_DIR=') else l for l in lines);atomic(runtime,updated.encode())
def compose(args,log):
 p=subprocess.run(['docker','compose','--profile','garimpa','--profile','garimpa-executor']+args,cwd=R,capture_output=True)
 (release/log).write_bytes(p.stdout+p.stderr)
 if p.returncode:raise RuntimeError('compose failed; private log '+log)
def fingerprints(db='postgres'):
 return json.loads(sql("""begin isolation level repeatable read read only; select json_build_object(
 'observations',(select md5(coalesce(string_agg(id||observed_at::text||price_cents::text||coalesce(offer_evidence::text,''),'|' order by id),'')) from garimpa.price_observation),
 'receipts',(select md5(coalesce(string_agg(device_id||request_id::text||fingerprint||result::text,'|' order by device_id,request_id),'')) from garimpa.extension_capture_receipt),
 'jobs',(select md5(coalesce(string_agg(id::text||status||attempts::text||updated_at::text,'|' order by id),'')) from garimpa.curation_attribute_job),
 'budget',(select md5(coalesce(string_agg(kind||marketplace||local_day::text||consumed::text,'|' order by tenant_id,kind,marketplace,local_day),'')) from garimpa.curation_external_budget),
 'products',(select count(*) from garimpa.product),'prices',(select count(*) from garimpa.price_observation)); rollback;""",db).splitlines()[1])
def applied(db):
 return json.loads(sql("""begin read only; select json_build_object(
 'history',exists(select 1 from pg_policies where schemaname='garimpa' and tablename='extension_capture_receipt' and policyname='extension_capture_receipt_history_read'),
 'identity',to_regprocedure('garimpa.manual_extension_item_request_id(text,uuid,text,text)') is not null,
 'diagnostic',exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_attribute_job' and column_name='diagnostic'),
 'limit',exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_external_budget' and column_name='configured_limit'),
 'reader',to_regclass('garimpa.curation_operation_job') is not null); rollback;""",db).splitlines()[1])
def migrate(db):
 assert not any(applied(db).values()),'schema already changed; reconcile before replay'
 sql((release/'migrations.sql').read_text(),db);assert all(applied(db).values())
def probe(db,operator=False):
 config=read_env(Path(envdir)/'garimpa-web.env');url=urllib.parse.urlsplit(config['DATABASE_URL'].strip().strip('\"\''));user=url.username
 assert user=='bizuminer_web','unexpected runtime role'
 if db!='postgres':sql('grant connect on database '+db+' to '+user+';')
 owner=json.loads(sql("""begin read only; select json_build_object('tenantId',a.tenant_id,'affiliateId',a.id,'actor','human','actorAppUserId',u.id,'authenticatedAuthUserId',u.auth_user_id,'membershipRole',m.role,'requestId','deployment-readonly') from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id join garimpa.app_user u on u.id=m.app_user_id where a.tenant_id='local' and a.status='active' and m.role='owner' and m.revoked_at is null limit 1; rollback;""",db).splitlines()[1])
 ctx={'owner':owner,'operator':None}
 if operator:
  assert db!='postgres';uid='operation_probe_operator';auth='66a988b7-46dc-49a9-80ba-25fb5375825c'
  sql("insert into garimpa.app_user(id,tenant_id,auth_user_id) values('"+uid+"','local','"+auth+"'); insert into garimpa.app_user_role(app_user_id,role) values('"+uid+"','afiliado'); insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('"+owner['affiliateId']+"','"+uid+"','operator');",db)
  ctx['operator']={**owner,'actorAppUserId':uid,'authenticatedAuthUserId':auth,'membershipRole':'operator'}
 (release/'context.json').write_text(json.dumps(ctx));(release/'context.json').chmod(0o600)
 safe={'DATABASE_URL':urllib.parse.urlunsplit(url._replace(path='/'+db)),'NODE_ENV':'production','__NEXT_PROCESSED_ENV':'true','NEXT_PUBLIC_SITE_URL':'https://www.bizuminer.com.br','CURATION_ATTRIBUTE_WORKER_ENABLED':'false','SHOPEE_VERIFICATION_ENABLED':'false','RECAPTURE_PLANNER_ENABLED':'false'}
 for key in ['SHOPEE_CAPTURE_ENABLED','ALIEXPRESS_CAPTURE_ENABLED','EXTENSION_CAPTURE_ENABLED','AMAZON_BROWSER_CAPTURE_ENABLED','ALIEXPRESS_BROWSER_CAPTURE_ENABLED']:safe[key]=config.get(key,'false').strip().strip('\"\'')
 path=release/'probe.env';path.write_text(''.join(k+'='+v+'\n' for k,v in safe.items()));path.chmod(0o600)
 p=subprocess.run(['docker','run','--rm','--user','0:0','--network',network,'--env-file',str(path),'--mount','type=bind,source='+str(release)+',target=/proof,readonly','--entrypoint','node',candidates['garimpa-web'],'--experimental-strip-types','/proof/probe.mjs'],capture_output=True,text=True,timeout=180)
 (release/('clone-probe.log' if operator else 'live-probe.log')).write_text(p.stdout+p.stderr);path.unlink();assert p.returncode==0,'candidate readers failed; private probe log'
 report=json.loads(p.stdout.splitlines()[-1]);assert report['ok'] and report['dataPreserved'] and report['externalAttempts']==0;return report
try:
 assert hashlib.sha256((release/'migrations.sql').read_bytes()).hexdigest()==meta['combinedSqlSha256']
 if not context.exists():
  artifact=release/'context.tar.gz';assert hashlib.sha256(artifact.read_bytes()).hexdigest()==meta['contextArchiveSha256']
  context.mkdir(mode=0o700)
  with tarfile.open(artifact) as tar:
   for member in tar.getmembers():
    assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
    assert member.isfile() and not member.issym() and not member.islnk()
    assert member.name=='manifest.json' or member.name.startswith('garimpa/packages/')
   tar.extractall(context,filter='data')
 assert hashlib.sha256((context/'manifest.json').read_bytes()).hexdigest()==meta['manifestSha256']
 config=read_env(runtime);oldcontext=config['GARIMPA_CONTEXTS_DIR'];envdir=config['RUNTIME_ENV_DIR'];network=config['RUNTIME_NETWORK']
 (release/'runtime-before.env').write_bytes(config_original);(release/'runtime-before.env').chmod(0o600)
 images_before=others()
 for svc,image in SERVICES.items():
  c=inspect(PREFIX+svc+'-1');assert c['State']['Status']=='running' and c['State']['Health']['Status']=='healthy'
  assert json.loads(run(['docker','image','inspect',image],text=True))[0]['Id']==c['Image'];old[svc]=c['Image']
  run(['docker','tag',c['Image'],image.split(':')[0]+':'+meta['release']+'-rollback'])
 for name in ['garimpa-web.env','garimpa-executor.env']:
  p=Path(envdir)/name;envfiles[name]=hashlib.sha256(p.read_bytes()).hexdigest();(release/(name+'.before')).write_bytes(p.read_bytes());(release/(name+'.before')).chmod(0o600)
 (release/'before.json').write_text(json.dumps({'images':old,'otherContainers':images_before,'context':oldcontext,'environmentFileHashes':envfiles},indent=2))
 note('preflight',images=old,otherServicesProtected=len(images_before))
 assert not any(applied('postgres').values())
 backup=release/'garimpa-before-operation.dump'
 with backup.open('wb') as stream:subprocess.run(['docker','exec',DB,'pg_dump','-U','supabase_admin','-d','postgres','--format=custom','--schema=garimpa'],stdout=stream,check=True)
 backup.chmod(0o600)
 with backup.open('rb') as stream:run(['docker','exec','-i',DB,'pg_restore','--list'],stdin=stream)
 note('backup',bytes=backup.stat().st_size,sha256=hashlib.sha256(backup.read_bytes()).hexdigest())
 sql('create database '+database+'; revoke connect on database '+database+' from public;');db_created=True
 sql('create schema extensions;create extension "uuid-ossp" with schema extensions;create extension pgcrypto with schema extensions;create extension vector with schema extensions;',database)
 with backup.open('rb') as stream:
  p=subprocess.run(['docker','exec','-i',DB,'pg_restore','-U','supabase_admin','-d',database,'--exit-on-error'],stdin=stream,capture_output=True)
 (release/'restore.log').write_bytes(p.stderr);assert p.returncode==0,'private clone restore failed'
 before=fingerprints(database);migrate(database);assert fingerprints(database)==before,'migration changed copied facts/jobs/budget'
 note('migration-rehearsal',dataPreserved=True,objects=applied(database))
 with (release/'build.log').open('wb') as log:
  p=subprocess.run(['python3',str(R/'build-images.py'),meta['context'],'--only','garimpa','--execute'],cwd=R,stdout=log,stderr=subprocess.STDOUT)
 assert p.returncode==0,'build or isolated smoke failed; private build log'
 for svc,image in SERVICES.items():
  candidates[svc]=json.loads(run(['docker','image','inspect',image],text=True))[0]['Id'];assert candidates[svc]!=old[svc]
 clone=probe(database,True);(release/'clone-validation.json').write_text(json.dumps(clone,indent=2));note('candidate-images',images=candidates,clone=clone)
 # Same maintenance lock as backups/deploys; check external deployments before changing live services.
 assert runtime.read_bytes()==config_original,'runtime configuration changed concurrently'
 assert others()==images_before,'another application changed; defer cutover'
 for name,digest in envfiles.items():assert hashlib.sha256((Path(envdir)/name).read_bytes()).hexdigest()==digest
 for svc in SERVICES:assert inspect(PREFIX+svc+'-1')['Image']==old[svc]
 assert sql("select count(*) from garimpa.capture_batch where status='running';").strip()=='0','capture active; retry after it finishes'
 compose(['stop','-t','720','garimpa-capture-executor'],'stop-executor.log');stopped=True
 exitcode=inspect(PREFIX+'garimpa-capture-executor-1')['State']['ExitCode'];assert exitcode!=137,'forced executor shutdown; inspect leases'
 assert sql("select count(*) from garimpa.curation_attribute_job where status='running';").strip()=='0','in-flight jobs remain; do not repeat or discard them'
 live_before=fingerprints();migrate('postgres');assert fingerprints()==live_before,'live business data changed during schema expansion'
 note('migrations-applied',objects=applied('postgres'),businessDataPreserved=True)
 live=probe('postgres');(release/'live-validation.json').write_text(json.dumps(live,indent=2));note('live-readers',report=live)
 set_context(oldcontext,meta['context']);switched=True
 compose(['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','180',*SERVICES],'compose.log')
 for svc in SERVICES:
  c=inspect(PREFIX+svc+'-1');assert c['Image']==candidates[svc] and c['State']['Health']['Status']=='healthy'
  for name,digest in envfiles.items():assert hashlib.sha256((Path(envdir)/name).read_bytes()).hexdigest()==digest
 assert others()==images_before,'unrelated container changed during cutover'
 run(['curl','--fail','--silent','--show-error','--max-time','30','--output','/dev/null','https://www.bizuminer.com.br/entrar'])
 receipt={'status':'published-awaiting-browser-acceptance','oldImages':old,'newImages':candidates,'context':meta['context'],'sourcePackageSha256':meta['sourcePackageSha256'],'environmentUnchanged':True,'unrelatedServicesUnchanged':True,'schema':applied('postgres'),'clone':clone,'liveReadOnly':live,'backup':str(backup),'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (release/'deployment.json').write_text(json.dumps(receipt,indent=2)+'\n');note('published',images=candidates,configurationPreserved=True,otherServicesUnchanged=True)
except BaseException as error:
 note('failed',error=type(error).__name__,detail=str(error))
 if old and (switched or stopped):
  try:
   if switched:set_context(meta['context'],oldcontext)
   for svc,image in SERVICES.items():run(['docker','tag',old[svc],image])
   compose(['up','-d','--no-build','--no-deps','--force-recreate','--wait','--wait-timeout','180',*SERVICES],'rollback.log');note('images-restored',schemaPreserved=True)
  except BaseException as rollback:note('rollback-needs-attention',error=type(rollback).__name__)
 elif old:
  for svc,image in SERVICES.items():run(['docker','tag',old[svc],image])
 raise
finally:
 if db_created:
  try:sql('drop database '+database+' with (force);');note('clone-removed')
  except Exception:note('clone-cleanup-pending',database=database)
