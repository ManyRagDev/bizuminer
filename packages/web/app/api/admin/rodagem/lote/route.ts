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
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  }
  let pages = 1;
  let consent = false;
  let requestedMarketplaces: string[] | undefined;
  try {
    const body = (await request.json()) as {
      pages?: number;
      consent?: boolean;
      marketplaces?: unknown;
    };
    if (Number.isInteger(body.pages))
      pages = Math.min(Math.max(body.pages!, 1), MAX_PAGES);
    consent = body.consent === true;
    if (Array.isArray(body.marketplaces)) {
      requestedMarketplaces = body.marketplaces.filter(
        (value): value is string => typeof value === "string",
      );
    }
  } catch {
    /* corpo vazio usa o padrão seguro */
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
  if (executor === "github" && !process.env.GITHUB_ACTIONS_WRITE_TOKEN) {
    return sinkJson(
      check.sink,
      { ok: false, error: "github_token_not_configured" },
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
    );
  } catch (error) {
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
