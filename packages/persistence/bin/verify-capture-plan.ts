/**
 * Verificação derivada das rodadas category-first já persistidas.
 * Somente leitura: não chama marketplace e não altera o catálogo.
 */
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

interface PlannedRunRow {
  id: string;
  marketplace: string;
  started_at: Date;
  status: string;
  items_captured: number;
  items_new: number;
  parameters: Record<string, unknown>;
  observation_rows: number;
  distinct_products: number;
}

try {
  const rows = await sql<PlannedRunRow[]>`
    select run.id, run.marketplace, run.started_at, run.status,
           run.items_captured, run.items_new, run.parameters,
           count(observation.id)::int as observation_rows,
           count(distinct observation.product_id)::int as distinct_products
    from garimpa.capture_run run
    left join garimpa.price_observation observation on observation.capture_run_id = run.id
    where run.tenant_id = 'local'
      and run.parameters ? 'capturePlanId'
    group by run.id
    order by run.started_at desc
    limit 50
  `;

  const malformed = rows.filter((row) => {
    const p = row.parameters;
    return (
      typeof p.capturePlanId !== "string" ||
      typeof p.captureQueryId !== "string" ||
      typeof p.captureMode !== "string" ||
      typeof p.itemsSeen !== "number" ||
      typeof p.itemsSkippedByPolicy !== "number" ||
      typeof p.pagesRead !== "number" ||
      typeof p.saturationDetected !== "boolean"
    );
  });
  const inconsistentObservations = rows.filter(
    (row) => row.observation_rows !== row.distinct_products || row.observation_rows > row.items_captured,
  );

  const report = {
    verifiedAt: new Date().toISOString(),
    status: rows.length === 0 ? "awaiting_real_run" : "verified",
    runs: rows.length,
    marketplaces: [...new Set(rows.map((row) => row.marketplace))],
    saturatedRuns: rows.filter((row) => row.parameters.saturationDetected === true).length,
    itemsSeen: rows.reduce((sum, row) => sum + Number(row.parameters.itemsSeen ?? 0), 0),
    itemsCaptured: rows.reduce((sum, row) => sum + row.items_captured, 0),
    itemsNew: rows.reduce((sum, row) => sum + row.items_new, 0),
    itemsSkippedByPolicy: rows.reduce(
      (sum, row) => sum + Number(row.parameters.itemsSkippedByPolicy ?? 0),
      0,
    ),
    malformedRuns: malformed.map((row) => row.id),
    inconsistentObservationRuns: inconsistentObservations.map((row) => row.id),
    ok: rows.length > 0 && malformed.length === 0 && inconsistentObservations.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await sql.end();
}

