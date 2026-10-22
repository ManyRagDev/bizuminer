import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";

export interface PrivateObjectStore {
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
}
export function privateObjectStore(): PrivateObjectStore {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("private_storage_not_configured");
  const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    bucket = client.storage.from("bizuminer-private");
  const ensurePrivate = async () => {
    const { data, error } = await client.storage.getBucket("bizuminer-private");
    if (error || !data || data.public)
      throw new Error("private_bucket_unavailable");
  };
  return {
    async put(path, bytes, mime) {
      await ensurePrivate();
      const { error } = await bucket.upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw new Error("private_upload_failed");
    },
    async get(path) {
      await ensurePrivate();
      const { data, error } = await bucket.download(path);
      if (error || !data) throw new Error("private_download_failed");
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
export async function savePrivateArtifact(
  context: AccountContext,
  input: {
    kind:
      "commission_original" | "kit_asset" | "kit_render" | "account_evidence";
    name: string;
    bytes: Uint8Array;
    mime: string;
    ownerRef?: string;
    rights?: Record<string, unknown>;
  },
  factory: typeof db = db,
  store?: PrivateObjectStore,
) {
  if (
    !context.actorAppUserId ||
    !input.bytes.length ||
    input.bytes.length > 10 * 1024 * 1024
  )
    throw new Error("invalid_artifact");
  const id = randomUUID(),
    path = `${context.tenantId}/${input.kind}/${id}`,
    sha256 = createHash("sha256").update(input.bytes).digest("hex");
  await withAccountDb(
    context,
    async (tx) => {
      await tx`insert into garimpa.private_artifact(id,tenant_id,kind,object_path,sha256,mime_type,byte_size,original_name,status,owner_ref,rights,created_by) values(${id},${context.tenantId},${input.kind},${path},${sha256},${input.mime},${input.bytes.length},${input.name.slice(0, 250)},'pending',${input.ownerRef ?? null},${tx.json((input.rights ?? {}) as never)},${context.actorAppUserId!})`;
    },
    factory,
  );
  try {
    await (store ?? privateObjectStore()).put(path, input.bytes, input.mime); // Outside SQL transaction; orphan is retained for reconciliation.
    await withAccountDb(
      context,
      async (tx) => {
        await tx`update garimpa.private_artifact set status='ready' where id=${id} and tenant_id=${context.tenantId}`;
      },
      factory,
    );
  } catch (error) {
    await withAccountDb(
      context,
      async (tx) => {
        await tx`update garimpa.private_artifact set status='orphaned' where id=${id} and tenant_id=${context.tenantId}`;
      },
      factory,
    );
    throw error;
  }
  return { id, sha256 };
}
export async function downloadPrivateArtifact(
  context: AccountContext,
  id: string,
  factory: typeof db = db,
  store?: PrivateObjectStore,
) {
  const artifact = await withAccountDb(
    context,
    async (tx) => {
      const [r] = await tx<
        any[]
      >`select * from garimpa.private_artifact where id::text=${id} and tenant_id=${context.tenantId} and status='ready'`;
      if (!r) throw new Error("artifact_not_found");
      return r;
    },
    factory,
  );
  const bytes = await (store ?? privateObjectStore()).get(artifact.object_path);
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error("artifact_integrity_failed");
  return {
    bytes,
    mime: artifact.mime_type,
    name: artifact.original_name,
    metadata: artifact,
  };
}

/** Resume a known upload only after reading and hashing the existing private object. No deletion or new upload. */
export async function reconcilePrivateArtifact(
  c: AccountContext,
  id: string,
  f: typeof db = db,
  store?: PrivateObjectStore,
) {
  if (c.membershipRole !== "owner") throw new Error("owner_required");
  const artifact = await withAccountDb(
    c,
    async (tx) => {
      const [r] = await tx<
        any[]
      >`select * from garimpa.private_artifact where tenant_id=${c.tenantId} and id::text=${id}`;
      if (!r) throw new Error("artifact_not_found");
      return r;
    },
    f,
  );
  const bytes = await (store ?? privateObjectStore()).get(artifact.object_path);
  if (
    bytes.length !== artifact.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
  )
    throw new Error("artifact_integrity_failed");
  await withAccountDb(
    c,
    async (tx) => {
      await tx`update garimpa.private_artifact set status='ready' where tenant_id=${c.tenantId} and id=${artifact.id}`;
      await tx`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload) values(${c.tenantId},'private_artifact',${id},1,'PrivateArtifactReconciled',${c.actorAppUserId!},${c.requestId},'verified-object',${tx.json({ sha256: artifact.sha256, bytes: bytes.length })}) on conflict do nothing`;
    },
    f,
  );
  return { id: artifact.id, status: "ready" };
}
