import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

type VerificationRow = {
  external_id: string;
  title: string;
  current_price_cents: number;
  previous_min_price_cents: number | null;
  observation_count: number;
  history_days: number;
  lowest_verified: boolean;
};

/**
 * Prova operacional da regra de menor preço: a última observação nunca entra
 * no mínimo de comparação e a alegação exige 3 registros em ao menos 7 dias.
 */
try {
  const rows = await sql<VerificationRow[]>`
    with latest as (
      select distinct on (product_id) id, product_id, price_cents, observed_at
      from garimpa.price_observation
      where tenant_id = 'local'
      order by product_id, observed_at desc, id desc
    ), stats as (
      select l.product_id,
        count(o.id)::int as observation_count,
        floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int as history_days,
        min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents
      from latest l
      join garimpa.price_observation o on o.product_id = l.product_id and o.tenant_id = 'local'
      group by l.product_id, l.id, l.observed_at
    )
    select p.external_id, p.title, l.price_cents as current_price_cents,
      s.previous_min_price_cents, s.observation_count, s.history_days,
      (s.observation_count >= 3 and s.history_days >= 7 and l.price_cents <= s.previous_min_price_cents) as lowest_verified
    from garimpa.product p
    join latest l on l.product_id = p.id
    join stats s on s.product_id = p.id
    where p.tenant_id = 'local'
    order by lowest_verified desc, p.title
    limit 24
  `;

  const summary = {
    checked: rows.length,
    verifiedLowest: rows.filter((row) => row.lowest_verified).length,
    waitingForHistory: rows.filter((row) => row.history_days < 7).length,
  };
  console.log(JSON.stringify({ summary, rows }, null, 2));
} finally {
  await sql.end();
}
