from pathlib import Path
import json,hashlib,tarfile,datetime,io
root=Path.cwd();base=root/'.codex-tmp/operacao-fases4-5';out=root/'.codex-tmp/operacao-publicacao'
receipt=json.loads((base/'receipt.json').read_text());archive=root/receipt['archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest()==receipt['sha256']
manifest=json.loads((base/'manifest.json').read_text());stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');name='contexts-operation-'+stamp
entries=[]
with tarfile.open(archive) as src,tarfile.open(out/'context.tar.gz','w:gz') as tar:
 for path,digest in manifest['files'].items():
  if not path.startswith('packages/'):continue
  data=src.extractfile(path).read();assert hashlib.sha256(data).hexdigest()==digest
  assert hashlib.sha256((root/path).read_bytes()).hexdigest()==digest,'source changed: '+path
  target='garimpa/'+path;member=tarfile.TarInfo(target);member.size=len(data);member.mode=0o644;tar.addfile(member,io.BytesIO(data))
  entries.append({'path':target,'size':len(data),'sha256':digest})
 context={'format':1,'created_utc':stamp,'source':'reviewed operational release '+receipt['sha256'],'files':entries,'sourcePackageSha256':receipt['sha256']}
 raw=(json.dumps(context,indent=2)+'\n').encode();member=tarfile.TarInfo('manifest.json');member.size=len(raw);member.mode=0o600;tar.addfile(member,io.BytesIO(raw))
old=json.loads(Path('/tmp/garimpa-published-context-manifest.json').read_text());before={x['path']:x['sha256'] for x in old['files']};after={x['path']:x['sha256'] for x in entries}
state={'context':name,'release':'operation-'+stamp,'contextArchiveSha256':hashlib.sha256((out/'context.tar.gz').read_bytes()).hexdigest(),'sourcePackageSha256':receipt['sha256'],'sourceSnapshotSha256':receipt['sourceSnapshotSha256'],'manifestSha256':hashlib.sha256(raw).hexdigest(),'files':len(entries),'delta':{'changed':sorted(k for k in before.keys()&after.keys() if before[k]!=after[k]),'added':sorted(after.keys()-before.keys()),'removed':sorted(before.keys()-after.keys())},'scope':['garimpa-web','garimpa-capture-executor'],'artifactRoutesReviewed':'Existing commercial/account gates remain inside save/download helpers; no rollout enabled; prior release ZIPs and CLI/private caches have no runtime callers and are excluded'}
(out/'release.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps({k:state[k] for k in ['context','release','files','contextArchiveSha256']}))
