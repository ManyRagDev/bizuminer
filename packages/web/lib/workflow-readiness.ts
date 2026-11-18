import { db } from "./db.ts";

export type VerifiedWorkflowsStatus = "ready" | "schema_missing" | "rollout_disabled";

/** Compatibility diagnostic, not authorization. Call only after session/account resolution. */
export async function verifiedWorkflowsStatus(factory: typeof db = db): Promise<VerifiedWorkflowsStatus> {
  const sql = factory();
  try {
    const [schema] = await sql<{ ready: boolean }[]>`
      select to_regclass('garimpa.private_artifact') is not null
        and to_regclass('garimpa.governance_decision') is not null
        and to_regclass('garimpa.dispatch_control') is not null
        and to_regprocedure('garimpa.commercial_rollout_ready()') is not null as ready`;
    if (schema?.ready !== true) return "schema_missing";
    const [rollout] = await sql<{ ready: boolean }[]>`select garimpa.commercial_rollout_ready() as ready`;
    return rollout?.ready === true ? "ready" : "rollout_disabled";
  } finally {
    await sql.end();
  }
}

/** Existing callers retain the same fail-closed boolean gate. */
export async function verifiedWorkflowsReady(factory: typeof db = db): Promise<boolean> {
  return await verifiedWorkflowsStatus(factory) === "ready";
}
