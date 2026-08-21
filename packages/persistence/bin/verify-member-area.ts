/**
 * Verificação derivada da área do comprador (regra da evidência):
 * lê a fonte de verdade (Supabase, schema garimpa) e imprime o estado real
 * das tabelas app_user, favorite, price_watch, buyer_profile e subscriber.
 *
 * Uso: npm run verify:member-area   (usa DATABASE_URL de ../web/.env.local)
 */

import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 1,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const EXPECTED: Record<string, string[]> = {
  app_user: ["id", "tenant_id", "auth_user_id", "display_name", "email", "created_at", "last_seen_at"],
  favorite: ["id", "tenant_id", "user_id", "product_id", "created_at"],
  price_watch: [
    "id", "tenant_id", "user_id", "product_id", "baseline_price_cents",
    "target_price_cents", "active", "created_at", "deactivated_at",
  ],
  buyer_profile: ["user_id", "tenant_id", "preferred_categories", "price_band", "updated_at"],
  subscriber: ["id", "tenant_id", "email", "source", "consented_at", "created_at"],
};

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

// 1. Estrutura: tabelas e colunas esperadas existem de fato.
const columns = await sql<{ table_name: string; column_name: string }[]>`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'garimpa'
    and table_name in ('app_user', 'favorite', 'price_watch', 'buyer_profile', 'subscriber')
`;
const byTable = new Map<string, Set<string>>();
for (const row of columns) {
  if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
  byTable.get(row.table_name)!.add(row.column_name);
}
for (const [table, expected] of Object.entries(EXPECTED)) {
  const actual = byTable.get(table);
  const missing = actual ? expected.filter((col) => !actual.has(col)) : expected;
  check(missing.length === 0, `garimpa.${table} com colunas esperadas${missing.length ? ` (faltam: ${missing.join(", ")})` : ""}`);
}

// 2. Restrições que o contrato exige.
const constraints = await sql<{ conname: string }[]>`
  select conname from pg_constraint
  where conname in ('favorite_user_id_product_id_key', 'price_watch_user_id_product_id_key', 'buyer_profile_price_band_check')
`;
const names = new Set(constraints.map((row) => row.conname));
check(names.has("favorite_user_id_product_id_key"), "favorito único por (user_id, product_id)");
check(names.has("price_watch_user_id_product_id_key"), "acompanhamento único por (user_id, product_id)");
check(names.has("buyer_profile_price_band_check"), "price_band restrito aos valores do contrato");

// 3. Estado real: contagens e amostras com identificadores conferíveis.
const [counts] = await sql<Array<Record<string, number>>>`
  select
    (select count(*)::int from garimpa.app_user) as users,
    (select count(*)::int from garimpa.favorite) as favorites,
    (select count(*)::int from garimpa.price_watch) as watches,
    (select count(*)::int from garimpa.price_watch where active) as active_watches,
    (select count(*)::int from garimpa.buyer_profile) as profiles,
    (select count(*)::int from garimpa.subscriber) as subscribers
`;
console.log("\n=== Contagens (fonte: banco) ===");
console.log(`app_user:      ${counts.users}`);
console.log(`favorite:      ${counts.favorites}`);
console.log(`price_watch:   ${counts.watches} (${counts.active_watches} ativos)`);
console.log(`buyer_profile: ${counts.profiles}`);
console.log(`subscriber:    ${counts.subscribers}`);

const favorites = await sql<{ user_id: string; product_id: string; title: string; created_at: string }[]>`
  select f.user_id, f.product_id, p.title, f.created_at::text
  from garimpa.favorite f join garimpa.product p on p.id = f.product_id
  order by f.created_at desc limit 5
`;
if (favorites.length) {
  console.log("\n=== Últimos favoritos ===");
  for (const row of favorites) {
    console.log(`${row.created_at}  user=${row.user_id.slice(0, 8)}…  produto=${row.product_id.slice(0, 8)}…  ${row.title.slice(0, 60)}`);
  }
}

const watches = await sql<Array<{ user_id: string; title: string; baseline_price_cents: number; active: boolean; created_at: string }>>`
  select w.user_id, p.title, w.baseline_price_cents, w.active, w.created_at::text
  from garimpa.price_watch w join garimpa.product p on p.id = w.product_id
  order by w.created_at desc limit 5
`;
if (watches.length) {
  console.log("\n=== Últimos acompanhamentos ===");
  for (const row of watches) {
    console.log(`${row.created_at}  user=${row.user_id.slice(0, 8)}…  baseline=R$${(row.baseline_price_cents / 100).toFixed(2)}  ativo=${row.active}  ${row.title.slice(0, 55)}`);
  }
}

// 4. Invariante: baseline de acompanhamento sempre corresponde a uma observação real do produto.
const [orphans] = await sql<Array<{ bad: number }>>`
  select count(*)::int as bad
  from garimpa.price_watch w
  where not exists (
    select 1 from garimpa.price_observation o
    where o.product_id = w.product_id and o.price_cents = w.baseline_price_cents
  )
`;
check(orphans.bad === 0, `baseline de todo acompanhamento existe como observação real (violações: ${orphans.bad})`);

await sql.end();
console.log(failures === 0 ? "\nTodos os checks passaram." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
