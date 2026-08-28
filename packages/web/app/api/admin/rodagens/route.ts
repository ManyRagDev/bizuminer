import { NextRequest } from "next/server";
import { captureRuns, runningRun } from "../../../../lib/admin-db";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Histórico de rodagens para o polling do painel — só o dono (AL-3, 22/08).
 * `?marketplace=shopee` filtra a listagem por plataforma (M1); sem o
 * parâmetro, devolve todas — comportamento anterior preservado.
 */
export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const marketplace = request.nextUrl.searchParams.get("marketplace")?.trim() || undefined;
  try {
    const [runs, running] = await Promise.all([
      captureRuns(20, "local", marketplace),
      runningRun("local", marketplace),
    ]);
    return sinkJson(
      check.sink,
      { ok: true, runs, runningId: running?.id ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
