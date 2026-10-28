import { withPublicDb } from "../../../lib/public-offer-db.ts";
import { isKnownAutomation, parseHomepageEngagement } from "../../../lib/homepage-engagement.ts";
import { verifyHomepageEngagementTicket } from "../../../lib/homepage-engagement-token.ts";
import { SlidingWindowLimiter, captureIpKey } from "../../../lib/rate-limit.ts";
const limiter = new SlidingWindowLimiter(20, 60_000);
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  if (isKnownAutomation(request.headers.get("user-agent") ?? "")) return new Response(null, { status: 204, headers });
  if (limiter.check(captureIpKey(request.headers.get("x-forwarded-for"))).limited) return new Response(null, { status: 429, headers });
  if (Number(request.headers.get("content-length")) > 16_384) return new Response(null, { status: 413, headers });
  let body; let token: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("missing_body");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
      chunks.push(value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    token = parsed?.token;
    body = parseHomepageEngagement(parsed);
  } catch { return new Response(null, { status: 400, headers }); }
  if (!body) return new Response(null, { status: 400, headers });
  if (!verifyHomepageEngagementTicket(token, body.editionId, body.viewId)) return new Response(null, { status: 403, headers });
  try {
    await withPublicDb(async tx => { await tx`select garimpa.record_homepage_engagement('local',${body.editionId}::uuid,${body.viewId}::uuid,${tx.json(body.events)}::jsonb)`; });
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
