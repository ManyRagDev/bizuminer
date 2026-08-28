/**
 * Verificação derivada ponta a ponta da extensão (E8, regra da evidência).
 * Gera o relatório DIRETO do banco — nunca montado à mão. Prova, para as
 * capturas de extensão mais recentes:
 *   - isolamento: cada observação pertence ao tenant do afiliado do dispositivo;
 *   - idempotência: nenhum (extension_device_id, client_request_id) duplicado;
 *   - publicação nasce na captura (slug por afiliado), nunca no clique.
 *
 * Uso: npm run verify:extension-e2e   (usa DATABASE_URL de ../web/.env.local)
 * Só roda após E1–E4 aplicadas e com capturas reais de extensão.
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

// 1. Idempotência: nenhum par (device, requestId) repetido.
const [dup] = await sql<Array<{ bad: number }>>`
  select count(*)::int as bad
  from (
    select extension_device_id, client_request_id
    from garimpa.price_observation
    where capture_source = 'extension' and extension_device_id is not null and client_request_id is not null
    group by extension_device_id, client_request_id
    having count(*) > 1
  ) d
`;
check(dup!.bad === 0, `idempotência: 0 pares (device, requestId) duplicados (violações: ${dup!.bad})`);

// 2. Isolamento: observação e produto do mesmo tenant; dispositivo → afiliado → tenant.
const [cross] = await sql<Array<{ bad: number }>>`
  select count(*)::int as bad
  from garimpa.price_observation o
  join garimpa.product p on p.id = o.product_id
  join garimpa.extension_device d on d.id = o.extension_device_id
  join garimpa.affiliate_account a on a.id = d.affiliate_id
  where o.capture_source = 'extension'
    and (o.tenant_id <> p.tenant_id or o.tenant_id <> a.tenant_id)
`;
check(cross!.bad === 0, `isolamento por tenant: 0 observações cruzadas (violações: ${cross!.bad})`);

// 3. Publicação nasce na captura e carrega o slug do afiliado.
const rows = await sql<{
  request_id: string | null;
  device_id: string;
  affiliate_id: string;
  product_id: string;
  observation_id: string;
  publication_id: string | null;
  slug: string | null;
  tenant_id: string;
  received_at: string;
}[]>`
  select o.client_request_id::text as request_id, d.id as device_id, a.id as affiliate_id,
         o.product_id, o.id as observation_id, pub.id as publication_id, pub.slug, o.tenant_id,
         o.received_at::text
  from garimpa.price_observation o
  join garimpa.extension_device d on d.id = o.extension_device_id
  join garimpa.affiliate_account a on a.id = d.affiliate_id
  left join garimpa.publication pub on pub.affiliate_id = a.id and pub.product_id = o.product_id and pub.channel = 'web'
  where o.capture_source = 'extension'
  order by o.received_at desc
  limit 20
`;

console.log("\n=== Capturas de extensão recentes (fonte: banco) ===");
if (rows.length === 0) {
  console.log("(nenhuma captura de extensão ainda — o fluxo real não foi exercitado)");
} else {
  for (const r of rows) {
    console.log(
      `${r.received_at}  requestId=${r.request_id}  device=${r.device_id.slice(0, 8)}…  ` +
        `affiliate=${r.affiliate_id}  product=${r.product_id.slice(0, 8)}…  obs=${r.observation_id.slice(0, 8)}…  ` +
        `pub=${r.publication_id ? r.publication_id.slice(0, 8) + "…" : "AUSENTE"}  slug=${r.slug ?? "AUSENTE"}`,
    );
  }
  const semPub = rows.filter((r) => !r.publication_id).length;
  check(semPub === 0, `publicação nasce na captura (sem publicação: ${semPub})`);
}

await sql.end();
console.log(failures === 0 ? "\nTodos os checks passaram." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
