import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { runningRun } from "../../../../lib/admin-db";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";
import { mlAutomatedCaptureEnabled } from "../../../../lib/automated-capture";

export const runtime = "nodejs";

const MAX_PAGES = 3;

/**
 * Aciona uma rodagem do robô: dispara o CLI real (`packages/persistence/bin/sweep.ts`)
 * como processo separado. Quem registra a execução é o próprio sweep — o
 * capture_run nasce `running` antes da busca e fecha como ok/erro (fluxo
 * auditável de 18/08). Esta rota não inventa registro nenhum: se o processo
 * morrer antes do primeiro insert, nenhuma linha aparece e o painel avisa.
 *
 * Só o dono (ADMIN_EMAIL) aciona — o painel é exclusivo dele (AL-3, 22/08).
 */
export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  // Kill switch E0: a rodagem automatizada do ML é bloqueada por default.
  // Responder erro de domínio estável (não stack trace) e NÃO simular rodagem.
  if (!mlAutomatedCaptureEnabled()) {
    return sinkJson(
      check.sink,
      {
        ok: false,
        error: "ml_automated_capture_disabled",
        message:
          "A varredura automatizada do Mercado Livre está desligada. Use a captura manual (bookmarklet) no painel.",
      },
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
    const active = await runningRun();
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
      ["--experimental-strip-types", "bin/sweep.ts", "--pages", String(pages)],
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
