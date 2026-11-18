import { NextRequest } from "next/server";
import { extensionCorsHeaders, isAllowedExtensionOrigin } from "../../../../lib/extension-cors";
import { extensionBatchMarketplaceEnabled, extensionCaptureEnabled, extensionCaptureMode } from "../../../../lib/flags";
import { authenticateDevice, persistManualExtensionBatch } from "../../../../lib/extension-db";
import { hashToken } from "../../../../lib/extension-token";
import { browserCaptures } from "../../../../lib/browser-capture-db";
import { validateBrowserCaptureWithDiagnostics, BrowserCaptureValidationError, validBatchId } from "../../../../lib/browser-capture-contract";
import { dispatchCaptureBatchForDeviceMember } from "../../../../lib/capture-dispatch";
import { isExtensionMarketplace } from "../../../../lib/extension-contract";
import { readExtensionJson, extensionIdempotencyMatches } from "../../../../lib/extension-request";
import { captureIpKey, captureRateLimited } from "../../../../lib/rate-limit";

export const preferredRegion = "gru1";
export const runtime = "nodejs";
const cors = (request: NextRequest) => ({ ...extensionCorsHeaders(request.headers.get("origin")),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" });
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403, headers: {
    ...cors(request), "Access-Control-Expose-Headers": "X-Bizu-Capture-Marketplaces",
    "X-Bizu-Capture-Marketplaces": ["mercadolivre", "amazon", "aliexpress"].filter(isExtensionMarketplace)
      .filter(marketplace => extensionBatchMarketplaceEnabled(marketplace)).join(","),
  } });
}
async function identity(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("bm_ext_")) return null;
  const auth = await authenticateDevice(hashToken(token));
  return auth.kind === "ok" ? auth.device : null;
}
export async function GET(request: NextRequest) {
  const headers = cors(request);
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  if (!isAllowedExtensionOrigin(request.headers.get("origin"))) return fail("origin_not_allowed", 403);
  if (!extensionCaptureEnabled()) return fail("not_enabled", 403);
  const mode = extensionCaptureMode();
  if (!mode) return fail("capture_mode_unavailable", 503);
  if (mode === "manual") return fail("manual_import_required", 409);
  try {
    const access = await identity(request);
    if (!access) return fail("unauthorized", 401);
    const marketplace = request.nextUrl.searchParams.get("marketplace") ?? "mercadolivre";
    if (!isExtensionMarketplace(marketplace)) return fail("marketplace_not_supported", 400);
    if (!extensionBatchMarketplaceEnabled(marketplace)) return fail("marketplace_capture_unavailable", 403);
    const batchId = await browserCaptures.pending(access, marketplace);
    return Response.json({ ok: true, mode, batchId, busy: batchId === null }, { headers });
  } catch { return fail("browser_capture_failed", 500); }
}
export async function POST(request: NextRequest) {
  const headers = cors(request);
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  if (!isAllowedExtensionOrigin(request.headers.get("origin"))) return fail("origin_not_allowed", 403);
  if (!extensionCaptureEnabled()) return fail("not_enabled", 403);
  const mode = extensionCaptureMode();
  if (!mode) return fail("capture_mode_unavailable", 503);
  if (captureRateLimited(captureIpKey(request.headers.get("x-forwarded-for"))).limited) return fail("rate_limited", 429);
  try {
    const access = await identity(request);
    if (!access) return fail("unauthorized", 401);
    let raw: unknown;
    try { raw = await readExtensionJson(request, 1_000_000); }
    catch (error) { return fail(error instanceof Error && error.message === "body_too_large" ? "body_too_large" : "invalid_json", error instanceof Error && error.message === "body_too_large" ? 413 : 400); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("invalid_payload", 400);
    const body = raw as Record<string, unknown>;
    if (mode === "manual" ? body.mode !== "manual" : body.mode !== undefined && body.mode !== "durable") return fail("mode_mismatch", 409);
    if (mode === "manual" ? body.batchId !== undefined : !validBatchId(body.batchId)) return fail("invalid_payload", 400);
    let validation;
    try { validation = validateBrowserCaptureWithDiagnostics(body.payload); }
    catch (error) {
      if (mode === "manual" && error instanceof BrowserCaptureValidationError)
        return Response.json({ ok: false, error: "invalid_payload", diagnostics: error.diagnostics }, { status: 400, headers });
      return fail("invalid_payload", 400);
    }
    const { payload, diagnostics } = validation;
    if (!extensionIdempotencyMatches(request, payload.requestId)) return fail("idempotency_key_mismatch", 400);
    if (!extensionBatchMarketplaceEnabled(payload.marketplace)) return fail("marketplace_capture_unavailable", 403);
    if (mode === "manual") {
      const result = await persistManualExtensionBatch(access, payload, undefined, diagnostics);
      return Response.json({ ...result, diagnostics, alreadyRecordedCount: diagnostics.valid - result.importedCount }, { headers });
    }
    const batchId = body.batchId as string;
    const result = await browserCaptures.complete(access, batchId, payload);
    if (result.queued) {
      try { await dispatchCaptureBatchForDeviceMember(batchId, access); }
      catch { return Response.json({ ok: false, error: "continuation_pending", importedCount: result.importedCount }, { status: 503, headers }); }
    }
    return Response.json({ ok: true, mode, ...result }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === "capture_request_conflict") return fail("capture_request_conflict", 409);
    if (error instanceof Error && ["affiliate_access_required", "browser_capture_forbidden"].includes(error.message)) return fail("device_revoked", 403);
    return fail("browser_capture_failed", 500);
  }
}
