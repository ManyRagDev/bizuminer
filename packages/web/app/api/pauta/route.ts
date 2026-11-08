import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../lib/api-auth";
import { marketplaceDef } from "../../../lib/marketplaces";
import { optionDetailPath } from "../../../lib/offer-option.ts";
import { confirmPautaExposure, readLivePauta } from "../../../lib/pauta-db.ts";
import { productPreview } from "../../../lib/product-preview";
import { shareBaseUrl } from "../../../lib/site-url";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const channel = request.nextUrl.searchParams.get("canal") === "stories" ? "stories" : "whatsapp";
  const marketplace = marketplaceDef(request.nextUrl.searchParams.get("loja") ?? "")?.slug ?? null;
  try {
    const selection = await readLivePauta(check.context, channel, marketplace);
    const host = shareBaseUrl().replace(/\/$/, "");
    const products = selection.products.map(({ shareTarget, shortCode, ...product }) => {
      const copyKey = JSON.stringify([product.id, product.offerOptionKey, product.priceCents, product.offerConditions]);
      if (shareTarget.kind === "pauta") {
        const detailUrl = `/p/pauta/${shareTarget.token}`;
        return {
          ...product, copyKey, detailUrl, shopUrl: `/go/pauta/${shareTarget.token}`, shareUrl: `${host}${detailUrl}`,
          previewUrl: null,
          storyUrl: `/api/story/${encodeURIComponent(product.id)}?pauta=1&conta=${encodeURIComponent(check.context.tenantId)}`,
        };
      }
      const { slug } = shareTarget;
      const query = product.offerOptionKey ? `?opcao=${encodeURIComponent(product.offerOptionKey)}` : "";
      const detailUrl = optionDetailPath(slug, product.offerOptionKey);
      return {
        ...product, slug, copyKey, detailUrl,
        previewUrl: `${host}${productPreview({ ...product, slug }).path}`,
        shopUrl: `/go/${encodeURIComponent(slug)}${query}`,
        shareUrl: shortCode ? `${host}/p/${shortCode}${query}` : `${host}${detailUrl}`,
        storyUrl: `/api/story/${encodeURIComponent(slug)}${query}`,
        bioCode: shortCode ? `#${shortCode.slice(-3).toUpperCase()}` : undefined,
      };
    });
    return sinkJson(check.sink, { ...selection, products, channel }, { headers: noStore });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    console.error("pauta_read_failed", { tenantId: check.context.tenantId, channel, code });
    return sinkJson(check.sink, { ok: false, error: "pauta_unavailable" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind !== "ok") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || (body.channel !== "whatsapp" && body.channel !== "stories")
    || typeof body.confirmationId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.confirmationId)
    || typeof body.productId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.productId)) {
    return Response.json({ ok: false, error: "invalid_exposure" }, { status: 400 });
  }
  const ok = await confirmPautaExposure(check.context, body.channel, body.confirmationId, body.productId);
  return sinkJson(check.sink, { ok }, { status: ok ? 200 : 409, headers: noStore });
}
