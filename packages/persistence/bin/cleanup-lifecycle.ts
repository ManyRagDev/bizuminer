import { retiredLegacyMaintenance } from '../src/maintenance-cli.ts';
retiredLegacyMaintenance('cleanup-lifecycle');

/**
 * Rotina Contínua de Manutenção do Ciclo de Vida do Catálogo (BizuMiner).
 *
 * Executa periodicamente a higienização de:
 * 1. Observações de preço mortas pertencentes a produtos rejeitados (sem favoritos/alertas).
 * 2. Rodagens de captura vazias ou com erro com mais de 14 dias sem dependências.
 * 3. Produtos abandonados há > 30 dias que nunca tiveram favoritos, alertas, aprovação ou eventos.
 *
 * Suporta flags:
 *   --dry-run (padrão): apenas audita e exibe contadores sem mutação.
 *   --execute: aplica as limpezas de forma atômica em transação.
 */
import postgres from "postgres";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL não definido" }));
  process.exit(1);
}

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

export interface CleanupReport {
  readonly mode: "dry-run" | "execute";
  readonly rejectedObservationsCleaned: number;
  readonly abandonedProductsCleaned: number;
  readonly orphanRunsCleaned: number;
  readonly executedAt: string;
}

async function run() {
  const tenantId = process.env.MONITOR_TENANT_ID ?? "local";

  if (!execute) {
    // Modo Simulação (Dry Run): apenas consultas de contagem
    const [rejectedObs] = await sql<{ count: string }[]>`
      select count(obs.id)::text as count
      from garimpa.price_observation obs
      join garimpa.product p on p.id = obs.product_id
      join garimpa.product_curation cur on cur.product_id = p.id and cur.status = 'rejected'
      where p.tenant_id = ${tenantId}
        and not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
        and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
        and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
        and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
    `;

    const [abandonedProds] = await sql<{ count: string }[]>`
      select count(p.id)::text as count
      from garimpa.product p
      where p.tenant_id = ${tenantId}
        and p.last_seen_at < now() - interval '30 days'
        and not exists (select 1 from garimpa.curation_event ce where ce.product_id = p.id)
        and not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
        and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
        and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
        and not exists (select 1 from garimpa.product_curation cur where cur.product_id = p.id and cur.status = 'approved')
        and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
    `;

    const [orphanRuns] = await sql<{ count: string }[]>`
      select count(r.id)::text as count
      from garimpa.capture_run r
      where r.tenant_id = ${tenantId}
        and (r.status = 'error' or r.items_captured = 0)
        and r.started_at < now() - interval '14 days'
        and not exists (select 1 from garimpa.product p where p.last_capture_run_id = r.id)
        and not exists (select 1 from garimpa.price_observation obs where obs.capture_run_id = r.id)
    `;

    const report: CleanupReport = {
      mode: "dry-run",
      rejectedObservationsCleaned: Number(rejectedObs?.count ?? 0),
      abandonedProductsCleaned: Number(abandonedProds?.count ?? 0),
      orphanRunsCleaned: Number(orphanRuns?.count ?? 0),
      executedAt: new Date().toISOString(),
    };

    console.log(JSON.stringify(report, null, 2));
    await sql.end();
    return;
  }

  // Modo Execução Atômica
  let report!: CleanupReport;

  await sql.begin(async (tx) => {
    // 1. Limpeza de observações de produtos rejeitados
    const delObs = await tx`
      delete from garimpa.price_observation
      where id in (
        select obs.id
        from garimpa.price_observation obs
        join garimpa.product p on p.id = obs.product_id
        join garimpa.product_curation cur on cur.product_id = p.id and cur.status = 'rejected'
        where p.tenant_id = ${tenantId}
          and not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
          and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
          and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
          and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
      )
      returning id
    `;

    // 2. Limpeza de produtos abandonados > 30 dias sem eventos ou interesses
    const abandonedProds = await tx<{ id: string }[]>`
      select p.id
      from garimpa.product p
      where p.tenant_id = ${tenantId}
        and p.last_seen_at < now() - interval '30 days'
        and not exists (select 1 from garimpa.curation_event ce where ce.product_id = p.id)
        and not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
        and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
        and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
        and not exists (select 1 from garimpa.product_curation cur where cur.product_id = p.id and cur.status = 'approved')
        and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
    `;

    let delProdsCount = 0;
    if (abandonedProds.length > 0) {
      const prodIds = abandonedProds.map((p) => p.id);
      await tx`delete from garimpa.product_curation where product_id = any(${prodIds})`;
      await tx`delete from garimpa.price_observation where product_id = any(${prodIds})`;
      await tx`delete from garimpa.publication where product_id = any(${prodIds})`;
      const delProds = await tx`delete from garimpa.product where id = any(${prodIds}) returning id`;
      delProdsCount = delProds.length;
    }

    // 3. Limpeza de rodagens vazias ou de erro com mais de 14 dias
    const delRuns = await tx`
      delete from garimpa.capture_run r
      where r.tenant_id = ${tenantId}
        and (r.status = 'error' or r.items_captured = 0)
        and r.started_at < now() - interval '14 days'
        and not exists (select 1 from garimpa.product p where p.last_capture_run_id = r.id)
        and not exists (select 1 from garimpa.price_observation obs where obs.capture_run_id = r.id)
      returning id
    `;

    report = {
      mode: "execute",
      rejectedObservationsCleaned: delObs.length,
      abandonedProductsCleaned: delProdsCount,
      orphanRunsCleaned: delRuns.length,
      executedAt: new Date().toISOString(),
    };
  });

  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
