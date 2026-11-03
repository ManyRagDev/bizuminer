import { dealDetail } from "../../../../lib/db";
import { toVitrineProduct } from "../../../../lib/deal-view";
import { renderProductPreview } from "../../../../lib/product-preview-image";
import { serveProductPreview } from "../../../../lib/product-preview-response";

export const preferredRegion = "gru1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return serveProductPreview(request, slug, {
    async loadProduct(value) {
      const detail = await dealDetail(value);
      return detail ? toVitrineProduct(detail.deal) : null;
    },
    render: renderProductPreview,
  });
}
