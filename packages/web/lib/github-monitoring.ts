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
  skips: Array<{ marketplace: string; reason: string }>;
}

/** Histórico do agendador. O token é opcional enquanto o repositório for público. */
export async function githubMonitoringRuns(): Promise<GithubMonitoringRun[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_ACTIONS_READ_TOKEN ?? process.env.GITHUB_ACTIONS_WRITE_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=20`,
    { headers, next: { revalidate: 30 } },
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
    skips: [] as GithubMonitoringRun["skips"],
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
    try {
      const skips = await sql<{ github_run_id: string; marketplace: string; reason: string }[]>`
        select github_run_id, marketplace, reason
        from garimpa.affiliate_monitoring_skip
        where affiliate_id = 'aff_local' and github_run_id = any(${ids}::text[])
      `;
      for (const skip of skips) {
        byId.get(skip.github_run_id)?.skips.push({
          marketplace: skip.marketplace, reason: skip.reason,
        });
      }
    } catch (error) {
      // Compatibilidade enquanto a migration de política não foi aplicada.
      if ((error as { code?: string }).code !== "42P01") throw error;
    }
    return runs;
  } finally {
    await sql.end();
  }
}
