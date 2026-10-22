"""Reproduz os ensaios exclusivamente na fixture PGlite sintética em memória."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[3]
out = root / 'docs/implementation/evidencias'
env = {
    k: v for k, v in os.environ.items()
    if not any(s in k for s in ('DATABASE_URL', 'SUPABASE', 'GEMINI', 'GOOGLE_API_KEY', 'NODE_OPTIONS'))
}
env['DATABASE_URL'] = 'postgresql://audit:audit@localhost:1/audit_unreachable'
command = [
    'node', '--import', './tools/editorial-tests/node_modules/tsx/dist/loader.mjs',
    'docs/implementation/evidencias/revisao-18-probes.mts',
]
with (out / 'revisao-18-probes.log').open('w') as log:
    result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=120)
print('exitCode:', result.returncode)
print('log:', out / 'revisao-18-probes.log')
raise SystemExit(result.returncode)
