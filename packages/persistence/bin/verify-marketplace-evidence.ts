import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const rows = await sql<{
    external_id: string;
    rating_star: number | null;
    sales_label: string | null;
    observed_at: Date;
  }[]>`
    select p.external_id, o.rating_star, o.sales_label, o.observed_at
    from garimpa.price_observation o
    join garimpa.product p on p.id = o.product_id
    where o.rating_star is not null or o.sales_label is not null
    order by o.observed_at desc
    limit 20
  `;
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
