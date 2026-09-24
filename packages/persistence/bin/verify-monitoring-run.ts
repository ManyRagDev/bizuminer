/** Verifica um piloto de retenção gravado, sem expor dados comerciais ou credenciais. */
import postgres from "postgres";

const runIds = process.argv.slice(2);
if (runIds.length === 0 || runIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error("informe um ou mais IDs de capture_run");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");
const sql = postgres(connectionString, { prepare: false, max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });

try {
  const rows = await sql<Array<{
    run_id: string; marketplace: string; status: string; items_captured: number;
    parameters: Record<string, unknown>; observations: number; mismatched_tenants: number;
    mismatched_latest: number; without_previous: number;
  }>>`
    select run.id as run_id, run.marketplace, run.status, run.items_captured, run.parameters,
      count(obs.id)::int as observations,
      count(obs.id) filter (where obs.tenant_id <> p.tenant_id or p.marketplace <> run.marketplace)::int as mismatched_tenants,
      count(obs.id) filter (where p.last_capture_run_id <> run.id or p.last_price_cents <> obs.price_cents)::int as mismatched_latest,
      count(obs.id) filter (where not exists (
        select 1 from garimpa.price_observation old
        where old.product_id = obs.product_id and old.tenant_id = obs.tenant_id
          and old.id <> obs.id and old.observed_at < obs.observed_at
      ))::int as without_previous
    from garimpa.capture_run run
    left join garimpa.price_observation obs on obs.capture_run_id = run.id
    left join garimpa.product p on p.id = obs.product_id
    where run.id = any(${runIds})
    group by run.id
  `;
  const verified = rows.length === runIds.length && rows.every((row) =>
    row.status === "ok" && row.items_captured === 1 && row.observations === 1
    && row.parameters.captureMode === "monitoring" && row.parameters.matched === 1
    && row.mismatched_tenants === 0 && row.mismatched_latest === 0 && row.without_previous === 0);
  console.log(JSON.stringify({ verified, runs: rows.map((row) => ({
    marketplace: row.marketplace, status: row.status, observations: row.observations,
    matched: row.parameters.matched, mismatchedTenants: row.mismatched_tenants,
    mismatchedLatest: row.mismatched_latest, withoutPrevious: row.without_previous,
  })) }, null, 2));
  if (!verified) process.exitCode = 1;
} finally {
  await sql.end();
}
