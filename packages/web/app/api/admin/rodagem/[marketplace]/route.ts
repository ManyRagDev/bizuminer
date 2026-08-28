import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { runningRun } from "../../../../../lib/admin-db";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";
import { captureTriggerFor } from "../../../../../lib/capture-triggers";

export const runtime = "nodejs";

const MAX_PAGES = 3;

/**
 * Aciona uma rodagem de plataforma que não seja o Mercado Livre (Shopee,
 * depois AliExpress). O ML tem rota própria (`/api/admin/rodagem`, sem
 * parâmetro) e não passa por aqui — M-R1.
 *
 * Mesmo desenho da rota do ML: quem registra o `capture_run` é o próprio
 * CLI (`sweep-shopee.ts` etc.), não esta rota. Se o processo morrer antes do
 * primeiro insert, nenhuma linha aparece e o painel mostra o vazio.
 *
 * Só o dono (ADMIN_EMAIL) aciona.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketplace: string }> }) {
  const { marketplace } = await params;

  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const trigger = captureTriggerFor(marketplace);
  if (!trigger) {
    return sinkJson(check.sink, { ok: false, error: "unknown_marketplace" }, { status: 404 });
  }

  if (!trigger.enabled()) {
    return sinkJson(
      check.sink,
      { ok: false, error: `${marketplace}_capture_disabled`, message: trigger.disabledMessage },
      { status: 409 },
    );
  }

  let pages = 1;
  try {
    const body = (await request.json()) as { pages?: number };
    if (typeof body.pages === "number" && Number.isInteger(body.pages)) {
      pages = Math.min(Math.max(body.pages, 1), MAX_PAGES);
    }
  } catch {
    // corpo vazio = 1 página
  }

  try {
    const active = await runningRun("local", marketplace);
    if (active) {
      return sinkJson(
        check.sink,
        { ok: false, error: "run_in_progress", runId: active.id },
        { status: 409 },
      );
    }
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }

  if (!process.env.DATABASE_URL) {
    return sinkJson(check.sink, { ok: false, error: "no_database_url" }, { status: 500 });
  }

  const persistenceDir = path.resolve(process.cwd(), "..", "persistence");
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", trigger.cliRelativePath, "--pages", String(pages)],
      {
        cwd: persistenceDir,
        env: process.env,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
  } catch {
    return sinkJson(check.sink, { ok: false, error: "spawn_failed" }, { status: 500 });
  }

  return sinkJson(check.sink, { ok: true, pages }, { status: 202 });
}
