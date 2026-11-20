#!/usr/bin/env python3
"""Deploy Track 023 to production VPS (179.66.133.110).
Pauta Responsiva, Confirmação Contextual no Card e Rotatividade Ágil.
Preserves configuration, database, crons suspension and all unrelated services.
"""
from pathlib import Path
import json, hashlib, tarfile, datetime, subprocess, io, sys, time

root = Path(__file__).resolve().parents[1]
prefixes = ["packages/web/", "packages/capture/", "packages/persistence/", "packages/extension/"]

# 1. Collect files
paths = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
selected = []
for value in sorted(set(paths)):
    if not value or not any(value.startswith(p) for p in prefixes):
        continue
    p = Path(value)
    if any(part.startswith(".") for part in p.parts):
        continue
    if any(part in {"node_modules", "coverage", "dist", "build", ".temp", ".git"} or part.startswith(".next") for part in p.parts):
        continue
    if p.name.startswith(".env") or p.suffix.lower() in {".pem", ".key", ".p12", ".pfx", ".log", ".tsbuildinfo", ".zip", ".gz", ".tgz", ".bak", ".dump", ".backup", ".sqlite", ".sqlite3"}:
        continue
    file = root / p
    if not file.is_file() or file.is_symlink():
        continue
    selected.append(value)

assert len(selected) > 900, f"Too few files selected: {len(selected)}"
assert "packages/persistence/supabase/migrations/20261118203000_pauta_exposure_skip.sql" in selected
assert "packages/web/lib/pauta-db.ts" in selected
assert "packages/web/app/api/pauta/route.ts" in selected
assert "packages/web/app/pauta/pauta-client.tsx" in selected
assert "packages/web/app/globals.css" in selected

# 2. Package context archive
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
context_name = f"contexts-track023-{stamp}"
release_dir = root / ".codex-tmp" / f"release-track023-{stamp}"
release_dir.mkdir(parents=True, exist_ok=True)
archive_path = release_dir / "context.tar.gz"

entries = []
files_map = {}
for path in selected:
    data = (root / path).read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    files_map[path] = digest
    target = f"garimpa/{path}"
    entries.append({"path": target, "size": len(data), "sha256": digest})

manifest = {
    "format": 1,
    "created_utc": stamp,
    "source": f"track-023-deployment-{stamp}",
    "files": entries,
    "sourcePackageSha256": hashlib.sha256(json.dumps(files_map, sort_keys=True).encode()).hexdigest()
}

manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()

with tarfile.open(archive_path, "w:gz") as tar:
    for item in entries:
        rel = item["path"].removeprefix("garimpa/")
        data = (root / rel).read_bytes()
        member = tarfile.TarInfo(item["path"])
        member.size = len(data)
        member.mode = 0o644
        tar.addfile(member, io.BytesIO(data))
    member = tarfile.TarInfo("manifest.json")
    member.size = len(manifest_bytes)
    member.mode = 0o600
    tar.addfile(member, io.BytesIO(manifest_bytes))

archive_sha256 = hashlib.sha256(archive_path.read_bytes()).hexdigest()
print(f"[1/6] Packaged {len(entries)} files into {archive_path.name} (SHA-256: {archive_sha256[:16]}...)")
print(f"      Context name: {context_name}")

# 3. Verify locally against build-images verify_context rules
with tarfile.open(archive_path) as tar:
    names = set(tar.getnames())
    assert "manifest.json" in names
    for item in entries:
        assert item["path"] in names
print(f"[2/6] Local archive verified against format-1 manifest rules.")

# 4. Upload to VPS
vps_host = "postspark-vps"
vps_runtime = "/opt/platform-staging/runtime"
vps_context_dir = f"{vps_runtime}/{context_name}"
vps_archive_tmp = f"/tmp/{archive_path.name}"

print(f"[3/6] Uploading {archive_path.name} to {vps_host}...")
subprocess.run(["scp", "-o", "BatchMode=yes", str(archive_path), f"{vps_host}:{vps_archive_tmp}"], check=True)

