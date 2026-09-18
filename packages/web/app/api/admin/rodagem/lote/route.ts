import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { captureBatchStatus, createCaptureBatch, latestCaptureBatch, runningRun } from "../../../../../lib/admin-db";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";
import { mlCaptureAllowedWithConsent } from "../../../../../lib/automated-capture";
import { batchCapturePlan } from "../../../../../lib/batch-capture-plan";
import { captureTriggerFor } from "../../../../../lib/capture-triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 3;

export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return sinkJson(check.sink, { ok: false, error: "missing_batch_id" }, { status: 400 });
  try {
    const batch = await captureBatchStatus(id);
    return batch
      ? sinkJson(check.sink, { ok: true, batch }, { headers: { "Cache-Control": "no-store" } })
      : sinkJson(check.sink, { ok: false, error: "not_found" }, { status: 404 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "migration_required_or_server_error" }, { status: 500 });
  }
}

/** Dispara as duas lojas padrão; ML entra somente com consentimento explícito. */
export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  let pages = 1;
  let consent = false;
  let requestedMarketplaces: string[] | undefined;
  try {
    const body = (await request.json()) as { pages?: number; consent?: boolean; marketplaces?: unknown };
    if (Number.isInteger(body.pages)) pages = Math.min(Math.max(body.pages!, 1), MAX_PAGES);
    consent = body.consent === true;
    if (Array.isArray(body.marketplaces)) {
      requestedMarketplaces = body.marketplaces.filter((value): value is string => typeof value === "string");
    }
  } catch { /* corpo vazio usa o padrão seguro */ }

  if (!process.env.DATABASE_URL) return sinkJson(check.sink, { ok: false, error: "no_database_url" }, { status: 500 });
  const marketplaces = batchCapturePlan(consent, requestedMarketplaces);
  if (marketplaces.length === 0) {
    return sinkJson(check.sink, { ok: false, error: "no_marketplace_selected" }, { status: 400 });
  }
  const enabled: string[] = [];
  const skipped: Array<{ marketplace: string; reason: string }> = [];
  for (const marketplace of marketplaces) {
    if (marketplace === "mercadolivre") {
      if (mlCaptureAllowedWithConsent(consent)) enabled.push(marketplace);
      else skipped.push({ marketplace, reason: "consent_required" });
      continue;
    }
    const trigger = captureTriggerFor(marketplace);
    if (trigger?.enabled()) enabled.push(marketplace);
    else skipped.push({ marketplace, reason: "capture_disabled" });
  }
  if (enabled.length === 0) return sinkJson(check.sink, { ok: false, error: "no_enabled_marketplace", skipped }, { status: 409 });

  try {
    const activeBatch = await latestCaptureBatch();
    if (activeBatch?.status === "running") return sinkJson(check.sink, { ok: false, error: "batch_in_progress", batch: activeBatch }, { status: 409 });
    const active = await Promise.all(enabled.map((marketplace) => runningRun("local", marketplace)));
    if (active.some(Boolean)) return sinkJson(check.sink, { ok: false, error: "run_in_progress" }, { status: 409 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "migration_required_or_server_error" }, { status: 500 });
  }

  let batch;
  try {
    batch = await createCaptureBatch("local", enabled, pages);
  } catch {
    return sinkJson(check.sink, { ok: false, error: "batch_create_failed" }, { status: 500 });
  }
  const persistenceDir = path.resolve(process.cwd(), "..", "persistence");
  try {
    for (const marketplace of enabled) {
      const script = marketplace === "mercadolivre" ? "bin/sweep.ts" : captureTriggerFor(marketplace)!.cliRelativePath;
      const child = spawn(process.execPath, ["--experimental-strip-types", script, "--pages", String(pages), "--operation-batch", batch.id], {
        cwd: persistenceDir, env: process.env, detached: true, stdio: "ignore", windowsHide: true,
      });
      child.unref();
    }
  } catch {
    return sinkJson(check.sink, { ok: false, error: "spawn_failed", batch }, { status: 500 });
  }
  return sinkJson(check.sink, { ok: true, batch, skipped }, { status: 202 });
}
