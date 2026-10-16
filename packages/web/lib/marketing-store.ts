import "server-only";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { MarketingStorage } from "./marketing-storage-core.ts";

// No public URL and no browser Storage client: every access passes the affiliate gate.
// This uses a private object, not a Markdown file or the legacy editorial pipeline.
export const MARKETING_BUCKET = "bizuminer-marketing";
export function marketingStorage(): MarketingStorage {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const database = process.env.DATABASE_URL;
  if (!url || !key || !database)
    throw new Error("Armazenamento de marketing não configurado.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }),
    },
  });
  const path = (owner: string) => {
    if (!/^[a-zA-Z0-9_-]{1,90}$/.test(owner))
      throw new Error("Identidade inválida.");
    return `${owner}/workspace.json`;
  };
  let bucketReady = false;
  async function bucket() {
    if (bucketReady) return;
    let existing = await client.storage.getBucket(MARKETING_BUCKET);
    if (existing.error && String(existing.error.statusCode) === "404") {
      const created = await client.storage.createBucket(MARKETING_BUCKET, {
        public: false,
        fileSizeLimit: 1000000,
        allowedMimeTypes: ["application/json"],
      });
      if (created.error) {
        existing = await client.storage.getBucket(MARKETING_BUCKET);
        if (existing.error)
          throw new Error("Não foi possível preparar o armazenamento privado.");
      } else existing = await client.storage.getBucket(MARKETING_BUCKET);
    }
    if (existing.error || !existing.data || existing.data.public)
      throw new Error("Armazenamento privado indisponível.");
    bucketReady = true;
  }
  return {
    async exclusive(owner, task) {
      path(owner);
      const sql = postgres(database, {
        prepare: false,
        max: 1,
        connect_timeout: 8,
        ssl: database.includes("localhost")
          ? false
          : { rejectUnauthorized: false },
      });
      try {
        return (await sql.begin(async (tx) => {
          await tx`set local lock_timeout = '15s'`;
          // Transaction-scoped lock serializes revisions across instances, not just one process.
          await tx`select pg_advisory_xact_lock(hashtext('bizuminer-marketing'), hashtext(${owner}))`;
          return task();
        })) as Awaited<ReturnType<typeof task>>;
      } finally {
        await sql.end({ timeout: 2 });
      }
    },
    async read(owner) {
      await bucket();
      // Bypass the object CDN too: fetch(no-store) alone only bypasses Next's cache.
      // Reading a cached revision would undermine optimistic conflict detection.
      const result = await client.storage
        .from(MARKETING_BUCKET)
        .download(path(owner), { cacheNonce: randomUUID() });
      if (result.error) {
        if (
          result.error.message === "Object not found" ||
          String(result.error.statusCode) === "404"
        )
          return null;
        throw new Error("Não foi possível carregar o espaço salvo.");
      }
      return JSON.parse(await result.data.text());
    },
    async write(owner, snapshot) {
      await bucket();
      const result = await client.storage
        .from(MARKETING_BUCKET)
        .upload(path(owner), JSON.stringify(snapshot), {
          upsert: true,
          contentType: "application/json",
          cacheControl: "0",
        });
      if (result.error)
        throw new Error(
          "Não foi possível salvar. Seus dados anteriores continuam preservados.",
        );
    },
  };
}
