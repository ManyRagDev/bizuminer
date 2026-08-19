import { NextRequest } from "next/server";
import { dealQueryFromSearchParams } from "../../../lib/deal-query";
import { toVitrineProduct } from "../../../lib/deal-view";
import { topDeals } from "../../../lib/db";

export const dynamic = "force-dynamic";

/** Catálogo paginado: dados públicos passam pelo servidor, nunca pelo cliente inteiro. */
export async function GET(request: NextRequest) {
  const query = dealQueryFromSearchParams(request.nextUrl.searchParams);
  const page = await topDeals(query);
  return Response.json({
    products: page.deals.map(toVitrineProduct),
    total: page.total,
    limit: query.limit,
    offset: query.offset,
  }, { headers: { "Cache-Control": "no-store" } });
}
