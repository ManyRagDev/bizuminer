import { NextRequest } from "next/server";
import { dealQueryFromSearchParams } from "../../../lib/deal-query";
import { toVitrineProduct } from "../../../lib/deal-view";
import { dealCategories, marketplaceCounts, topDeals } from "../../../lib/db";

export const dynamic = "force-dynamic";

/** Catálogo paginado: dados públicos passam pelo servidor, nunca pelo cliente inteiro. */
export async function GET(request: NextRequest) {
  const query = dealQueryFromSearchParams(request.nextUrl.searchParams);
  const [page, categories, counts] = await Promise.all([
    topDeals(query),
    dealCategories(query.freshness),
    marketplaceCounts(query.freshness),
  ]);
  return Response.json({
    products: page.deals.map(toVitrineProduct),
    total: page.total,
    categories,
    marketplaceCounts: counts,
    limit: query.limit,
    offset: query.offset,
  }, { headers: { "Cache-Control": "no-store" } });
}
