/**
 * CLI de varredura da AliExpress: Open Platform oficial → PostgresStore.
 *
 * Uso: node --experimental-strip-types bin/sweep-aliexpress.ts [--pages N] [--keyword termo] [--min-discount 0.3]
 *
 * Espelha `bin/sweep-shopee.ts`, que por sua vez espelha `bin/sweep.ts` (ML).
 * Arquivo próprio, sem tocar nos outros dois (M-R1/M-R5).
 *
 * Gate: `aliexpressCaptureEnabled()` exige flag + appKey + appSecret +
 * **trackingId**. O tracking id é obrigatório porque sem ele a API responde
 * normalmente e devolve links SEM atribuição — a rodagem "funcionaria" e
 * produziria um catálogo que não rende nada. Ver `src/aliexpress-capture.ts`.
 */

import { AliExpressAdapter } from "../../capture/src/adapters/aliexpress/index.ts";
import { aliexpressCaptureEnabled } from "../../capture/src/aliexpress-capture.ts";
import { sweep } from "../src/ingest.ts";
import { PostgresStore } from "../src/pg-store.ts";
import { ensureAliExpressPublications } from "../src/aliexpress-links.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const pages = Number(flag("pages") ?? 1);
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;
// A AliExpress é busca por palavra-chave: sem keyword não há "feed" natural.
const keyword = flag("keyword") ?? "achadinhos";

if (!aliexpressCaptureEnabled()) {
  console.error(
    "[bloqueado] A captura da AliExpress está desligada.\n" +
      "Nenhuma requisição foi feita e nenhuma rodagem foi registrada.\n\n" +
      "Exige TODAS as variáveis abaixo:\n" +
      "  ALIEXPRESS_CAPTURE_ENABLED=true\n" +
      "  ALIEXPRESS_APP_KEY\n" +
      "  ALIEXPRESS_APP_SECRET\n" +
      "  ALIEXPRESS_TRACKING_ID   <- sem ele a API responde, mas os links não\n" +
      "                              geram comissão (verificado em 28/08/2026)",
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[bloqueado] DATABASE_URL não definido — a captura exige Postgres configurado.");
  process.exit(1);
}

const ctx: CaptureContext = {
  runId: `sweep-aliexpress-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") {
      console.error(`[${e.level}] ${e.msg}${e.data ? " " + JSON.stringify(e.data) : ""}`);
    }
  },
};

const cred: Credential = {
  marketplace: "aliexpress",
  secret: {
    appKey: process.env.ALIEXPRESS_APP_KEY!,
    appSecret: process.env.ALIEXPRESS_APP_SECRET!,
    trackingId: process.env.ALIEXPRESS_TRACKING_ID!,
  },
};

const store = new PostgresStore({ connectionString: process.env.DATABASE_URL });
console.log("store: Postgres (Supabase, schema garimpa)");
const adapter = new AliExpressAdapter();

console.log(`Varrendo AliExpress Open Platform (páginas: ${pages}, keyword: "${keyword}")...`);
const summary = await sweep(
  adapter,
  cred,
  store,
  { tenantId: "local", params: { keyword, minClaimedDiscount: minDiscount }, maxPages: pages },
  ctx,
);

console.log("\n=== Resumo ===");
console.log(`marketplace:    ${summary.marketplace}`);
console.log(`itens:          ${summary.itemsCaptured}`);
console.log(`novos:          ${summary.itemsNew}`);
console.log(`mudanças preço: ${summary.priceChanges}`);
console.log(`duração:        ${summary.durationMs}ms`);

const activity = await store.productActivity("local", summary.runId);
console.log("\n=== Estado de vida do catálogo AliExpress (derivado, nunca gravado) ===");
console.log(`ativos (rodagem atual):   ${activity.ativo}`);
console.log(`recentes (últimos 14d):   ${activity.recente}`);
console.log(`dormentes (histórico):    ${activity.dormente}`);

await store.close();

// Diferente da Shopee, NÃO há chamada de API para gerar link: a query já
// devolve `promotion_link` atribuído ao tracking_id. Mas a `publication`
// ainda precisa existir — `click_event` referencia ela, e sem a linha o /go
// devolve 404 e o produto vira link morto (bug real, 28/08/2026).
console.log("\n=== Publicações e link de saída ===");
const links = await ensureAliExpressPublications(
  { connectionString: process.env.DATABASE_URL, tenantId: "local" },
  ctx,
);
console.log(`candidatos:      ${links.candidates}`);
console.log(`publicados:      ${links.linked}`);
console.log(`sem atribuição:  ${links.skippedWithoutLink}`);
