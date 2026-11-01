import { NextRequest } from "next/server";
import { POST as startBatch } from "../lote/route";

export const preferredRegion = "gru1";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ marketplace: string }> },
) {
  const { marketplace } = await context.params;
  if (!["shopee", "aliexpress"].includes(marketplace))
    return Response.json(
      { ok: false, error: "unknown_marketplace" },
      { status: 404 },
    );
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* Safe defaults handled by the batch endpoint. */
  }
  return startBatch(
    new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...body, marketplaces: [marketplace] }),
    }),
  );
}
