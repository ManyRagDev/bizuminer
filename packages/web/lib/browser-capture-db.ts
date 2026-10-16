import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { categoryForTitle } from "../../persistence/src/category.ts";
import { familyInfoForTitle } from "../../persistence/src/product-family.ts";
import type { BrowserCapturePayload } from "./browser-capture-contract.ts";
import type { StoredCaptureBatch } from "./capture-batch-db.ts";

export interface BrowserCaptureAccess {
  appUserId: string;
  tenantId: string;
  deviceId?: string;
}
export class BrowserCaptureStore {
  private readonly sqlFactory: typeof db;
  constructor(sqlFactory: typeof db = db) {
    this.sqlFactory = sqlFactory;
  }

  private async query<T>(access: BrowserCaptureAccess, work: (tx: import("postgres").TransactionSql) => Promise<T>): Promise<T> {
    const sql = this.sqlFactory();
    try {
      return await sql.begin(async tx => {
        await tx`set local statement_timeout='20s'`;
        await tx`select set_config('garimpa.tenant_id',${access.tenantId},true),
          set_config('garimpa.actor_type',${access.deviceId ? 'device' : 'human'},true),
          set_config('garimpa.actor_app_user_id',${access.appUserId},true),
          set_config('garimpa.membership_role','',true),
          set_config('garimpa.platform_role','',true),
          set_config('garimpa.request_id',${randomUUID()},true)`;
        const [auth] = await tx<{allowed:boolean}[]>`select exists(
          select 1 from garimpa.app_user_role r
          join garimpa.affiliate_membership m on m.app_user_id=r.app_user_id and m.revoked_at is null
          join garimpa.affiliate_account a on a.id=m.affiliate_id and a.status='active'
          where r.app_user_id=${access.appUserId} and r.role='afiliado' and r.revoked_at is null
            and a.tenant_id=${access.tenantId}
            and (${access.deviceId ?? null}::text is null or exists(
              select 1 from garimpa.extension_device d where d.id=${access.deviceId ?? null}::text
                and d.affiliate_id=a.id and d.created_by_app_user_id=r.app_user_id and d.revoked_at is null
            ))
        ) as allowed`;
        if (!auth?.allowed) throw new Error('browser_capture_forbidden');
        return work(tx);
      }) as unknown as T;
    } finally { await sql.end(); }
  }

  async pending(access: BrowserCaptureAccess): Promise<string | null> {
    return this.query(access, async sql => {
      await sql`
        update garimpa.capture_batch set status='error',finished_at=now(),
          metadata=jsonb_set(metadata,'{execution}',coalesce(metadata->'execution','{}'::jsonb)
            || '{"phase":"finished","error":"execution_timeout"}'::jsonb)
        where tenant_id=${access.tenantId} and status='running'
          and case when metadata->'execution'->>'version'='1'
            then (metadata->'execution'->>'deadline')::timestamptz < now()
            else true end
      `;

      const [row] = await sql<
        { id: string }[]
      >`select id from garimpa.capture_batch
        where tenant_id=${access.tenantId} and status='running'
          and metadata->'execution'->>'phase'='awaiting_browser'
          and metadata->'execution'->'browser'->>'ownerAppUserId'=${access.appUserId}
          and (metadata->'execution'->>'deadline')::timestamptz>now()
        order by started_at desc limit 1`;
      if (row?.id) return row.id;

      const [running] = await sql<
        { id: string }[]
      >`select id from garimpa.capture_batch
        where tenant_id=${access.tenantId} and status='running'
        limit 1`;
      if (running?.id) return null;

      const execution = {
        version: 1,
        phase: "awaiting_browser",
        executor: "local",
        mlConsent: true,
        browser: { ownerAppUserId: access.appUserId },
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
        stores: { mercadolivre: { status: "awaiting_browser" } },
      };
      const [newBatch] = await sql<
        { id: string }[]
      >`insert into garimpa.capture_batch
        (tenant_id, requested_marketplaces, pages, metadata)
        values(${access.tenantId}, ${["mercadolivre"]}, 1, ${sql.json({ execution })})
        returning id`;
      return newBatch?.id ?? null;
    });
  }

