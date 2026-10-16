import { NextRequest } from "next/server";
import { POST as startBatch } from "./lote/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const marketplace = "mercadolivre";
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
