import { NextRequest } from "next/server";
import { captureRuns, runningRun } from "../../../../lib/admin-db";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

/** Histórico de rodagens para o polling do painel — só o dono (AL-3, 22/08). */
export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const [runs, running] = await Promise.all([captureRuns(20), runningRun()]);
    return sinkJson(
      check.sink,
      { ok: true, runs, runningId: running?.id ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
