import { confirmedOfferDetail } from "../../../../../lib/confirmed-offer-db.ts";
import { serveProductPreview } from "../../../../../lib/product-preview-response.ts";
import { renderProductPreview } from "../../../../../lib/product-preview-image.tsx";
export const preferredRegion="gru1";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{slug:string;option:string}>}){
  const {slug,option}=await params;
  return serveProductPreview(request,slug,{loadProduct:async()=> (await confirmedOfferDetail(slug,option))?.product ?? null,render:renderProductPreview});
}
