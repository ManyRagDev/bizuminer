import "server-only";

import { db } from "./db";

const REPOSITORY = "ManyRagDev/bizuminer";
const WORKFLOW = "monitor-prices.yml";

export interface GithubMonitoringRun {
  id: number;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  captures: Array<{
    marketplace: string;
    status: string;
    attempted: number;
    matched: number;
    missing: number;
    failed: number;
    priceChanges: number;
  }>;
}

/** Histórico do agendador. O token é opcional enquanto o repositório for público. */
export async function githubMonitoringRuns(): Promise<GithubMonitoringRun[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_ACTIONS_READ_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_ACTIONS_READ_TOKEN}`;
  }
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=20`,
    { headers, next: { revalidate: 300 } },
  );
  if (!response.ok) throw new Error(`github_actions_http_${response.status}`);
  const payload = await response.json() as {
    workflow_runs?: Array<{
      id: number;
      event: string;
      status: string;
      conclusion: string | null;
      created_at: string;
      updated_at: string;
    }>;
  };
  const runs = (payload.workflow_runs ?? []).map((run) => ({
    id: run.id,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: `https://github.com/${REPOSITORY}/actions/runs/${run.id}`,
    captures: [] as GithubMonitoringRun["captures"],
  }));
  if (runs.length === 0) return runs;

  const sql = db();
  try {
    const ids = runs.map((run) => String(run.id));
    const captures = await sql<{
      github_run_id: string;
      marketplace: string;
      status: string;
      attempted: number;
      matched: number;
      missing: number;
      failed: number;
      price_changes: number;
    }[]>`
      select parameters ->> 'githubRunId' as github_run_id,
             marketplace, status,
             coalesce((parameters ->> 'attempted')::int, 0) as attempted,
             coalesce((parameters ->> 'matched')::int, 0) as matched,
             coalesce((parameters ->> 'missing')::int, 0) as missing,
             coalesce((parameters ->> 'failed')::int, 0) as failed,
             price_changes
      from garimpa.capture_run
      where tenant_id = 'local'
        and parameters ->> 'captureMode' = 'monitoring'
        and parameters ->> 'githubRunId' = any(${ids}::text[])
    `;
    const byId = new Map(runs.map((run) => [String(run.id), run]));
    for (const capture of captures) {
      byId.get(capture.github_run_id)?.captures.push({
        marketplace: capture.marketplace,
        status: capture.status,
        attempted: capture.attempted,
        matched: capture.matched,
        missing: capture.missing,
        failed: capture.failed,
        priceChanges: capture.price_changes,
      });
    }
    return runs;
  } finally {
    await sql.end();
  }
}
