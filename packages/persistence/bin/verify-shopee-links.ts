/**
 * Verificação derivada do link de saída Shopee (M3, regra da evidência):
 * lê a fonte de verdade (Supabase, schema garimpa) e imprime o estado real
 * das colunas novas e das publications Shopee.
 *
 * Uso: npm run verify:shopee-links   (usa DATABASE_URL de ../web/.env.local)
 *
 * Só roda após a migration `20260826080000_garimpa_publication_shopee_link.sql`
 * ser aplicada.
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

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

// 1. Colunas novas existem de fato.
const columns = await sql<{ column_name: string }[]>`
  select column_name
  from information_schema.columns
  where table_schema = 'garimpa' and table_name = 'publication'
    and column_name in ('affiliate_url', 'affiliate_url_generated_at')
`;
const colSet = new Set(columns.map((c) => c.column_name));
check(colSet.has("affiliate_url"), "garimpa.publication.affiliate_url existe");
check(colSet.has("affiliate_url_generated_at"), "garimpa.publication.affiliate_url_generated_at existe");

// 2. Estado real das publications Shopee.
const rows = await sql<{
  id: string;
  slug: string;
  affiliate_id: string;
  affiliate_url: string | null;
  affiliate_url_generated_at: string | null;
}[]>`
  select pub.id, pub.slug, pub.affiliate_id, pub.affiliate_url, pub.affiliate_url_generated_at::text
  from garimpa.publication pub
  join garimpa.product p on p.id = pub.product_id
  where p.marketplace = 'shopee'
  order by pub.published_at desc
`;

const withLink = rows.filter((r) => r.affiliate_url !== null);
const withoutLink = rows.filter((r) => r.affiliate_url === null);

console.log("\n=== Publications Shopee (fonte: banco) ===");
console.log(`total:             ${rows.length}`);
console.log(`com affiliate_url: ${withLink.length}`);
console.log(`sem affiliate_url: ${withoutLink.length}`);

for (const r of withLink.slice(0, 10)) {
  check(r.affiliate_url_generated_at !== null, `${r.slug}: affiliate_url_generated_at presente quando affiliate_url existe`);
  check(/^https?:\/\//.test(r.affiliate_url ?? ""), `${r.slug}: affiliate_url é uma URL http(s)`);
}

if (withoutLink.length > 0) {
  console.log("\npublications sem link ainda (esperado até a próxima rodagem de sweep-shopee gerar):");
  for (const r of withoutLink.slice(0, 10)) console.log(`  ${r.slug} (affiliate_id=${r.affiliate_id})`);
}

await sql.end();
console.log(failures === 0 ? "\nTodos os checks passaram." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
