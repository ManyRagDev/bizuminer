import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { runningRun } from "../../../../lib/admin-db";

export const runtime = "nodejs";

const MAX_PAGES = 3;

/**
 * Aciona uma rodagem do robô: dispara o CLI real (`packages/persistence/bin/sweep.ts`)
 * como processo separado. Quem registra a execução é o próprio sweep — o
 * capture_run nasce `running` antes da busca e fecha como ok/erro (fluxo
 * auditável de 18/08). Esta rota não inventa registro nenhum: se o processo
 * morrer antes do primeiro insert, nenhuma linha aparece e o painel avisa.
 *
 * Sem autenticação por decisão registrada (plano-area-logada.md, AD-1):
 * uso local apenas; gate de acesso é bloqueio duro antes do deploy público.
 */
export async function POST(request: NextRequest) {
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
      return Response.json(
        { ok: false, error: "run_in_progress", runId: active.id },
        { status: 409 },
      );
    }
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: "no_database_url" }, { status: 500 });
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
    return Response.json({ ok: false, error: "spawn_failed" }, { status: 500 });
  }

  return Response.json({ ok: true, pages }, { status: 202 });
}
