import { captureRuns, runningRun } from "../../../../lib/admin-db";

export const dynamic = "force-dynamic";

/** Histórico de rodagens para o polling do painel. */
export async function GET() {
  try {
    const [runs, running] = await Promise.all([captureRuns(20), runningRun()]);
    return Response.json(
      { ok: true, runs, runningId: running?.id ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
