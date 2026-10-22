"""Read existing checks and freeze evidence; never connect, deploy or apply SQL."""
from pathlib import Path
import json, hashlib, datetime, re

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/implementation/evidencias'
load=lambda name:json.loads((OUT/name).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=load('../../../packages/persistence/supabase/rollouts/v2/manifest.json')
assert manifest['sealed'] and not manifest['productionApproved']
assert len(manifest['compatibilitySources'])==59
for x in manifest['compatibilitySources']: assert sha(ROOT/x['path'])==x['sha256'],x['path']
for x in manifest['units']: assert sha(ROOT/'packages/persistence/supabase/rollouts/v2'/x['file'])==x['sha256']
for x in manifest['installedSubset']+manifest['supersedes']: assert sha(ROOT/'packages/persistence/supabase/migrations'/x['file'])==x['sha256']
native=load('execucao-31-replacement-native.json')
operation=load('execucao-31-operational-native.json')
for j,count in [(native,39),(operation,21)]:
    assert not j.get('error') and len(j['results'])==count
    assert all(x['result']=='PASS' for x in j['results'])
sealed=load('execucao-31-sealed-checks.json')
assert len(sealed['results'])==21 and all(x['exitCode']==0 for x in sealed['results'])
assert sealed['manifestSha256']==sha(ROOT/'packages/persistence/supabase/rollouts/v2/manifest.json')
assert sealed['units']==manifest['units']
broad=load('execucao-31-final-checks.json')
assert len(broad['results'])==26
assert [(x['name'],x['exitCode']) for x in broad['results'] if x['exitCode']] == [('web-tests',1)]
web=(OUT/'execucao-31-web-unsandboxed.log').read_text()
assert '# tests 379' in web and '# pass 379' in web and '# fail 0' in web
extra=load('execucao-31-capture-extension-checks.json')
assert len(extra)==4 and all(x['exitCode']==0 for x in extra)
build=(OUT/'execucao-31-build-node24-unsandboxed.log').read_text()
assert 'Compiled successfully' in build and 'Middleware' in build and 'Build failed' not in build
release=load('execucao-31-release-fontes.json')
assert sha(ROOT/release['savedArchive'])==release['archiveSha256']
assert len(release['files'])==462 and release['buildComparison']['runtimeSourcesChanged'] is False
for x in release['files']: assert sha(ROOT/x['path'])==x['sha256'],x['path']
documents=[ROOT/'docs/implementation'/name for name in ['31-RECONCILIACAO-E-PACOTE-DE-HOMOLOGACAO.md','31-AUDITORIA-INDEPENDENTE-RECONCILIACAO.md','STATUS-EXECUCAO.md','README.md','CHECKPOINT-EXECUCAO-SEQUENCIAL.md','29-SETUP-VERCEL.md']]
documents.append(ROOT/'packages/persistence/supabase/rollouts/v2/README.md')
for p in documents:
    for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if link.startswith(('https:','http:','#')):continue
        target=link.split('#')[0]
        if target and (p.parent/target).resolve()!=(OUT/'execucao-31-verificacao-final.json').resolve():assert (p.parent/target).exists(),(p.name,target)
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS_LOCAL_VERIFICATION','productionApproved':False,'newProductionMigrations':0,'newDeployments':0,'nativeResults':39,'operationalResults':21,'sealedSqlSuites':21,'webTests':379,'broadOriginal':{'passedCommands':25,'failedCommands':1,'failure':'web-tests under restricted sandbox','preserved':True},'webRerun':{'exitCode':0,'tests':379,'log':'execucao-31-web-unsandboxed.log'},'captureExtensionCommands':4,'typechecks':'web/persistence/capture/extension PASS','builds':'Node22 local and Node24.11.0 isolated copy PASS; existing dependency installs, no remote services','runtimeSourcesFrozen':462,'sourceArchive':release['savedArchive'],'sourceArchiveSha256':release['archiveSha256'],'manifestSha256':sha(ROOT/'packages/persistence/supabase/rollouts/v2/manifest.json'),'readiness':'isolated rehearsal only; Supabase staging/cost confirmation and operational homologation unresolved','notProven':['managed postgres DDL role','Auth/Storage/Supavisor','deployed candidate/writers','remote recovery and performance','production migration approval','commercial gates']}
(OUT/'execucao-31-verificacao-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
selected=set(documents)
for pattern in ['execucao-31-*','auditoria-31-*','rollout-31-*']:
    selected.update(p for p in OUT.glob(pattern) if p.is_file())
selected.add(ROOT/release['savedArchive'])
selected.add(OUT/'prepare-release-31.py')
selected.add(Path(__file__))
selected.update((ROOT/'tools/editorial-tests').glob('*.ts'))
selected.update((ROOT/'tools/editorial-tests').glob('rollout-*'))
selected.add(ROOT/'tools/editorial-tests/build-rollout.py')
selected.add(ROOT/'tools/editorial-tests/README.md')
for item in manifest['compatibilitySources']:selected.add(ROOT/item['path'])
for item in release['files']:selected.add(ROOT/item['path'])
for item in manifest['installedSubset']+manifest['supersedes']:selected.add(ROOT/'packages/persistence/supabase/migrations'/item['file'])
files=[{'path':str(p.relative_to(ROOT)),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(selected)]
(OUT/'manifesto-execucao-31.json').write_text(json.dumps({'at':result['at'],'status':'ISOLATED_REHEARSAL_ONLY','productionApproved':False,'newProductionWrites':0,'files':files},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'verification':result['result'],'manifestFiles':len(files),'links':'PASS','productionApproved':False}))
