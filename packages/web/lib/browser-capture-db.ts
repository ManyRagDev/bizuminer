import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { captureExecutor } from "./capture-dispatch.ts";
import { categoryForTitle } from "../../persistence/src/category.ts";
import { familyInfoForTitle } from "../../persistence/src/product-family.ts";
import { pageObservationMethod } from "../../capture/src/source-page-url.ts";
import { browserOfferEvidence, type SupportedExtensionMarketplace } from "./extension-contract.ts";
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

  async pending(access: BrowserCaptureAccess, marketplace: SupportedExtensionMarketplace = "mercadolivre"): Promise<string | null> {
    return this.query(access, async sql => {
      await sql`
        update garimpa.capture_batch set status='error',finished_at=now(),
          metadata=jsonb_set(metadata,'{execution}',coalesce(metadata->'execution','{}'::jsonb)
            || '{"phase":"finished","error":"execution_timeout"}'::jsonb)
        where tenant_id=${access.tenantId} and status='running'
          and metadata#>>'{execution,executor}' is distinct from 'durable'
          and case when metadata->'execution'->>'version'='1'
            then (metadata->'execution'->>'deadline')::timestamptz < now()
            else true end
      `;

      const [row] = await sql<
        { id: string; expired: boolean }[]
      >`select id,(metadata#>>'{execution,deadline}')::timestamptz<=now() as expired from garimpa.capture_batch
        where tenant_id=${access.tenantId} and status='running'
          and (metadata->'execution'->>'phase'='awaiting_browser'
            or (metadata->'execution'->>'phase'='retry_wait' and metadata->'execution'->'stores'->${marketplace}::text->>'status'='awaiting_browser'))
          and metadata->'execution'->'browser'->>'ownerAppUserId'=${access.appUserId}
          and coalesce(metadata->'execution'->'browser'->>'marketplace','mercadolivre')=${marketplace}
        order by started_at desc limit 1 for update`;
      if (row?.id) {
        // An explicit capture request by the same owner renews the browser window.
        // Waiting itself performs no periodic query or automatic provider request.
        if (row.expired) await sql`update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,deadline}',
          to_jsonb((now()+interval '30 minutes')::text)) where id=${row.id} and tenant_id=${access.tenantId}`;
        return row.id;
      }

      const [running] = await sql<
        { id: string; metadata: any }[]
      >`select id, metadata from garimpa.capture_batch
        where tenant_id=${access.tenantId} and status='running'
        order by started_at desc limit 1`;

      if (running?.id) {
        const execution = running.metadata?.execution;
        if (
          marketplace === "mercadolivre" && running.metadata?.execution?.phase !== "awaiting_browser" &&
          execution &&
          !execution.browser?.captureRunId &&
          !execution.browser?.requestId
        ) {
          await sql`
            update garimpa.capture_batch
            set metadata = jsonb_set(
              jsonb_set(
                metadata,
                '{execution,browser}',
                coalesce(metadata->'execution'->'browser', '{}'::jsonb) || ${sql.json({ ownerAppUserId: access.appUserId })}
              ),
              '{execution,mlConsent}',
              'true'::jsonb
            )
            where id = ${running.id} and tenant_id = ${access.tenantId}
          `;
          return running.id;
        }
        return null;
      }

      const execution = {
        version: 1,
        phase: "awaiting_browser",
        executor: captureExecutor(),
        mlConsent: true,
        browser: { ownerAppUserId: access.appUserId, marketplace },
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
        stores: { [marketplace]: { status: "awaiting_browser" } },
      };
      const [newBatch] = await sql<
        { id: string }[]
      >`insert into garimpa.capture_batch
        (tenant_id, requested_marketplaces, pages, metadata)
        values(${access.tenantId}, ${[marketplace]}, 1, ${sql.json({ execution })})
        on conflict do nothing
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
        const marketplace = execution.browser.marketplace ?? "mercadolivre";
        if (payload && marketplace !== payload.marketplace) throw new Error("browser_capture_marketplace_mismatch");
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
          (execution.phase !== "awaiting_browser" && execution.phase !== "retry_wait") ||
          (execution.phase === "retry_wait" && execution.stores?.[marketplace]?.status !== "awaiting_browser") ||
          new Date(execution.deadline).getTime() <= Date.now()
        )
          throw new Error("browser_capture_not_waiting");
        let importedCount = 0;
        if (payload) {
          const products = payload.products.map((p) => ({
            ...p,
            offerEvidence: browserOfferEvidence(p, p.productUrl, payload.clientCapturedAt, marketplace,
              pageObservationMethod(marketplace, payload.page, p.externalId)),
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
            values(gen_random_uuid()::text,${access.tenantId},${marketplace},now(),'running',${`browser-${payload.requestId}`},${tx.json(parameters)}) returning id`;
          const counts = { captured: 0, new_items: 0, price_changes: 0 };
          for (const product of products) {
            const [prepared] = await tx<{ result: { is_new: boolean; previous_price_cents: number | null } }[]>`
              select garimpa.stage_capture_offer(${access.tenantId},${run.id},${tx.json({
                ...product, marketplace, observedAt: new Date(Math.min(Date.now(), Date.parse(payload.clientCapturedAt))).toISOString(),
                captureSource: access.deviceId ? "extension" : "bookmarklet", sourcePageUrl: payload.page.url,
                clientCapturedAt: payload.clientCapturedAt,
                claimedDiscountRate: !product.offerEvidence.conditions && product.offerEvidence.priceType !== "range"
                  && product.originalPriceCents && product.originalPriceCents > product.priceCents
                  ? 1 - product.priceCents / product.originalPriceCents : null,
              } as any)}::jsonb) as result`;
            counts.captured++;
            if (prepared.result.is_new) counts.new_items++;
            else if (prepared.result.previous_price_cents !== null && prepared.result.previous_price_cents !== product.priceCents) counts.price_changes++;
          }
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
          execution.stores[marketplace] = { status: "ok" };
        } else {
          execution.browser.skipped = true;
          execution.stores[marketplace] = {
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
