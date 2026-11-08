import { redirectPublicPautaLink } from "../../../../lib/pauta-link-db.ts";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return redirectPublicPautaLink((await params).token);
}
