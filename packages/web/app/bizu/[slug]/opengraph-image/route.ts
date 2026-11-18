import { createElement } from "react";
import { ImageResponse } from "next/og";
import { sharedLinkArchive } from "../../../../lib/shared-link-archive-db.ts";
import { publicOfferHistory } from "../../../../lib/public-offer-db.ts";
import { ARCHIVE_NO_STORE, archiveQueryAllowed, archiveUnavailable } from "../../../../lib/shared-link-archive.ts";
import { ogFonts } from "../../../../lib/og-assets";
import { ArchivedSharedLinkPreview } from "../../../_components/archived-shared-link";
import { dealDetail } from "../../../../lib/db";
import { toVitrineProduct } from "../../../../lib/deal-view";
import { renderProductPreview } from "../../../../lib/product-preview-image";
import { serveProductPreview } from "../../../../lib/product-preview-response";

export const preferredRegion = "gru1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const archive = await sharedLinkArchive("slug", slug);
  if (archive) {
    if (!archive.available || !archiveQueryAllowed(new URL(request.url).searchParams)) return archiveUnavailable();
    return new ImageResponse(createElement(ArchivedSharedLinkPreview, { title: archive.title }), {
      width: 1200, height: 630, fonts: await ogFonts(), headers: ARCHIVE_NO_STORE,
    });
  }
  const detail=await dealDetail(slug);
  if (!detail) {
    const history=await publicOfferHistory(slug);
    if (!history) return archiveUnavailable();
    return new ImageResponse(createElement(ArchivedSharedLinkPreview,{title:history.title}),{
      width:1200,height:630,fonts:await ogFonts(),headers:ARCHIVE_NO_STORE,
    });
  }
  return serveProductPreview(request, slug, {
    async loadProduct(value) {
      if(value!==slug) return null;
      const current=await dealDetail(value);
      return current ? toVitrineProduct(current.deal) : null;
    },
    render: renderProductPreview,
  });
}
