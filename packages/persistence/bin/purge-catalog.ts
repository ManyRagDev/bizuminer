import { retiredLegacyMaintenance } from '../src/maintenance-cli.ts';
retiredLegacyMaintenance('purge-catalog');

/**
 * Script de Faxina / Purga Segura do Catálogo (BizuMiner).
 *
 * Executa a remoção atômica em transação (BEGIN ... COMMIT) de:
 * 1. Produtos do Mercado Livre parados há > 14 dias sem curation_event, sem favoritos, sem alertas e sem pauta (Deleção Total).
 * 2. Observações de preço mortas de produtos rejeitados (liberando a tabela pesada de histórico).
 * 3. Rodagens de captura com erro ou vazias sem dependências.
 */
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERRO: DATABASE_URL não definido.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function purge() {
  console.log("=========================================================");
  console.log("    INICIANDO FAXINA SEGURA NO BANCO DE DADOS SUPABASE   ");
  console.log("=========================================================\n");

  await sql.begin(async (tx) => {
    // 1. Identificar produtos que podem ser 100% DELETADOS da tabela product
    // (Não possuem curation_event, não possuem favoritos, alertas nem seleção editorial)
    const fullDeleteProducts = await tx<{ id: string; marketplace: string; title: string }[]>`
      select p.id, p.marketplace, p.title
      from garimpa.product p
      where p.marketplace = 'mercadolivre'
        and p.last_seen_at < now() - interval '14 days'
        and not exists (select 1 from garimpa.curation_event ce where ce.product_id = p.id)
        and not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
        and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
        and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
        and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
    `;

    console.log(`[1/5] Produtos ML mortos para DELEÇÃO COMPLETA: ${fullDeleteProducts.length}`);
    const fullDeleteIds = fullDeleteProducts.map((p) => p.id);

    if (fullDeleteIds.length > 0) {
      // Deletar curadoria pendente desses produtos
      const delCur = await tx`
        delete from garimpa.product_curation
        where product_id = any(${fullDeleteIds})
        returning product_id
      `;
      console.log(`      -> Registros de curadoria removidos: ${delCur.length}`);

      // Deletar observações de preço desses produtos
      const delObs = await tx`
        delete from garimpa.price_observation
        where product_id = any(${fullDeleteIds})
        returning id
      `;
      console.log(`      -> Observações de preço removidas: ${delObs.length}`);

      // Deletar publicações órfãs
      const delPub = await tx`
        delete from garimpa.publication
        where product_id = any(${fullDeleteIds})
        returning id
      `;
      if (delPub.length > 0) {
        console.log(`      -> Publicações removidas: ${delPub.length}`);
      }

      // Deletar produtos da tabela product
      const delProd = await tx`
        delete from garimpa.product
        where id = any(${fullDeleteIds})
        returning id
      `;
      console.log(`[2/5] Produtos ML totalmente removidos do catálogo: ${delProd.length}`);
    }

    // 2. Limpar observações de preço de produtos REJEITADOS na curadoria
    // (Como a tabela curation_event guarda o histórico auditável da decisão,
    // o produto fica como registro histórico sem nenhuma observação pesada)
    const rejectedObsProducts = await tx<{ id: string }[]>`
      select p.id
      from garimpa.product p
      join garimpa.product_curation cur on cur.product_id = p.id and cur.status = 'rejected'
      where not exists (select 1 from garimpa.favorite f where f.product_id = p.id)
        and not exists (select 1 from garimpa.price_watch pw where pw.product_id = p.id)
        and not exists (select 1 from garimpa.editorial_selection_item esi where esi.product_id = p.id)
        and (to_regclass('garimpa.opportunity') is null or not exists (select 1 from garimpa.opportunity op where op.product_id = p.id))
    `;

    const rejectedIds = rejectedObsProducts.map((p) => p.id);
    console.log(`\n[3/5] Produtos rejeitados para limpeza de observações: ${rejectedIds.length}`);

    if (rejectedIds.length > 0) {
      const delRejectedObs = await tx`
        delete from garimpa.price_observation
        where product_id = any(${rejectedIds})
        returning id
      `;
      console.log(`[4/5] Observações de preço mortas (de rejeitados) removidas: ${delRejectedObs.length}`);
    }

    // 3. Deletar rodagens de captura vazias ou com erro que ficaram sem nenhuma referência
    const delRuns = await tx`
      delete from garimpa.capture_run r
      where (r.status = 'error' or r.items_captured = 0)
        and not exists (
          select 1 from garimpa.product p where p.last_capture_run_id = r.id
        )
        and not exists (
          select 1 from garimpa.price_observation obs where obs.capture_run_id = r.id
        )
      returning id, marketplace, status
    `;
    console.log(`\n[5/5] Rodagens de captura vazias/erro isoladas removidas: ${delRuns.length}`);

    console.log("\n>>> TRANSAÇÃO COMMITADA COM SUCESSO! BANCO LIMPO E ÍNTEGRO. <<<");
  });

  await sql.end();
}

purge().catch((err) => {
  console.error("ERRO DURANTE A PURGA (TRANSAÇÃO DESFEITA / ROLLBACK):", err);
  process.exit(1);
});
