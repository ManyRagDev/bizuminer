import type postgres from "postgres";
import type { AccountContext } from "./account-context.ts";
import { withCommercialDb } from "./commercial-rollout.ts";
import { db } from "./db.ts";
import type { MarketplaceSlug } from "./marketplaces.ts";

export const REPORT_CURRENCIES = ["BRL", "USD", "EUR"] as const;

export interface MarketplacePerformance {
  marketplace: MarketplaceSlug;
  periodStart: string;
  periodEnd: string;
  clicks: number | null;
  orders: number | null;
  salesCents: string | null;
  commissionCents: string | null;
  currency: typeof REPORT_CURRENCIES[number];
}

export async function readMarketplacePerformance(tx: postgres.TransactionSql, tenantId: string) {
  const [schema] = await tx<{ ready: boolean }[]>`
    select to_regclass('garimpa.marketplace_performance') is not null as ready
  `;
  if (!schema?.ready) return null;

  return tx<MarketplacePerformance[]>`
    select marketplace, period_start::text as "periodStart", period_end::text as "periodEnd",
           clicks, orders, sales_cents::text as "salesCents",
           reported_commission_cents::text as "commissionCents", currency
    from garimpa.marketplace_performance
    where tenant_id = ${tenantId}
    order by period_end desc, period_start desc, marketplace desc
    limit 30
  `;
}

export async function saveMarketplacePerformance(
  context: AccountContext,
  report: MarketplacePerformance,
  sqlFactory: typeof db = db,
) {
  const actor = context.actorAppUserId;
  if (context.membershipRole !== "owner" || !actor) throw new Error("owner_required");

  await withCommercialDb(context, async (tx) => {
    await tx`
      insert into garimpa.marketplace_performance
        (tenant_id, marketplace, period_start, period_end, clicks, orders,
         sales_cents, reported_commission_cents, currency, updated_by)
      values
        (${context.tenantId}, ${report.marketplace}, ${report.periodStart}, ${report.periodEnd},
         ${report.clicks}, ${report.orders}, ${report.salesCents}, ${report.commissionCents},
         ${report.currency}, ${actor})
      on conflict (tenant_id, period_end, period_start, marketplace) do update
      set clicks = excluded.clicks,
          orders = excluded.orders,
          sales_cents = excluded.sales_cents,
          reported_commission_cents = excluded.reported_commission_cents,
          currency = excluded.currency,
          updated_by = excluded.updated_by,
          updated_at = now()
    `;
  }, sqlFactory);
}
