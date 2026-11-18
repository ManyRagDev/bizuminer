import { adminMutationOrigin } from "../../../../../lib/admin-request-origin.ts";
import { inAccountScope } from "../../../../../lib/account-scope.ts";
import { NextRequest } from "next/server";
import { captureBatches } from "../../../../../lib/capture-batch-db";
import {
  captureExecutor,
  dispatchCaptureBatch,
  prepareAccountCapture,
} from "../../../../../lib/capture-dispatch";
import { checkAffiliateUser, sinkJson } from "../../../../../lib/api-auth";
import { batchCapturePlan } from "../../../../../lib/batch-capture-plan";

export const preferredRegion = "gru1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 3;

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session")
    return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden")
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
 return inAccountScope(check.context, async () => {
  const id = request.nextUrl.searchParams.get("id");
  if (id && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_batch_id" },
      { status: 400 },
    );
  }
  try {
    const batch = await captureBatches.publicStatus(id ?? undefined);
    return batch
      ? sinkJson(
          check.sink,
          { ok: true, batch },
          { headers: { "Cache-Control": "no-store" } },
        )
      : sinkJson(
          check.sink,
          { ok: true, batch: null },
          { headers: { "Cache-Control": "no-store" } },
        );
  } catch {
    return sinkJson(
      check.sink,
      { ok: false, error: "migration_required_or_server_error" },
      { status: 500 },
    );
  }

 });
}

