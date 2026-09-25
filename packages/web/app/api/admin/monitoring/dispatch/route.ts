import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";

export const runtime = "nodejs";

const API = "https://api.github.com/repos/ManyRagDev/bizuminer/actions/workflows/monitor-prices.yml";
const REPOSITORY = "ManyRagDev/bizuminer";

/** Dispara a reconsulta da casa no GitHub. O token nunca chega ao navegador. */
export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return sinkJson(check.sink, { ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const token = process.env.GITHUB_ACTIONS_WRITE_TOKEN;
  if (!token) {
    return sinkJson(check.sink, { ok: false, error: "github_token_not_configured" }, { status: 503 });
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  try {
    const current = await fetch(`${API}/runs?per_page=5`, { headers, cache: "no-store" });
    if (!current.ok) throw new Error(`github_runs_http_${current.status}`);
    const history = await current.json() as { workflow_runs?: Array<{ status: string }> };
    if (history.workflow_runs?.some((run) => run.status !== "completed")) {
      return sinkJson(check.sink, { ok: false, error: "run_in_progress" }, { status: 409 });
    }

    const response = await fetch(`${API}/dispatches`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }), cache: "no-store",
    });
    if (!response.ok) throw new Error(`github_dispatch_http_${response.status}`);
    const data = response.status === 200
      ? await response.json() as { workflow_run_id?: number }
      : {};
    const url = data.workflow_run_id
      ? `https://github.com/${REPOSITORY}/actions/runs/${data.workflow_run_id}`
      : `https://github.com/${REPOSITORY}/actions/workflows/monitor-prices.yml`;
    return sinkJson(check.sink, { ok: true, url }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "github_dispatch_failed" }, { status: 502 });
  }
}
