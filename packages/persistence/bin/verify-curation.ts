/**
 * Evidência derivada da curadoria após a migration ser aplicada.
 * Somente leitura: não cria produto de teste nem altera decisões reais.
 */

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL ausente");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const [schema] = await sql<{
    current_table: string | null;
    event_table: string | null;
    trigger_name: string | null;
  }[]>`
    select
      to_regclass('garimpa.product_curation')::text as current_table,
      to_regclass('garimpa.curation_event')::text as event_table,
      (select tgname from pg_trigger
       where tgrelid = 'garimpa.product'::regclass
         and tgname = 'product_seed_curation' and not tgisinternal) as trigger_name
  `;

  const [integrity] = await sql<{
    products: number;
    states: number;
    orphan_products: number;
    orphan_states: number;
    malformed_other: number;
  }[]>`
    select
      (select count(*)::int from garimpa.product) as products,
      (select count(*)::int from garimpa.product_curation) as states,
      (select count(*)::int
       from garimpa.product p
       left join garimpa.product_curation c
         on c.product_id = p.id and c.tenant_id = p.tenant_id
       where c.product_id is null) as orphan_products,
      (select count(*)::int
       from garimpa.product_curation c
       left join garimpa.product p
         on p.id = c.product_id and p.tenant_id = c.tenant_id
       where p.id is null) as orphan_states,
      (select count(*)::int
       from garimpa.curation_event
       where reason_code = 'other'
         and (reason_detail is null or char_length(btrim(reason_detail)) < 3)) as malformed_other
  `;

  const statuses = await sql<{ status: string; count: number }[]>`
    select status, count(*)::int as count
    from garimpa.product_curation
    group by status
    order by status
  `;

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), schema, integrity, statuses }, null, 2));
  if (!schema?.current_table || !schema.event_table || !schema.trigger_name) process.exitCode = 1;
  if (!integrity || integrity.products !== integrity.states || integrity.orphan_products !== 0 || integrity.orphan_states !== 0 || integrity.malformed_other !== 0) process.exitCode = 1;
} finally {
  await sql.end();
}
