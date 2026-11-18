import { sharedLinkArchive } from "../../../../lib/shared-link-archive-db.ts";
import { archivePageResponse, archiveUnavailable } from "../../../../lib/shared-link-archive.ts";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string; code: string }> }) {
  const { tenant, code } = await params;
  const archive = await sharedLinkArchive("bio", code, tenant);
  return archive ? archivePageResponse(archive, new URL(request.url).searchParams, "p") : archiveUnavailable();
}
