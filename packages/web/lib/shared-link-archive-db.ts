import { db } from "./db.ts";
import { withPublicDb } from "./public-offer-db.ts";
import { archiveLookupKey, parseSharedLinkArchive, isArchiveTarget, type ArchiveLookupKind, type SharedLinkArchive } from "./shared-link-archive.ts";

// Probe before assuming the restricted role exists. A legacy schema without the
// archive functions keeps its existing routes; actual connection/ACL errors fail.
async function archiveFunctionReady(signature: string, sqlFactory: typeof db): Promise<boolean> {
  const sql = sqlFactory();
  try {
    const [schema] = await sql<{ ready: boolean }[]>`select to_regprocedure(${signature}) is not null as ready`;
    return schema?.ready === true;
  } finally { await sql.end(); }
}

/** No cached availability: revocation and inactive accounts apply on every request. */
export async function sharedLinkArchive(kind: ArchiveLookupKind, key: string, tenant?: string, sqlFactory: typeof db = db): Promise<SharedLinkArchive | null> {
  const normalized = archiveLookupKey(kind, key, tenant);
  if (!normalized || (sqlFactory === db && !process.env.DATABASE_URL)) return null;
  if (!await archiveFunctionReady("garimpa.public_shared_link_archive(text,text,text)", sqlFactory)) return null;
  return withPublicDb(async (sql) => {
    const [row] = await sql<{ result: unknown }[]>`select garimpa.public_shared_link_archive(${kind}::text, ${normalized}::text, ${tenant ?? null}::text) as result`;
    return parseSharedLinkArchive(row?.result);
  }, sqlFactory);
}

export async function sharedLinkArchiveTarget(slug: string, sqlFactory: typeof db = db): Promise<string | null> {
  if (!archiveLookupKey("slug", slug) || (sqlFactory === db && !process.env.DATABASE_URL)) return null;
  if (!await archiveFunctionReady("garimpa.public_shared_link_archive_target(text)", sqlFactory)) return null;
  return withPublicDb(async (sql) => {
    const [row] = await sql<{ result: unknown }[]>`select garimpa.public_shared_link_archive_target(${slug}::text) as result`;
    return isArchiveTarget(row?.result) ? row.result : null;
  }, sqlFactory);
}
