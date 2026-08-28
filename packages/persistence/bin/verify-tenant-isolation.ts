/**
 * Verificação derivada de isolamento por tenant (E2, regra da evidência).
 *
 * Prova no banco real, com fixtures descartáveis, que:
 *   1. um tenant sem affiliate_account é rejeitado (FK tenant_id -> conta);
 *   2. uma relação entre tabelas de tenants distintos falha (FK composta);
 *   3. leitura/escrita dentro do mesmo tenant funcionam.
 *
 * Uso: npm run verify:tenant-isolation   (usa DATABASE_URL de ../web/.env.local)
 *
 * Só roda após as migrations de E1/E2 serem aplicadas. Cria contas de teste
 * `aff_test_a`/`aff_test_b` e as remove ao final (limpeza conferida no próprio
 * script). NUNCA imprime credencial.
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

const A = "aff_test_a";
const B = "aff_test_b";
const TA = "testa";
const TB = "testb";

async function cleanup() {
  await sql`delete from garimpa.price_observation where tenant_id in (${TA}, ${TB})`;
  await sql`delete from garimpa.product where tenant_id in (${TA}, ${TB})`;
  await sql`delete from garimpa.affiliate_account where id in (${A}, ${B})`;
}

try {
  await cleanup();

  // Fixtures: duas contas de teste.
  await sql`
    insert into garimpa.affiliate_account (id, tenant_id, public_slug, display_name)
    values (${A}, ${TA}, ${TA}, 'Teste A'), (${B}, ${TB}, ${TB}, 'Teste B')
  `;

  // 1. Escrita dentro do mesmo tenant funciona.
  const [productA] = await sql<{ id: string }[]>`
    insert into garimpa.product (id, tenant_id, marketplace, external_id, title, product_url, last_price_cents)
    values (gen_random_uuid()::text, ${TA}, 'mercadolivre', 'MLB999999999', 'Produto teste A', 'https://x', 1000)
    returning id
  `;
  check(!!productA, "produto criado no tenant test_a");

  // 2. Tenant sem conta é rejeitado pela FK tenant_id -> affiliate_account.
  let tenantFkFailed = false;
  try {
    await sql`
      insert into garimpa.product (id, tenant_id, marketplace, external_id, title, product_url, last_price_cents)
      values (gen_random_uuid()::text, 'tenant_inexistente', 'mercadolivre', 'MLB888888888', 'X', 'https://x', 1)
    `;
  } catch {
    tenantFkFailed = true;
  }
  check(tenantFkFailed, "tenant sem affiliate_account é rejeitado (FK tenant_id)");

  // 3. Relação cruzada (observação do tenant B sobre produto do tenant A) falha.
  let crossFkFailed = false;
  try {
    await sql`
      insert into garimpa.price_observation (id, tenant_id, product_id, price_cents, observed_at)
      values (gen_random_uuid()::text, ${TB}, ${productA!.id}, 2000, now())
    `;
  } catch {
    crossFkFailed = true;
  }
  check(crossFkFailed, "relação entre tenants distintos falha (FK composta)");

  // 4. Observação no mesmo tenant funciona.
  const sameTenantOk = await sql<{ n: number }[]>`
    with ins as (
      insert into garimpa.price_observation (id, tenant_id, product_id, price_cents, observed_at)
      values (gen_random_uuid()::text, ${TA}, ${productA!.id}, 1500, now())
      returning id
    )
    select count(*)::int as n from ins
  `;
  check(sameTenantOk[0]!.n === 1, "observação no mesmo tenant funciona");
} finally {
  await cleanup();
  await sql.end();
}

console.log(failures === 0 ? "\nTodos os checks passaram." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
