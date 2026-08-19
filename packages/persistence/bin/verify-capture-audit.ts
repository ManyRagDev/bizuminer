import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

interface AuditRow {
  id: string;
  collector_run_id: string | null;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  parameters: Record<string, unknown>;
  items_captured: number;
  observation_rows: number;
  distinct_products: number;
  incomplete_snapshots: number;
  products_not_marked_as_seen: number;
}

try {
  const rows = await sql<AuditRow[]>`
    with latest as (
      select *
      from garimpa.capture_run
      where tenant_id = 'local'
        and marketplace = 'mercadolivre'
        and collector_run_id is not null
      order by started_at desc
      limit 1
    )
    select latest.id, latest.collector_run_id, latest.status, latest.started_at,
           latest.finished_at, latest.parameters, latest.items_captured,
           count(observation.id)::int as observation_rows,
           count(distinct observation.product_id)::int as distinct_products,
           count(*) filter (
             where observation.id is not null
               and (observation.title_snapshot is null or observation.product_url_snapshot is null)
           )::int as incomplete_snapshots,
           count(*) filter (
             where observation.id is not null
               and product.last_capture_run_id is distinct from latest.id
           )::int as products_not_marked_as_seen
    from latest
    left join garimpa.price_observation observation on observation.capture_run_id = latest.id
    left join garimpa.product product on product.id = observation.product_id
    group by latest.id, latest.collector_run_id, latest.status, latest.started_at,
             latest.finished_at, latest.parameters, latest.items_captured
  `;

  const audit = rows[0];
  if (!audit) throw new Error("nenhuma captura com proveniência encontrada");
  const checks = {
    completed: audit.status === "ok" && audit.finished_at !== null,
    hasObservations: audit.observation_rows > 0,
    oneObservationPerProduct: audit.observation_rows === audit.distinct_products,
    observationsDoNotExceedCapturedItems: audit.observation_rows <= audit.items_captured,
    normalizedSnapshotComplete: audit.incomplete_snapshots === 0,
    productSeenStateConsistent: audit.products_not_marked_as_seen === 0,
  };
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    verifiedAt: new Date().toISOString(),
    run: {
      id: audit.id,
      collectorRunId: audit.collector_run_id,
      status: audit.status,
      startedAt: audit.started_at,
      finishedAt: audit.finished_at,
      parameters: audit.parameters,
      itemsCaptured: audit.items_captured,
      observationRows: audit.observation_rows,
      distinctProducts: audit.distinct_products,
    },
    checks,
    ok,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await sql.end();
}
