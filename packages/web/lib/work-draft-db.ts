import { db } from "./db.ts";
import { isDeepStrictEqual } from "node:util";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import {
  validDraftId,
  validateDraft,
  type DraftInput,
  type WorkDraft,
  type DraftState,
} from "./affiliate-workspace-contract.ts";

export async function workDraftSchemaReady(tx: any): Promise<boolean> {
  const [r] =
    await tx`select to_regclass('garimpa.work_draft') is not null as ready`;
  return r?.ready === true;
}
function actor(c: AccountContext): string {
  if (c.actor !== "human" || !c.actorAppUserId || !c.membershipRole)
    throw new Error("forbidden");
  return c.actorAppUserId;
}
export function toWorkDraft(r: any): WorkDraft {
  return {
    id: r.id,
    kind: r.kind,
    channel: r.channel,
    title: r.title,
    productId: r.product_id,
    optionKey: r.option_key,
    sourceUrl: r.source_url,
    content: r.content,
    version: r.version,
    state: r.state,
    authorId: r.author_id,
    publicationId: r.publication_id,
    legacyRef: r.legacy_ref ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
export async function listWorkDrafts(
  c: AccountContext,
  factory: typeof db = db,
) {
  const author = actor(c);
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await workDraftSchemaReady(tx)))
        return { ready: false, drafts: [] as WorkDraft[] };
      const rows = await tx<
        any[]
      >`select * from garimpa.work_draft where tenant_id=${c.tenantId}
      and (author_id=${author} or state='published' or state in ('review','prepared') and ${c.membershipRole}='owner')
      and state<>'archived' order by updated_at desc,id limit 100`;
      return { ready: true, drafts: rows.map(toWorkDraft) };
    },
    factory,
  );
}
export async function readWorkDraft(
  c: AccountContext,
  draftId: string,
  factory: typeof db = db,
) {
  actor(c);
  if (!validDraftId(draftId)) throw new Error("not_found");
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await workDraftSchemaReady(tx)))
        throw new Error("workspace_schema_required");
      const [row] = await tx<
        any[]
      >`select * from garimpa.work_draft where tenant_id=${c.tenantId} and id=${draftId}::uuid`;
      if (!row) throw new Error("not_found");
      return toWorkDraft(row);
    },
    factory,
  );
}
export async function saveWorkDraft(
  c: AccountContext,
  raw: unknown,
  factory: typeof db = db,
) {
  const author = actor(c),
    input = validateDraft(raw);
  if (!input) throw new Error("invalid_draft");
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await workDraftSchemaReady(tx)))
        throw new Error("workspace_schema_required");
      if (input.productId) {
        const [product] =
          await tx`select id from garimpa.product where id=${input.productId} and tenant_id=${c.tenantId}`;
        if (!product) throw new Error("not_found");
      }
      let rows;
      if (input.expectedVersion === 0) {
        rows = await tx<
          any[]
        >`insert into garimpa.work_draft(id,tenant_id,author_id,kind,channel,title,product_id,option_key,source_url,content,legacy_ref)
        values(${input.id},${c.tenantId},${author},${input.kind},${input.channel},${input.title},${input.productId},${input.optionKey},${input.sourceUrl},${tx.json(input.content)},${input.legacyRef ?? null})
        on conflict do nothing returning *`;
      } else {
        rows = await tx<
          any[]
        >`update garimpa.work_draft set kind=${input.kind},channel=${input.channel},title=${input.title},product_id=${input.productId},
        option_key=${input.optionKey},source_url=${input.sourceUrl},content=${tx.json(input.content)},version=version+1,updated_at=now()
        where id=${input.id}::uuid and tenant_id=${c.tenantId} and author_id=${author} and version=${input.expectedVersion}
        and state='editing' returning *`;
      }
      if (!rows.length) {
        // A retried creation with the same content is safe; a different edit is a conflict.
        const [existing] = await tx<
          any[]
        >`select * from garimpa.work_draft where tenant_id=${c.tenantId}
        and author_id=${author} and (id=${input.id}::uuid or (${input.legacyRef ?? null}::text is not null and legacy_ref=${input.legacyRef ?? null}))`;
        if (
          existing &&
          input.expectedVersion === 0 &&
          input.legacyRef &&
          existing.legacy_ref === input.legacyRef
        )
          return toWorkDraft(existing);
        if (
          existing &&
          input.expectedVersion === 0 &&
          isDeepStrictEqual(existing.content, input.content) &&
          existing.title === input.title &&
          existing.channel === input.channel &&
          existing.product_id === input.productId &&
          existing.option_key === input.optionKey &&
          existing.source_url === input.sourceUrl &&
          existing.kind === input.kind
        )
          return toWorkDraft(existing);
        throw new Error("draft_conflict");
      }
      return toWorkDraft(rows[0]);
    },
    factory,
  );
}
export async function changeDraftState(
  c: AccountContext,
  input: {
    id: string;
    expectedVersion: number;
    state: "review" | "editing" | "archived";
  },
  factory: typeof db = db,
) {
  const author = actor(c);
  if (
    !validDraftId(input.id) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    !["review", "editing", "archived"].includes(input.state)
  )
    throw new Error("invalid_draft");
  return withAccountDb(
    c,
    async (tx) => {
      const [r] = await tx<
        any[]
      >`update garimpa.work_draft set state=${input.state},version=version+1,updated_at=now()
      where tenant_id=${c.tenantId} and author_id=${author} and id=${input.id}::uuid and version=${input.expectedVersion}
      and state in ('editing','review') returning *`;
      if (!r) throw new Error("draft_conflict");
      if (r.publication_id && input.state !== "review") {
        await tx`update garimpa.commercial_kit set workspace_visibility='private'
        where tenant_id=${c.tenantId} and workspace_author_id=${author} and id in
        (select kit_id from garimpa.campaign_publication where id=${r.publication_id} and tenant_id=${c.tenantId})`;
        await tx`update garimpa.campaign_publication set status='cancelled',version=version+1 where id=${r.publication_id} and tenant_id=${c.tenantId} and status='planned'`;
        const [reset] = await tx<
          any[]
        >`update garimpa.work_draft set publication_id=null where id=${r.id}::uuid and tenant_id=${c.tenantId} returning *`;
        return toWorkDraft(reset);
      }
      return toWorkDraft(r);
    },
    factory,
  );
}
