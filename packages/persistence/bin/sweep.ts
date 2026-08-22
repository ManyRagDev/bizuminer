/**
 * CLI de varredura ao vivo: /ofertas → InMemoryStore + resumo no console.
 *
 * Uso: node --experimental-strip-types bin/sweep.ts [--pages N] [--min-discount 0.3]
 *
 * Sem banco configurado, o store é em memória (o dado desta execução é
 * descartado). Serve para validar o pipeline ponta a ponta contra o site real.
 */

import { MercadoLivreDealsAdapter } from "../../capture/src/adapters/mercadolivre/deals.ts";
import { sweep } from "../src/ingest.ts";
import { InMemoryStore } from "../src/store.ts";
import { PostgresStore } from "../src/pg-store.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";
import type { OfferStore } from "../src/store.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const pages = Number(flag("pages") ?? 1);
const minDiscount = flag("min-discount") ? Number(flag("min-discount")) : undefined;

const ctx: CaptureContext = {
  runId: `sweep-${Date.now()}`,
  log: (e) => {
    if (e.level === "warn" || e.level === "error") console.error(`[${e.level}] ${e.msg}`);
  },
};

const cred: Credential = { marketplace: "mercadolivre", secret: {} };

// Store: Postgres (Supabase) quando DATABASE_URL está definido; senão memória.
let store: OfferStore;
const mem = process.env.DATABASE_URL ? null : new InMemoryStore();
const pg = process.env.DATABASE_URL
  ? new PostgresStore({ connectionString: process.env.DATABASE_URL })
  : null;
store = pg ?? mem!;
console.log(
  pg ? "store: Postgres (Supabase, schema garimpa)" : "store: memória (DATABASE_URL não definido)",
);
const adapter = new MercadoLivreDealsAdapter();

console.log(`Varrendo /ofertas (páginas: ${pages})...`);
const summary = await sweep(
  adapter,
  cred,
  store,
  {
    tenantId: "local",
    params: { minClaimedDiscount: minDiscount },
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
console.log("\n=== Estado de vida do catálogo (derivado, nunca gravado) ===");
console.log(`ativos (rodagem atual):   ${activity.ativo}`);
console.log(`recentes (últimos 14d):   ${activity.recente}`);
console.log(`dormentes (histórico):    ${activity.dormente}`);

console.log("\n=== Top 10 por desconto ===");
if (pg) {
  const top = await pg.topByClaimedDiscount("local", 10);
  top.forEach((t) => {
    const off = Math.round(t.claimedDiscountRate * 100);
    console.log(
      `${String(off).padStart(3)}% OFF  R$ ${(t.lastPriceCents / 100).toFixed(2).padStart(9)}  ${t.title.slice(0, 70)}`,
    );
  });
  await pg.close();
} else {
  const ranked = await Promise.all(
    mem!.allProducts.map(async (p) => ({
      p,
      latest: await mem!.latestObservation(p.id),
    })),
  );
  ranked
    .filter((r) => (r.latest?.claimedDiscountRate ?? 0) > 0)
    .sort((a, b) => (b.latest!.claimedDiscountRate ?? 0) - (a.latest!.claimedDiscountRate ?? 0))
    .slice(0, 10)
    .forEach(({ p, latest }) => {
      const off = Math.round((latest!.claimedDiscountRate ?? 0) * 100);
      console.log(
        `${String(off).padStart(3)}% OFF  R$ ${(p.lastPriceCents / 100).toFixed(2).padStart(9)}  ${p.title.slice(0, 70)}`,
      );
    });
}
