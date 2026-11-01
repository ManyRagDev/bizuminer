import { selectedPublicProducts } from "../../../../lib/product-presentation-db";

export const preferredRegion = "gru1";

export const dynamic = "force-dynamic";

/** Revalidate a bounded selection, without accepting client-supplied titles, prices or tenant IDs. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (!ids.length || ids.length > 24 || ids.some(id => !/^[a-zA-Z0-9_-]{1,120}$/.test(id))) {
    return Response.json({ error: "invalid_product_ids" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const result = await selectedPublicProducts(ids);
  return Response.json(result, { status: result.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
