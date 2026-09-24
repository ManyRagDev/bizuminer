/**
 * Retenção por ID exato, separada da descoberta por palavra-chave.
 * Sem --execute: somente lê o banco e mostra a fila. Com --execute: consulta
 * a API oficial e grava observações apenas quando o ID e o preço são válidos.
 */
import postgres from "postgres";
import { PostgresStore } from "../src/pg-store.ts";
import { loadMonitoringCandidates, suppressedMonitoringIds } from "../src/monitoring-candidates.ts";
import { monitoringQueue, type MonitorMarketplace } from "../src/monitoring-policy.ts";
import { MonitoringLookup } from "../src/monitoring-lookup.ts";
import { categoryForTitle } from "../src/category.ts";
import { familyInfoForTitle } from "../src/product-family.ts";
import type { CaptureContext, Credential } from "../../capture/src/types.ts";
import { shopeeCaptureEnabled } from "../../capture/src/shopee-capture.ts";
import { aliexpressCaptureEnabled } from "../../capture/src/aliexpress-capture.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const marketplace = flag("marketplace") as MonitorMarketplace | undefined;
if (marketplace !== "shopee" && marketplace !== "aliexpress") {
  throw new Error("--marketplace deve ser shopee ou aliexpress; ML pertence à fila humana");
}
const limit = Number(flag("limit") ?? "20");
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit deve ser inteiro entre 1 e 100");
const execute = args.includes("--execute");
const tenantId = process.env.MONITOR_TENANT_ID ?? "local";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});
const candidates = await loadMonitoringCandidates(sql, tenantId);
const suppressed = await suppressedMonitoringIds(sql, tenantId, marketplace, candidates);
await sql.end();
const selected = monitoringQueue(candidates.filter((candidate) => !suppressed.has(candidate.productId)), marketplace, limit);
const byId = new Map(candidates.map((candidate) => [candidate.productId, candidate]));
const queue = selected.map((decision) => ({ decision, product: byId.get(decision.productId)! }));

if (!execute) {
  console.log(JSON.stringify({ marketplace, mode: "dry-run", tenantId, limit,
    suppressed: suppressed.size,
    dueSelected: queue.length,
    tiers: Object.fromEntries(["watch", "approved", "engaged", "candidate"].map((tier) =>
      [tier, queue.filter((entry) => entry.decision.tier === tier).length])),
    previewIds: queue.slice(0, 10).map((entry) => entry.decision.productId) }, null, 2));
  process.exit(0);
}

if (queue.length === 0) {
  console.log(JSON.stringify({ marketplace, mode: "execute", attempted: 0, matched: 0 }));
  process.exit(0);
}

if (marketplace === "shopee" ? !shopeeCaptureEnabled() : !aliexpressCaptureEnabled()) {
  throw new Error(`captura de ${marketplace} desabilitada pelo gate do marketplace`);
}

const secret = marketplace === "shopee"
  ? { appId: process.env.SHOPEE_APP_ID, appSecret: process.env.SHOPEE_APP_SECRET }
  : { appKey: process.env.ALIEXPRESS_APP_KEY, appSecret: process.env.ALIEXPRESS_APP_SECRET,
      trackingId: process.env.ALIEXPRESS_TRACKING_ID };
if (Object.values(secret).some((value) => !value)) throw new Error(`credenciais de ${marketplace} incompletas`);
const cred: Credential = marketplace === "shopee"
  ? { marketplace, secret: { appId: process.env.SHOPEE_APP_ID!, appSecret: process.env.SHOPEE_APP_SECRET! } }
  : { marketplace, secret: { appKey: process.env.ALIEXPRESS_APP_KEY!,
      appSecret: process.env.ALIEXPRESS_APP_SECRET!, trackingId: process.env.ALIEXPRESS_TRACKING_ID! } };
const ctx: CaptureContext = { runId: `monitor-${marketplace}-${Date.now()}`,
  log: (event) => { if (event.level === "error") console.error(event.msg); } };
const store = new PostgresStore({ connectionString, maxConnections: 1 });
const lookup = new MonitoringLookup();
const runId = await store.startCaptureRun({
  tenantId, marketplace, startedAt: new Date(), collectorRunId: ctx.runId,
  parameters: { captureMode: "monitoring", monitoringPolicy: "monitoring-v1", budget: limit, selected: queue.length },
});
let attempted = 0;
let matched = 0;
let missing = 0;
let failed = 0;
let priceChanges = 0;
const missingIds: string[] = [];
const failedIds: string[] = [];
const missingReasons = { absent: 0, id_mismatch: 0, invalid_price: 0, currency: 0 };
try {
  for (const { product } of queue) {
    attempted++;
    try {
      const lookupResult = await lookup.byIdDetailed(cred, product.externalId, ctx);
      if (!lookupResult.offer) {
        missing++;
        missingIds.push(product.productId);
        missingReasons[lookupResult.reason]++;
        continue;
      }
      const offer = lookupResult.offer;
      const result = await store.upsertProductWithObservation({
        captureRunId: runId, tenantId, marketplace,
        externalId: offer.externalId, title: offer.title, productUrl: offer.productUrl,
        imageUrl: offer.imageUrl, category: categoryForTitle(offer.title),
        family: familyInfoForTitle(offer.title), priceCents: offer.priceCents,
        originalPriceCents: offer.originalPriceCents,
        claimedDiscountRate: offer.claimedDiscountRate, ratingStar: offer.ratingStar,
        salesLabel: offer.salesLabel, salesCount: offer.salesCount, observedAt: offer.capturedAt,
      });
      matched++;
      if (result.previousPriceCents !== undefined && result.previousPriceCents !== offer.priceCents) priceChanges++;
    } catch (error) {
      failed++;
      failedIds.push(product.productId);
      console.error(JSON.stringify({ productId: product.productId,
        error: error instanceof Error ? error.message : String(error) }));
    }
  }
} finally {
  await store.finishCaptureRun(runId, {
    finishedAt: new Date(), status: failed > 0 ? "error" : "ok",
    itemsCaptured: matched, itemsNew: 0, priceChanges,
    error: failed > 0 ? `${failed} reconsultas falharam` : undefined,
    parameterPatch: { attempted, matched, missing, failed,
      missingIds: missingIds.join(","), failedIds: failedIds.join(","),
      missingAbsent: missingReasons.absent, missingIdMismatch: missingReasons.id_mismatch,
      missingInvalidPrice: missingReasons.invalid_price, missingCurrency: missingReasons.currency },
  });
  await store.close();
}
console.log(JSON.stringify({ marketplace, mode: "execute", runId, attempted, matched, missing,
  missingReasons, failed, priceChanges }));
if (failed > 0) process.exitCode = 1;
