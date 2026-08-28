/**
 * Bootstrap da casa no modelo de afiliados (E1).
 *
 * Liga o app_user do ADMIN_EMAIL como owner da conta `aff_local`. A migration
 * `20260826010000_garimpa_affiliates.sql` cria as tabelas e o `aff_local`;
 * este script completa o vínculo de dono. Nenhum e-mail é gravado na
 * migration — o dono precisa ter feito login ao menos uma vez (para existir a
 * linha app_user correspondente).
 *
 * Uso: node --env-file=../web/.env.local --experimental-strip-types bin/bootstrap-affiliate-house.ts
 *
 * Requer DATABASE_URL e ADMIN_EMAIL. NÃO imprime tracking_id/tool_id nem
 * qualquer credencial.
 */

import postgres from "postgres";

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definido.");
    return 1;
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "emanuel.adm10@gmail.com").trim().toLowerCase();

  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    const [house] = await sql<{ id: string; tenant_id: string; public_slug: string; status: string }[]>`
      select id, tenant_id, public_slug, status
      from garimpa.affiliate_account
      where id = 'aff_local'
      limit 1
    `;
    if (!house) {
      console.error("FAIL: garimpa.affiliate_account não possui 'aff_local'. Aplique a migration de E1 primeiro.");
      return 1;
    }

    const [owner] = await sql<{ id: string }[]>`
      select id from garimpa.app_user
      where lower(email) = ${adminEmail}
      order by created_at asc
      limit 1
    `;
    if (!owner) {
      console.error(
        `FAIL: nenhum app_user com e-mail "${adminEmail}". O dono precisa fazer login no BizuMiner ao menos uma vez antes do bootstrap.`,
      );
      return 1;
    }

    const inserted = await sql<{ affiliate_id: string; app_user_id: string; role: string }[]>`
      insert into garimpa.affiliate_membership (affiliate_id, app_user_id, role)
      values ('aff_local', ${owner.id}, 'owner')
      on conflict (affiliate_id, app_user_id) do nothing
      returning affiliate_id, app_user_id, role
    `;

    const [owners] = await sql<{ n: number }[]>`
      select count(*)::int as n
      from garimpa.affiliate_membership
      where affiliate_id = 'aff_local' and role = 'owner'
    `;

    console.log("=== Bootstrap da casa (fonte: banco) ===");
    console.log(`aff_local: tenant=${house.tenant_id} slug=${house.public_slug} status=${house.status}`);
    console.log(`dono: app_user=${owner.id.slice(0, 8)}… (e-mail normalizado ${adminEmail})`);
    console.log(inserted.length ? "membership: criada (owner)" : "membership: já existia (owner)");
    console.log(`owners ativos em aff_local: ${owners?.n ?? 0}`);
    console.log("Credenciais de marketplace (tracking/tool) NÃO são impressas — configure pelo painel.");
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
