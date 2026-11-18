import { NextRequest } from "next/server";
import { extensionCorsHeaders, isAllowedExtensionOrigin } from "../../../../lib/extension-cors";
import { validateExtensionCapturePayload } from "../../../../lib/extension-contract";
import { authenticateDevice, persistExtensionCapture } from "../../../../lib/extension-db";
import { hashToken } from "../../../../lib/extension-token";
import { extensionBatchMarketplaceEnabled, extensionCaptureEnabled, extensionCaptureMode } from "../../../../lib/flags";
import { readExtensionJson, extensionIdempotencyMatches } from "../../../../lib/extension-request";
import { captureIpKey, captureRateLimited } from "../../../../lib/rate-limit";

export const preferredRegion = "gru1";
export const runtime = "nodejs";
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403,
    headers: extensionCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = { ...extensionCorsHeaders(origin), "Cache-Control": "no-store" };
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  if (!isAllowedExtensionOrigin(origin)) return fail("origin_not_allowed", 403);
  if (!extensionCaptureEnabled()) return fail("not_enabled", 403);
  const mode = extensionCaptureMode();
  if (!mode) return fail("capture_mode_unavailable", 503);
  if (captureRateLimited(captureIpKey(request.headers.get("x-forwarded-for"))).limited)
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("bm_ext_")) return fail("unauthorized", 401);
  try {
    const auth = await authenticateDevice(hashToken(token));
    if (auth.kind === "unknown") return fail("unauthorized", 401);
    if (auth.kind === "revoked") return fail("device_revoked", 403);
    let body: unknown;
    try { body = await readExtensionJson(request); }
    catch (error) { return fail(error instanceof Error && error.message === "body_too_large" ? "body_too_large" : "invalid_json", error instanceof Error && error.message === "body_too_large" ? 413 : 400); }
    if (body && typeof body === "object" && "mode" in body && body.mode !== mode) return fail("mode_mismatch", 409);
    let payload;
    try { payload = validateExtensionCapturePayload(body); }
    catch { return fail("invalid_payload", 400); }
    if (!extensionIdempotencyMatches(request, payload.requestId)) return fail("idempotency_key_mismatch", 400);
    if (!extensionBatchMarketplaceEnabled(payload.marketplace)) return fail("marketplace_capture_unavailable", 403);
    const result = await persistExtensionCapture(auth.device, payload, undefined, mode);
    return Response.json({ ok: true, mode, duplicate: result.duplicate, productId: result.productId,
      observationId: result.observationId, publication: result.publication ? {
        slug: result.publication.slug, url: `https://www.bizuminer.com.br/bizu/${result.publication.slug}`,
      } : null }, { status: 200, headers });
  } catch (error) {
    if (error instanceof Error && error.message === "capture_request_conflict") return fail("capture_request_conflict", 409);
    return fail(error instanceof Error && error.message === "affiliate_access_required" ? "device_revoked" : "server_error",
      error instanceof Error && error.message === "affiliate_access_required" ? 403 : 500);
  }
}
