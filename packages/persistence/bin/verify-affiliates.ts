/**
 * Verificação derivada da fundação de afiliados (E1, regra da evidência):
 * lê a fonte de verdade (Supabase, schema garimpa) e imprime o estado real das
 * tabelas affiliate_account, affiliate_membership e affiliate_marketplace_config.
 *
 * Uso: npm run verify:affiliates   (usa DATABASE_URL de ../web/.env.local)
 *
 * Só roda após a migration `20260826010000_garimpa_affiliates.sql` ser
 * aplicada. Nunca imprime tracking_id/tool_id.
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
  affiliate_account: ["id", "tenant_id", "public_slug", "display_name", "status", "created_at", "updated_at"],
  affiliate_membership: ["affiliate_id", "app_user_id", "role", "created_at"],
  affiliate_marketplace_config: [
    "id", "affiliate_id", "marketplace", "tracking_id", "tool_id",
    "status", "validated_at", "created_at", "updated_at",
  ],
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
    and table_name in ('affiliate_account', 'affiliate_membership', 'affiliate_marketplace_config')
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
  where conname in (
    'affiliate_account_tenant_id_key',
    'affiliate_account_public_slug_key',
    'affiliate_marketplace_config_affiliate_id_marketplace_key',
    'affiliate_account_public_slug_check'
  )
`;
const names = new Set(constraints.map((row) => row.conname));
check(names.has("affiliate_account_tenant_id_key"), "tenant_id único por conta");
check(names.has("affiliate_account_public_slug_key"), "public_slug único");
check(names.has("affiliate_marketplace_config_affiliate_id_marketplace_key"), "config única por (affiliate_id, marketplace)");
check(names.has("affiliate_account_public_slug_check"), "public_slug restrito a [a-z0-9-]{4,32}");

// 3. Bootstrap da casa.
const [house] = await sql<{ id: string; tenant_id: string; public_slug: string; status: string }[]>`
  select id, tenant_id, public_slug, status
  from garimpa.affiliate_account
  where id = 'aff_local'
`;
if (!house) {
  console.error("FAIL  garimpa.affiliate_account sem 'aff_local'");
  failures += 1;
} else {
  check(house.tenant_id === "local", `aff_local aponta para tenant_id=local (atual: ${house.tenant_id})`);
  check(house.public_slug === "bizuminer", `slug reservado da casa (atual: ${house.public_slug})`);
  console.log(`       aff_local: tenant=${house.tenant_id} slug=${house.public_slug} status=${house.status}`);
}

// 4. Estado real: contagens.
const [counts] = await sql<Array<Record<string, number>>>`
  select
    (select count(*)::int from garimpa.affiliate_account) as accounts,
    (select count(*)::int from garimpa.affiliate_membership) as memberships,
    (select count(*)::int from garimpa.affiliate_membership where role = 'owner') as owners,
    (select count(*)::int from garimpa.affiliate_marketplace_config) as configs
`;
if (!counts) throw new Error("consulta de contagens não retornou linha");
console.log("\n=== Contagens (fonte: banco) ===");
console.log(`affiliate_account:            ${counts.accounts}`);
console.log(`affiliate_membership:         ${counts.memberships} (${counts.owners} owner(s))`);
console.log(`affiliate_marketplace_config: ${counts.configs}`);

// 5. Configs: sem imprimir valores, apenas presença/status.
const configs = await sql<{ marketplace: string; status: string; validated_at: string | null }[]>`
  select marketplace, status, validated_at::text
  from garimpa.affiliate_marketplace_config
  order by marketplace
`;
for (const c of configs) {
  console.log(`config ${c.marketplace}: status=${c.status} validated_at=${c.validated_at ?? "null"}`);
}

await sql.end();
console.log(failures === 0 ? "\nTodos os checks passaram." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
