import { inAccountScope } from "../../../lib/account-scope.ts";
import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../lib/api-auth";
import { getPublishedEditorialSelection } from "../../../lib/editorial-selection-db";
import { shortCodesForSlugs } from "../../../lib/short-link-db";
import { shareBaseUrl } from "../../../lib/site-url";
import { optionDetailPath } from "../../../lib/offer-option.ts";
import { confirmRecommendationExposure,refreshRecommendationEditions } from "../../../lib/recommendation-db.ts";
import { productPreview } from "../../../lib/product-preview";

export const preferredRegion = "gru1";

export const dynamic = "force-dynamic";

/** Prepared channel projection; reading never composes an edition. */
export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
 return inAccountScope(check.context, async () => {

  const channel=request.nextUrl.searchParams.get("canal")==="stories" ? "stories":"whatsapp";
  const selection = await getPublishedEditorialSelection(channel);
  const host = shareBaseUrl().replace(/\/$/, "");
  const codes = selection.products.length
    ? await shortCodesForSlugs(selection.products.map((product) => product.slug), check.context.tenantId)
    : new Map<string, string>();
  const products = selection.products.map((product) => ({
    ...product,
    offerValidUntil:selection.destination ? product.offerValidUntil : selection.validUntil,
    previewUrl: `${host}${productPreview(product).path}`,
    isHeroHighlight: selection.heroProductIds.includes(product.id),
    detailUrl: optionDetailPath(product.slug,product.offerOptionKey),
    shopUrl: `/go/${encodeURIComponent(product.slug)}${product.offerOptionKey ? `?opcao=${product.offerOptionKey}`:""}`,
    shareUrl: codes.has(product.slug)
      ? `${host}/p/${codes.get(product.slug)}${product.offerOptionKey ? `?opcao=${product.offerOptionKey}`:""}`
      : `${host}${optionDetailPath(product.slug,product.offerOptionKey)}`,
    copyKey: `${product.id}:${product.offerOptionKey ?? "listing"}:${product.priceCents}:${product.evidenceObservedAt}`,
    storyUrl: `/api/story/${encodeURIComponent(product.slug)}${product.offerOptionKey ? `?opcao=${product.offerOptionKey}`:""}`,
  }));

  return sinkJson(check.sink, {
    channel, products, total: products.length, selectionId: selection.id, selectionMode: selection.mode,
    selectionVersion: selection.version, validUntil: selection.validUntil,
    heroProductIds: selection.heroProductIds, heroValidUntil: selection.heroValidUntil,
    homepageReady: selection.homepageReady === true, editionId: selection.homepageEditionId ?? null,
    renewedAt: selection.renewedAt ?? null, renewAfter: selection.renewAfter ?? null,
  }, { headers: { "Cache-Control": "no-store" } });

 });
}

export async function POST(request:NextRequest){
 const check=await checkAffiliateUser(request);
 if(check.kind!=="ok") return Response.json({ok:false,error:"forbidden"},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body || !["whatsapp","stories"].includes(body.channel) || typeof body.editionId!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.editionId)
   || typeof body.productId!=="string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.productId)) return Response.json({ok:false,error:"invalid_exposure"},{status:400});
 return inAccountScope(check.context,async()=>{
   const result=await confirmRecommendationExposure(body.channel,body.editionId,body.productId);
   if(result.ok){
     try{await refreshRecommendationEditions(check.context.tenantId);}
     catch{return sinkJson(check.sink,{...result,preparationFailed:true},{headers:{"Cache-Control":"no-store"}});}
   }
   return sinkJson(check.sink,result,{status:result.ok ? 200:409,headers:{"Cache-Control":"no-store"}});
 });
}
