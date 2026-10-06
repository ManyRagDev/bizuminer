import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../lib/api-auth";
import { getPublishedEditorialSelection } from "../../../lib/editorial-selection-db";
import { shortCodesForSlugs } from "../../../lib/short-link-db";
import { shareBaseUrl } from "../../../lib/site-url";

export const dynamic = "force-dynamic";

/** Pauta e home compartilham o catálogo inicial ou a edição editorial vigente. */
export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const selection = await getPublishedEditorialSelection("pauta");
  const host = shareBaseUrl().replace(/\/$/, "");
  const codes = selection.products.length
    ? await shortCodesForSlugs(selection.products.map((product) => product.slug))
    : new Map<string, string>();
  const products = selection.products.map((product) => ({
    ...product,
    isHeroHighlight: selection.heroProductIds.includes(product.id),
    shareUrl: codes.has(product.slug)
      ? `${host}/p/${codes.get(product.slug)}`
      : `${host}/bizu/${product.slug}`,
  }));

  return sinkJson(check.sink, {
    products, total: products.length, selectionId: selection.id, selectionMode: selection.mode,
    selectionVersion: selection.version, validUntil: selection.validUntil,
    heroProductIds: selection.heroProductIds, heroValidUntil: selection.heroValidUntil,
  }, { headers: { "Cache-Control": "no-store" } });
}