/** Dispara as duas lojas padrão; ML entra somente com consentimento explícito. */
export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session")
    return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden")
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
 return inAccountScope(check.context, async () => {
  if (!adminMutationOrigin(request)) {
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  }
  const requestId = request.headers.get("Idempotency-Key") ?? undefined;
  if (requestId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)) {
    return sinkJson(check.sink,{ok:false,error:"invalid_capture_request_id"},{status:400});
  }
  let pages = 2;
  let consent = false;
  let requestedMarketplaces: string[] | undefined;
  let planMode: "departments" | "keywords" | undefined;
  let sortOrder: "sales" | "default" | "discount" | undefined;
  let pageSize: number | undefined;
  {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "retry" | "cancel" | "resume";
      batchId?: string;
      pages?: number;
      consent?: boolean;
      marketplaces?: unknown;
      planMode?: "departments" | "keywords";
      sortOrder?: "sales" | "default" | "discount";
      pageSize?: number;
    };
    if (body.action === "resume") {
      if (body.marketplaces !== undefined && (!Array.isArray(body.marketplaces)
        || body.marketplaces.length !== 1 || body.marketplaces[0] !== "shopee"))
        return sinkJson(check.sink,{ok:false,error:"capture_batch_not_resumable"},{status:409});
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.batchId ?? ""))
        return sinkJson(check.sink,{ok:false,error:"invalid_batch_id"},{status:400});
      if (captureExecutor() !== "local")
        return sinkJson(check.sink,{ok:false,error:"capture_batch_not_resumable"},{status:409});
      try {
        const prepared = await prepareAccountCapture(check.context, ["shopee"], false);
        if (!prepared.enabled.includes("shopee"))
          return sinkJson(check.sink,{ok:false,error:"no_enabled_marketplace",skipped:prepared.skipped},{status:409});
        await captureBatches.resumeLocalShopee(body.batchId!, check.context.tenantId);
      } catch (error) {
        const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
        return sinkJson(check.sink,{ok:false,error:conflict ? "batch_in_progress" : "capture_batch_not_resumable"},{status:409});
      }
      try {
        await dispatchCaptureBatch(body.batchId!, check.context);
      } catch {
        await captureBatches.dispatchFailed(body.batchId!);
        const batch = await captureBatches.publicStatus(body.batchId!);
        return sinkJson(check.sink,{ok:batch?.status === "running",error:"dispatch_failed",batch},{status:batch?.status === "running" ? 202 : 502});
      }
      return sinkJson(check.sink,{ok:true,batch:await captureBatches.publicStatus(body.batchId!)},{status:202});
    }
    if (body.action === "retry" || body.action === "cancel") {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.batchId ?? ""))
        return sinkJson(check.sink,{ok:false,error:"invalid_batch_id"},{status:400});
      try {
        await captureBatches.resolveWait(body.batchId!,check.context.tenantId,body.action);
        if(body.action==='retry')await dispatchCaptureBatch(body.batchId!,check.context);
        return sinkJson(check.sink,{ok:true,batch:await captureBatches.publicStatus(body.batchId!)},{status:200});
      } catch {
        return sinkJson(check.sink,{ok:false,error:"capture_batch_not_waiting"},{status:409});
      }
    }
    if (Number.isInteger(body.pages))
      pages = Math.min(Math.max(body.pages!, 1), MAX_PAGES);
    consent = body.consent === true;
    if (body.planMode === "departments" || body.planMode === "keywords") {
      planMode = body.planMode;
    }
    if (body.sortOrder === "sales" || body.sortOrder === "default" || body.sortOrder === "discount") {
      sortOrder = body.sortOrder;
    }
    if (Number.isInteger(body.pageSize)) {
      pageSize = Math.min(Math.max(body.pageSize!, 20), 50);
    }
    if (Array.isArray(body.marketplaces)) {
      requestedMarketplaces = body.marketplaces.filter(
        (value): value is string => typeof value === "string",
      );
    }
  }

  if (!process.env.DATABASE_URL)
    return sinkJson(
      check.sink,
      { ok: false, error: "no_database_url" },
      { status: 500 },
    );
  let marketplaces;
  try {
    marketplaces = batchCapturePlan(consent, requestedMarketplaces);
  } catch (error) {
    if (error instanceof Error && error.message === "manual_capture_only") {
      return sinkJson(
        check.sink,
        {
          ok: false,
          error: "manual_capture_only",
          message:
            "A captura do Mercado Livre é exclusivamente manual. Utilize a extensão ou o bookmarklet no navegador.",
        },
        { status: 409 },
      );
    }
    throw error;
  }
  if (marketplaces.length === 0) {
    return sinkJson(
      check.sink,
      { ok: false, error: "no_marketplace_selected" },
      { status: 400 },
    );
  }
  let prepared;
  try {
    prepared = await prepareAccountCapture(check.context, marketplaces, consent);
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "forbidden";
    return sinkJson(check.sink, { ok: false, error: forbidden ? "forbidden" : "capture_preflight_failed" }, { status: forbidden ? 403 : 500 });
  }
  const { enabled, skipped } = prepared;
  if (enabled.length === 0)
    return sinkJson(
      check.sink,
      { ok: false, error: "no_enabled_marketplace", skipped },
      { status: 409 },
    );

  const executor = captureExecutor();
  if (executor === "github") {
    return sinkJson(
      check.sink,
      { ok: false, error: "durable_capture_executor_not_configured" },
      { status: 503 },
    );
  }
  let storedBatch;
  try {
    storedBatch = await captureBatches.create(
      check.context.tenantId,
      enabled,
      pages,
      executor,
      consent,
      check.appUserId,
      {
        planMode: planMode ?? "departments",
        sortOrder: sortOrder ?? "sales",
        pageSize: pageSize ?? 20,
        requestId,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "capture_trial_not_authorized")
      return sinkJson(check.sink,{ok:false,error:error.message,message:"O ensaio de captura não está autorizado para esta conta."},{status:403});
    if (error instanceof Error && ["capture_trial_marketplace_invalid","capture_trial_executor_invalid"].includes(error.message))
      return sinkJson(check.sink,{ok:false,error:error.message,message:"Este ensaio permite somente uma rodagem limitada da Shopee."},{status:409});
    if (error instanceof Error && error.message === "capture_request_conflict")
      return sinkJson(check.sink,{ok:false,error:"capture_request_conflict"},{status:409});
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return sinkJson(
        check.sink,
        {
          ok: false,
          error: "batch_in_progress",
          batch: await captureBatches.publicStatus(),
        },
        { status: 409 },
      );
    }
    return sinkJson(
      check.sink,
      { ok: false, error: "batch_create_failed" },
      { status: 500 },
    );
  }
  if (storedBatch.status !== "running" || storedBatch.metadata.execution?.phase !== "queued") {
    return sinkJson(check.sink,{ok:true,batch:await captureBatches.publicStatus(storedBatch.id),skipped},{status:200});
  }
  try {
    await dispatchCaptureBatch(storedBatch.id, check.context);
  } catch {
    await captureBatches.dispatchFailed(storedBatch.id);
    const batch = await captureBatches.publicStatus(storedBatch.id);
    // The dispatch response can fail after the runner has already claimed the batch.
    if (batch && batch.status !== "error") {
      return sinkJson(
        check.sink,
        { ok: true, batch, skipped },
        { status: 202 },
      );
    }
    return sinkJson(
      check.sink,
      {
        ok: false,
        error: "dispatch_failed",
        batch,
      },
      { status: 502 },
    );
  }
  return sinkJson(
    check.sink,
    {
      ok: true,
      batch: await captureBatches.publicStatus(storedBatch.id),
      skipped,
    },
    { status: 202 },
  );

 });
}
