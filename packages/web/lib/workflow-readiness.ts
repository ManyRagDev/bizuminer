import { db } from "./db.ts";
import { commercialRolloutReady } from "./commercial-rollout.ts";
/** Compatibility probe, not an authorization check. Call only after session/account resolution. */
export async function verifiedWorkflowsReady(factory: typeof db = db) {
  const sql = factory();
  try {
    const [r] = await sql<
      { ready: boolean }[]
    >`select to_regclass('garimpa.private_artifact') is not null and to_regclass('garimpa.governance_decision') is not null and to_regclass('garimpa.dispatch_control') is not null as ready`;
    return r?.ready === true && await commercialRolloutReady(sql);
  } finally {
    await sql.end();
  }
}
