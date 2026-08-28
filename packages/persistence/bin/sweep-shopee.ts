/**
 * CLI de varredura da Shopee: Open API oficial → PostgresStore + resumo no console.
 *
 * Uso: node --experimental-strip-types bin/sweep-shopee.ts [--pages N] [--min-discount 0.3] [--keyword termo]
 *
 * Espelha `bin/sweep.ts` (ML) na estrutura, mas é um arquivo próprio — não
 * modifica o sweep do ML (M-R1, `docs/tecnico/plano-multiplataforma.md`).
 * Gate: `shopeeCaptureEnabled()` exige `SHOPEE_CAPTURE_ENABLED=true` +
 * `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`. Sem isso, o processo aborta ANTES de
 * criar `capture_run` e ANTES de qualquer chamada à API (M-R3: gate próprio,
 * nunca reaproveita o kill switch do ML).
 *
 * Diferente do sweep do ML, a Shopee é API oficial autenticada — não há
 * modo "memória" de conveniência sem banco: sem `DATABASE_URL`, o processo
 * aborta (rodar contra uma API paga/rate-limitada só para descartar o
 * resultado não serve a propósito nenhum aqui).
 */

import { ShopeeAdapter } from "../../capture/src/adapters/shopee/index.ts";
import { shopeeCaptureEnabled } from "../../capture/src/shopee-capture.ts";
import { sweep } from "../src/ingest.ts";
import { PostgresStore } from "../src/pg-store.ts";
import { ensureShopeeAffiliateLinks } from "../src/shopee-links.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const pages = Number(flag("pages") ?? 1);
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;
const keyword = flag("keyword");

// Gate M1: aborta antes de instanciar adapter/store e de qualquer rede.
if (!shopeeCaptureEnabled()) {
  console.error(
    "[bloqueado] A captura da Shopee está desligada (SHOPEE_CAPTURE_ENABLED e/ou credencial ausente).\n" +
      "Nenhuma requisição foi feita e nenhuma rodagem foi registrada.\n" +
      "Para liberar: defina SHOPEE_CAPTURE_ENABLED=true, SHOPEE_APP_ID e SHOPEE_APP_SECRET.",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[bloqueado] DATABASE_URL não definido — a captura da Shopee exige Postgres configurado.");
  process.exit(1);
}

const ctx: CaptureContext = {
  runId: `sweep-shopee-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") console.error(`[${e.level}] ${e.msg}`);
  },
};

const cred: Credential = {
  marketplace: "shopee",
  secret: {
    appId: process.env.SHOPEE_APP_ID!,
    appSecret: process.env.SHOPEE_APP_SECRET!,
  },
};

const store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
console.log("store: Postgres (Supabase, schema garimpa)");
const adapter = new ShopeeAdapter();

console.log(`Varrendo Shopee Open API (páginas: ${pages}${keyword ? `, keyword: ${keyword}` : ""})...`);
const summary = await sweep(
  adapter,
  cred,
  store,
  {
    tenantId: "local",
    params: { minClaimedDiscount: minDiscount, keyword },
    maxPages: pages,
  },
  ctx,
);

console.log("\n=== Resumo ===");
console.log(`marketplace:    ${summary.marketplace}`);
console.log(`itens:          ${summary.itemsCaptured}`);
console.log(`novos:          ${summary.itemsNew}`);
console.log(`mudanças preço: ${summary.priceChanges}`);
console.log(`duração:        ${summary.durationMs}ms`);

const activity = await store.productActivity("local", summary.runId);
console.log("\n=== Estado de vida do catálogo Shopee (derivado, nunca gravado) ===");
console.log(`ativos (rodagem atual):   ${activity.ativo}`);
console.log(`recentes (últimos 14d):   ${activity.recente}`);
console.log(`dormentes (histórico):    ${activity.dormente}`);

await store.close();

// M3: gera e persiste o link de saída (fora do redirect do /go, ver
// shopee-links.ts). Idempotente — só processa publications sem affiliate_url.
console.log("\n=== Links de afiliado (M3) ===");
const linkSummary = await ensureShopeeAffiliateLinks(
  { connectionString: process.env.DATABASE_URL, tenantId: "local", credential: cred },
  ctx,
);
console.log(`candidatos: ${linkSummary.candidates}`);
console.log(`gerados:    ${linkSummary.generated}`);
console.log(`falhas:     ${linkSummary.failed}`);
