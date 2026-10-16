import { NextRequest } from "next/server";
import { extensionCorsHeaders } from "../../../../lib/extension-cors";
import { extensionCaptureEnabled } from "../../../../lib/flags";
import { authenticateDevice } from "../../../../lib/extension-db";
import { hashToken } from "../../../../lib/extension-token";
import { browserCaptures } from "../../../../lib/browser-capture-db";
import {
  validateBrowserCapture,
  validBatchId,
} from "../../../../lib/browser-capture-contract";
import { dispatchCaptureBatch } from "../../../../lib/capture-dispatch";
import { captureIpKey, captureRateLimited } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
const cors = (request: NextRequest) => ({
  ...extensionCorsHeaders(request.headers.get("origin")),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
});
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: cors(request) });
}
async function identity(request: NextRequest) {
  if (!extensionCaptureEnabled()) return null;
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token.startsWith("bm_ext_")) return null;
  const auth = await authenticateDevice(hashToken(token));
  return auth.kind === "ok"
    ? {
        appUserId: auth.device.appUserId,
        tenantId: auth.device.tenantId,
        deviceId: auth.device.deviceId,
      }
    : null;
}
export async function GET(request: NextRequest) {
  const access = await identity(request);
  if (!access)
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: cors(request) },
    );
  return Response.json(
    { ok: true, batchId: await browserCaptures.pending(access) },
    { headers: cors(request) },
  );
}
export async function POST(request: NextRequest) {
  const headers = cors(request);
  const access = await identity(request);
  if (!access)
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers },
    );
  if (
    captureRateLimited(captureIpKey(request.headers.get("x-forwarded-for")))
      .limited
  )
    return Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers },
    );
  let body, payload;
  try {
    body = await request.json();
    if (!validBatchId(body.batchId)) throw new Error("invalid_batch_id");
    payload = validateBrowserCapture(body.payload);
  } catch (err) {
    console.error("Erro na validação do lote da extensão:", err);
    return Response.json(
      {
        ok: false,
        error: "invalid_payload",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400, headers },
    );
  }
  try {
    const result = await browserCaptures.complete(
      access,
      body.batchId,
      payload,
    );
    if (result.queued) {
      try {
        await dispatchCaptureBatch(body.batchId, access.tenantId);
      } catch (dispatchErr) {
        console.error("Erro ao despachar continuação do lote:", dispatchErr);
        return Response.json(
          {
            ok: false,
            error: "continuation_pending",
            importedCount: result.importedCount,
          },
          { status: 503, headers },
        );
      }
    }
    return Response.json({ ok: true, ...result }, { headers });
  } catch (err) {
    console.error("Erro ao completar lote no banco:", err);
    const error =
      err instanceof Error && err.message.startsWith("browser_capture_")
        ? err.message
        : "browser_capture_failed";
    return Response.json(
      {
        ok: false,
        error,
        details: err instanceof Error ? err.message : String(err),
      },
      { status: error === "browser_capture_forbidden" ? 403 : 409, headers },
    );
  }
}