# 5. Remote extract, build images, and restart
remote_script = f"""
set -euo pipefail

# Check expected sha256
ACTUAL_SHA=$(sha256sum {vps_archive_tmp} | awk '{{print $1}}')
if [ "$ACTUAL_SHA" != "{archive_sha256}" ]; then
  echo "Archive checksum mismatch: $ACTUAL_SHA != {archive_sha256}" >&2
  exit 1
fi

# Extract into context directory
mkdir -p "{vps_context_dir}"
chmod 700 "{vps_context_dir}"
tar -xzf "{vps_archive_tmp}" -C "{vps_context_dir}"
rm -f "{vps_archive_tmp}"

# Run build-images.py
cd "{vps_runtime}"
python3 build-images.py "{context_name}" --only garimpa --execute

# Stop executor gracefully
docker compose --profile garimpa-executor stop -t 720 garimpa-capture-executor

# Atomically update GARIMPA_CONTEXTS_DIR in .env
python3 -c '
import os
path = "{vps_runtime}/.env"
with open(path, "r") as f:
    lines = f.readlines()
new_lines = []
for l in lines:
    if l.startswith("GARIMPA_CONTEXTS_DIR="):
        new_lines.append("GARIMPA_CONTEXTS_DIR={context_name}\\n")
    else:
        new_lines.append(l)
with open(path + ".tmp", "w") as f:
    f.writelines(new_lines)
os.replace(path + ".tmp", path)
'

# Recreate web and executor
docker compose --profile garimpa --profile garimpa-executor up -d --no-build --no-deps --force-recreate garimpa-web garimpa-capture-executor

# Poll for healthy status (up to 90s)
echo "Waiting for containers to report healthy..."
for i in $(seq 1 45); do
  WEB_HEALTH=$(docker inspect --format '{{{{.State.Health.Status}}}}' platform-app-trial-garimpa-web-1 2>/dev/null || echo "starting")
  EXEC_HEALTH=$(docker inspect --format '{{{{.State.Health.Status}}}}' platform-app-trial-garimpa-capture-executor-1 2>/dev/null || echo "starting")
  if [ "$WEB_HEALTH" = "healthy" ] && [ "$EXEC_HEALTH" = "healthy" ]; then
    echo "Containers are healthy (web: $WEB_HEALTH, executor: $EXEC_HEALTH)"
    exit 0
  fi
  sleep 2
done

echo "Healthcheck timeout! Web: $WEB_HEALTH, Executor: $EXEC_HEALTH" >&2
docker logs --tail 30 platform-app-trial-garimpa-web-1 >&2
exit 1
"""

print(f"[4/6] Executing build and deployment on VPS...")
remote_res = subprocess.run(["ssh", "-o", "BatchMode=yes", vps_host, "bash -s"], input=remote_script, text=True, capture_output=True)
print(remote_res.stdout)
if remote_res.returncode != 0:
    print(remote_res.stderr, file=sys.stderr)
    sys.exit(remote_res.returncode)

print(f"[5/6] Services successfully updated and verified healthy on VPS.")

# 6. Verify live endpoints
print(f"[6/6] Probing live endpoints on https://www.bizuminer.com.br...")

endpoints = [
    ("/", "Vitrine Pública"),
    ("/entrar", "Página de Autenticação"),
    ("/pauta", "Pauta Editorial"),
    ("/admin", "Painel Administrativo"),
    ("/admin/curadoria", "Curadoria Editorial"),
]

for ep, label in endpoints:
    url = f"https://www.bizuminer.com.br{ep}"
    res = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}s %{size_download}b", url],
        capture_output=True, text=True
    )
    parts = res.stdout.strip().split()
    if len(parts) >= 3:
        code, dur, size = parts[0], parts[1], parts[2]
        print(f"      {label:<30} {url} -> HTTP {code} em {dur} ({size})")
    else:
        print(f"      {label:<30} {url} -> {res.stdout.strip()}")

print("\n--- DEPLOYMENT OF TRACK 023 TO PRODUCTION COMPLETE ---")
