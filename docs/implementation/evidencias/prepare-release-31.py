"""Freeze a reviewable source package, never deploy or load remote credentials."""
from pathlib import Path
import hashlib, json, tarfile, shutil, datetime, sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/implementation/evidencias'
DEST = Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/bizuminer-release31')
assert DEST.parent == Path('/tmp') and DEST.name.startswith('bizuminer-release31'), 'Only a fresh task directory in /tmp is allowed'
ARCHIVE = DEST.with_suffix('.tar.gz')
assert not DEST.exists(), 'Use a fresh destination; do not overwrite an existing rehearsal'
allowed = {'.ts','.tsx','.mts','.js','.mjs','.cjs','.json','.css','.html','.md','.sql','.yml','.yaml','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf','.otf'}
excluded = {'node_modules','.next','.vercel','.git','dist','build','release','coverage','.temp','__pycache__'}
selected = set()
rollout = ROOT / 'packages/persistence/supabase/rollouts/v2'
manifest = json.loads((rollout/'manifest.json').read_text())
installed = {x['file'] for x in manifest['installedSubset']}
for directory in ['packages/web','packages/capture','packages/persistence','packages/extension','.github/workflows']:
    for p in (ROOT/directory).rglob('*'):
        rel = p.relative_to(ROOT)
        if not p.is_file() or p.is_symlink() or any(x in excluded for x in rel.parts): continue
        if p.name.startswith('.env') or p.name in {'credentials.json','tokens.json'}: continue
        if p.name.startswith('tmp-'): continue
        if p.suffix not in allowed and p.name != '.gitignore': continue
        if '/supabase/migrations/' in str(rel) and p.name not in installed: continue
        if '/supabase/rollouts/' in str(rel) and p.parent != rollout: continue
        selected.add(p)
selected.add(ROOT/'.gitignore')
files=[]
for p in sorted(selected):
    rel=p.relative_to(ROOT)
    target=DEST/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,target)
    digest=hashlib.sha256(p.read_bytes()).hexdigest()
    assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
    files.append({'path':str(rel),'sha256':digest,'bytes':p.stat().st_size})
with tarfile.open(ARCHIVE,'w:gz') as tar:
    for item in files: tar.add(DEST/item['path'],arcname=item['path'],recursive=False)
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'source package, not prebuilt deployment','productionApproved':False,'published':False,'source':str(DEST),'archive':str(ARCHIVE),'archiveSha256':hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),'rolloutManifestSha256':hashlib.sha256((rollout/'manifest.json').read_bytes()).hexdigest(),'excluded':['credentials and .env*','node_modules/build outputs','unrelated user documents','pending historical migrations; no automatic db push'],'files':files}
(OUT/'execucao-31-release-fontes.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'}));print('files='+str(len(files)))
