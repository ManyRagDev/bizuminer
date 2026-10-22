"""Runner diagnóstico: testes isolados e checks existentes; não carrega env remoto."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess, os, json, time

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/implementation/evidencias'
env = dict(os.environ)
for key in tuple(env):
    if any(x in key for x in ('DATABASE_URL', 'SUPABASE', 'GEMINI_API_KEY', 'GOOGLE_API_KEY')) or key == 'NODE_OPTIONS':
        env.pop(key, None)
env['NEXT_TELEMETRY_DISABLED'] = '1'
env['DATABASE_URL'] = 'postgresql://audit:audit@localhost:1/audit_unreachable'

jobs = []
for package in ('web', 'capture', 'persistence', 'extension'):
    jobs.append((package+'-tests', ['npm','test','--prefix','packages/'+package]))
    jobs.append((package+'-typecheck', ['npm','run','typecheck','--prefix','packages/'+package,'--','--incremental','false']))
scripts = json.loads((ROOT/'tools/editorial-tests/package.json').read_text())['scripts']
for script in scripts:
    jobs.append(('sql-'+script.replace(':','-'), ['npm','run',script,'--prefix','tools/editorial-tests']))

def run(job):
    name,cmd = job
    started=time.monotonic()
    log=OUT/('revisao-16-'+name+'.log')
    with log.open('w') as f:
        try:
            result=subprocess.run(cmd,cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=240)
            code=result.returncode
        except subprocess.TimeoutExpired:
            f.write('\nDIAGNOSTIC_TIMEOUT_240_SECONDS\n')
            code=124
    item={'name':name,'command':cmd,'exitCode':code,'elapsedSeconds':round(time.monotonic()-started,2),'log':str(log.relative_to(ROOT))}
    print(json.dumps(item,ensure_ascii=False),flush=True)
    return item

results=[]
with ThreadPoolExecutor(max_workers=2) as executor:
    for completed in as_completed([executor.submit(run,j) for j in jobs]):
        results.append(completed.result())
results.append(run(('web-build',['npm','run','build','--prefix','packages/web'])))
(OUT/'revisao-16-checks.json').write_text(json.dumps({'date':'2026-10-14','environment':'local; URL ficticia nao conectavel; credenciais removidas; PGlite isolado','results':results},ensure_ascii=False,indent=2)+'\n')
print('CHECKS_FINISHED '+str(len(results)),flush=True)
