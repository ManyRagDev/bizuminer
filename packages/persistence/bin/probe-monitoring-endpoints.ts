/** Espiga somente leitura: confere lookup por ID nas credenciais brasileiras. */
import postgres from "postgres";
import { ShopeeClient } from "../../capture/src/adapters/shopee/client.ts";
import type { CaptureContext } from "../../capture/src/types.ts";
import { MonitoringLookup } from "../src/monitoring-lookup.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definido");
const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});
const ctx: CaptureContext = { runId: `monitor-probe-${Date.now()}`, log: () => {} };

try {
  const products = await sql<{ marketplace: string; external_id: string }[]>`
    select distinct on (marketplace) marketplace, external_id
    from garimpa.product
    where tenant_id = 'local' and marketplace = 'shopee'
    order by marketplace, last_seen_at desc
  `;
  for (const product of products) {
    try {
      if (product.marketplace === "shopee") {
        if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_APP_SECRET) throw new Error("credencial ausente");
        const data = await new ShopeeClient().request<{
          productOfferV2?: { nodes?: Array<{ itemId?: string | number; price?: string }> };
        }>(
          { appId: process.env.SHOPEE_APP_ID, appSecret: process.env.SHOPEE_APP_SECRET },
          "query MonitorProbe($itemId: Int64) { productOfferV2(itemId: $itemId, page: 1, limit: 1) { nodes { itemId price } } }",
          { itemId: product.external_id },
          ctx,
        );
        console.log(JSON.stringify({ marketplace: "shopee", accepted: true,
          exactMatch: data.productOfferV2?.nodes?.some((node) => String(node.itemId) === product.external_id) ?? false }));
      }
    } catch (error) {
      console.log(JSON.stringify({ marketplace: product.marketplace, accepted: false,
        error: error instanceof Error ? error.message : String(error) }));
    }
  }
  const lookup = new MonitoringLookup();
  for (const product of products) {
    try {
      const secret: Record<string, string> = { appId: process.env.SHOPEE_APP_ID ?? "", appSecret: process.env.SHOPEE_APP_SECRET ?? "" };
      const offer = await lookup.byId({ marketplace: product.marketplace, secret }, product.external_id, ctx);
      console.log(JSON.stringify({ marketplace: product.marketplace, mapped: !!offer,
        positivePrice: (offer?.priceCents ?? 0) > 0, exactId: offer?.externalId === product.external_id }));
    } catch (error) {
      console.log(JSON.stringify({ marketplace: product.marketplace, mapped: false,
        error: error instanceof Error ? error.message : String(error) }));
    }
  }
} finally {
  await sql.end();
}
