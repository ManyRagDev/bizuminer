/** Explicit operator tool. Dry-run validates local bytes only; never loads .env files. */
import { readFile, stat } from "node:fs/promises";
import postgres from "postgres";
import { databaseSsl } from "../src/database-ssl.ts";
import { importSharedLinkArchive, prepareSharedLinkArchive, SHARED_LINK_ARCHIVE_MAX_BYTES,
  SharedLinkImportError } from "../src/shared-link-archive-import.ts";

const usage = `Usage: node --experimental-strip-types packages/persistence/bin/import-shared-link-archive.ts
  --file <data.json.gz> --tenant <tenant> --affiliate <affiliate-id> [--execute]

Default: validate the approved snapshot hash, exact eight aliases and ownership offline.
--execute additionally imports in one transaction using SHARED_LINK_IMPORT_DATABASE_URL.
There is no DATABASE_URL fallback, hash override, provider call, or activation of captures.
`;
function options(args: string[]): { file: string; tenantId: string; affiliateId: string; execute: boolean } {
  const values = new Map<string, string>();
  let execute = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === "--execute" && !execute) { execute = true; continue; }
    if (!["--file", "--tenant", "--affiliate"].includes(flag) || values.has(flag)
      || !args[i + 1] || args[i + 1]!.startsWith("--")) throw new SharedLinkImportError("invalid_import_arguments");
    values.set(flag, args[++i]!);
  }
  if (values.size !== 3) throw new SharedLinkImportError("invalid_import_arguments");
  return { file: values.get("--file")!, tenantId: values.get("--tenant")!, affiliateId: values.get("--affiliate")!, execute };
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  const opt = options(args);
  const info = await stat(opt.file);
  if (!info.isFile() || info.size > SHARED_LINK_ARCHIVE_MAX_BYTES) throw new SharedLinkImportError("snapshot_too_large");
  const plan = prepareSharedLinkArchive(await readFile(opt.file), opt);
  if (!opt.execute) {
    console.log(JSON.stringify({ mode: "dry-run", valid: true, rows: plan.rows.length, snapshotSha256: plan.snapshotSha256,
      databaseChecked: false, imported: false }));
    return;
  }
  const connectionString = process.env.SHARED_LINK_IMPORT_DATABASE_URL;
  if (!connectionString) throw new SharedLinkImportError("dedicated_import_database_required");
  const sql = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10,
    ssl: databaseSsl(connectionString), connection: { application_name: "bizuminer-shared-link-import" } });
  try {
    const result = await importSharedLinkArchive(sql, plan);
    console.log(JSON.stringify({ mode: "execute", ...result, snapshotSha256: plan.snapshotSha256 }));
  } finally { await sql.end({ timeout: 5 }); }
}
try { await main(); }
catch (error) {
  // SQL/connection/JSON errors may include private destinations, row contents or credentials.
  console.error(JSON.stringify({ ok: false, error: error instanceof SharedLinkImportError ? error.message : "shared_link_import_failed" }));
  process.exitCode = 1;
}
