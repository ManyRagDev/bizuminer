#!/usr/bin/env python3
"""Snapshot the current components, including uncommitted source; never deploy.
No env files, credentials, installed dependencies or build cache enter the archive.
"""
from pathlib import Path
import hashlib, json, subprocess, tarfile, io
from datetime import datetime, timezone
root=Path(__file__).resolve().parents[2]
out=root/'.codex-tmp/operacao-fases4-5'
out.mkdir(parents=True,exist_ok=True)
prefixes=['packages/web/','packages/capture/','packages/persistence/','packages/extension/','tools/editorial-tests/']
extra=['AGENTS.md','docs/tecnico/manual-operacional-curadoria.md','docs/tecnico/plano-integracao-captura-curadoria-vitrine-pauta.md','docs/tecnico/publicacao-revisao-operacional.md','docs/implementation/evidencias/operacao-fases4-5.json','docs/implementation/evidencias/operacao-hoje-desktop.png']
extra+=['.github/workflows/'+f for f in ['capture-offers.yml','discover-shopee.yml','monitor-prices.yml']]
paths=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=root).decode().split('\0')
selected=[]
for value in sorted(set(paths+extra)):
    if not value or not(value in extra or any(value.startswith(p) for p in prefixes)):continue
    p=Path(value)
    if value not in extra and any(part.startswith('.') for part in p.parts):continue
    if any(part in {'node_modules','coverage','dist','build','.temp','.git'} or part.startswith('.next') for part in p.parts):continue
    if p.name.startswith('.env') or p.suffix.lower() in {'.pem','.key','.p12','.pfx','.log','.tsbuildinfo','.zip','.gz','.tgz','.bak'}:continue
    file=root/p
    if not file.is_file() or file.is_symlink():continue
    selected.append(value)
required=['20261115234320_capture_activity_history.sql','20261116195549_curation_operation_diagnostic.sql','20261117003000_curation_operation_reader.sql']
assert all('packages/persistence/supabase/migrations/'+f in selected for f in required)
assert all('schedule:' not in (root/f).read_text() for f in extra if f.startswith('.github/'))
evidence=json.loads((root/'docs/implementation/evidencias/operacao-fases4-5.json').read_text())
assert evidence['localAcceptance']=='passed', 'complete verification before packaging'
build_id=(root/'packages/web/.next-phase45/BUILD_ID').read_text().strip()
files={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in selected}
manifest={'format':1,'createdAt':datetime.now(timezone.utc).isoformat(),'scope':'operational review phases 1–5, current component checkout',
 'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'uncommittedSourceIncluded':True,
 'sourceSnapshotSha256':hashlib.sha256(json.dumps(files,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
 'verifiedBuildId':build_id,'buildEnvironment':'isolated fixture; rebuild with destination runtime configuration before publication',
 'components':{'garimpa-web':'packages/web; packages/capture/src and packages/persistence/src are imported by the web',
   'garimpa-capture-executor':'packages/web/bin/listen-capture-batches.ts imports curation-attribute-worker.ts; diagnostic persistence changed in phase 3',
   'extension':{'requiredUpdate':False,'sourceVersion':json.loads((root/'packages/extension/manifest.json').read_text())['version'],'compatibility':'version 1 requests; pairing and fingerprint retained'}},
 'requiredMigrations':required,'migrationPrerequisite':'reconcile installed schema with full catalogue; apply only pending compatible expansions, never replay blindly',
 'rollback':'restore previous web/executor image digests; retain additive schema and operational data; see publication document',
 'crons':'must remain suspended; no schedule trigger in bundled workflows; do not enable dispatch, flags or alternate schedules',
 'remotePublication':'not performed; no remote migration, deployment or customer send',
 'files':files}
manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
(out/'manifest.json').write_bytes(manifest_bytes)
archive=out/'bizuminer-operacao-fases4-5.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
    for name in selected:tar.add(root/name,arcname=name,recursive=False)
    item=tarfile.TarInfo('release-manifest.json');item.size=len(manifest_bytes);tar.addfile(item,io.BytesIO(manifest_bytes))
# Verify the actual archive against every file digest, with no extraction.
with tarfile.open(archive) as tar:
    assert set(tar.getnames())==set(selected+['release-manifest.json'])
    for name,digest in files.items():assert hashlib.sha256(tar.extractfile(name).read()).hexdigest()==digest
    assert all(not Path(name).is_absolute() and '..' not in Path(name).parts for name in tar.getnames())
receipt={'archive':str(archive.relative_to(root)),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'sourceFiles':len(files),'sourceSnapshotSha256':manifest['sourceSnapshotSha256'],'verifiedBuildId':build_id,'manifest':str((out/'manifest.json').relative_to(root))}
(out/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False,indent=2))