  /** Lock the parent, validate ownership, write the whole page, then queue continuation atomically. */
  async complete(
    access: BrowserCaptureAccess,
    batchId: string,
    payload: BrowserCapturePayload | null,
  ) {
    return this.query(access, async tx => {
        const [batch] = await tx<
          StoredCaptureBatch[]
        >`select * from garimpa.capture_batch
          where id=${batchId} and tenant_id=${access.tenantId} for update`;
        const execution = batch?.metadata.execution;
        if (
          !execution?.browser ||
          execution.browser.ownerAppUserId !== access.appUserId ||
          !execution.mlConsent
        )
          throw new Error("browser_capture_forbidden");
        const fingerprint = payload
          ? createHash("sha256").update(JSON.stringify(payload)).digest("hex")
          : "skip";
        if (execution.browser.requestId || execution.browser.skipped) {
          if (
            (payload &&
              execution.browser.requestId === payload.requestId &&
              execution.browser.fingerprint === fingerprint) ||
            (!payload && execution.browser.skipped)
          ) {
            return {
              duplicate: true,
              importedCount: execution.browser.importedCount ?? 0,
              queued:
                batch.status === "running" && execution.phase === "queued",
            };
          }
          throw new Error("browser_capture_already_completed");
        }
        if (
          batch.status !== "running" ||
          execution.phase !== "awaiting_browser" ||
          new Date(execution.deadline).getTime() <= Date.now()
        )
          throw new Error("browser_capture_not_waiting");
        let importedCount = 0;
        if (payload) {
          const products = payload.products.map((p) => ({
            ...p,
            category: categoryForTitle(p.title),
            family: familyInfoForTitle(p.title),
          }));
          const parameters = {
            operationBatchId: batchId,
            browserRequestId: payload.requestId,
            captureMode: "browser",
            pagesRead: 1,
            itemsSeen: products.length,
            maxPages: 1,
          };
          const [run] = await tx<
            { id: string }[]
          >`insert into garimpa.capture_run
            (id,tenant_id,marketplace,started_at,status,collector_run_id,parameters)
            values(gen_random_uuid()::text,${access.tenantId},'mercadolivre',now(),'running',${`browser-${payload.requestId}`},${tx.json(parameters)}) returning id`;
          const [counts] = await tx<
            { captured: number; new_items: number; price_changes: number }[]
          >`
            with input as (
              select * from jsonb_to_recordset(${tx.json(products.map((p) => ({ ...p, family: p.family ? { ...p.family } : null })))}::jsonb) as x(
                "externalId" text,title text,"productUrl" text,"imageUrl" text,"priceCents" int,"originalPriceCents" int,
                "ratingStar" numeric,"salesCount" bigint,"salesLabel" text,category text,family jsonb)
            ), previous as materialized (
              select p.external_id,p.last_price_cents from garimpa.product p join input i on i."externalId"=p.external_id
              where p.tenant_id=${access.tenantId} and p.marketplace='mercadolivre'
            ), up as (
              insert into garimpa.product as p
                (id,tenant_id,marketplace,external_id,title,product_url,image_url,category,
                  family_key,family_label,family_method,family_version,last_price_cents,first_seen_at,last_seen_at,last_capture_run_id)
              select gen_random_uuid()::text,${access.tenantId},'mercadolivre',i."externalId",i.title,i."productUrl",i."imageUrl",i.category,
                i.family->>'key',i.family->>'label',i.family->>'method',i.family->>'version',
                i."priceCents",now(),now(),${run.id} from input i
              on conflict(tenant_id,marketplace,external_id) do update set
                title=excluded.title,product_url=excluded.product_url,image_url=coalesce(excluded.image_url,p.image_url),
                category=coalesce(excluded.category,p.category),family_key=coalesce(excluded.family_key,p.family_key),
                family_label=coalesce(excluded.family_label,p.family_label),family_method=coalesce(excluded.family_method,p.family_method),
                family_version=coalesce(excluded.family_version,p.family_version),last_price_cents=excluded.last_price_cents,
                last_seen_at=excluded.last_seen_at,last_capture_run_id=excluded.last_capture_run_id,updated_at=now()
              returning id,external_id
            ), observations as (
              insert into garimpa.price_observation
                (id,tenant_id,capture_run_id,product_id,price_cents,original_price_cents,claimed_discount_rate,
                  rating_star,sales_count,sales_label,observed_at,title_snapshot,product_url_snapshot,image_url_snapshot,category_snapshot,
                  offer_evidence,capture_source,source_page_url,client_captured_at)
              select gen_random_uuid()::text,${access.tenantId},${run.id},up.id,i."priceCents",i."originalPriceCents",
                case when i."originalPriceCents">i."priceCents" then 1-i."priceCents"::numeric/i."originalPriceCents" else null end,
                i."ratingStar",i."salesCount",i."salesLabel",now(),i.title,i."productUrl",i."imageUrl",i.category,
                ${tx.json({ version: 1, source: { marketplace: "mercadolivre", method: "browser", url: payload.page.url, capturedAt: payload.clientCapturedAt } })},
                ${access.deviceId ? "extension" : "bookmarklet"},${payload.page.url},${payload.clientCapturedAt}::timestamptz
              from up join input i on i."externalId"=up.external_id returning id
            ) select (select count(*)::int from observations) as captured,
              (select count(*)::int from up where external_id not in (select external_id from previous)) as new_items,
              (select count(*)::int from input i join previous p on p.external_id=i."externalId" where p.last_price_cents<>i."priceCents") as price_changes
          `;
          importedCount = counts.captured;
          await tx`update garimpa.capture_run set status='ok',finished_at=now(),items_captured=${counts.captured},
            items_new=${counts.new_items},price_changes=${counts.price_changes} where id=${run.id}`;
          execution.browser = {
            ...execution.browser,
            requestId: payload.requestId,
            fingerprint,
            captureRunId: run.id,
            importedCount,
          };
          execution.stores.mercadolivre = { status: "ok" };
        } else {
          execution.browser.skipped = true;
          execution.stores.mercadolivre = {
            status: "error",
            error: "browser_capture_skipped",
          };
        }
        execution.phase = "queued";
        execution.deadline = new Date(Date.now() + 15 * 60_000).toISOString();
        delete execution.workerId;
        await tx`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution}',${tx.json({ ...execution, triage: execution.triage ? { ...execution.triage } : undefined })}::jsonb)
          where id=${batchId} and tenant_id=${access.tenantId}`;
        return { duplicate: false, importedCount, queued: true };
    });
  }
}
export const browserCaptures = new BrowserCaptureStore();
