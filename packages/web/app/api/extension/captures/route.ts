import { NextRequest } from "next/server";
import { extensionCorsHeaders } from "../../../../lib/extension-cors";
import { validateExtensionCapturePayload } from "../../../../lib/extension-contract";
import { authenticateDevice, persistExtensionCapture } from "../../../../lib/extension-db";
import { hashToken } from "../../../../lib/extension-token";
import { extensionCaptureEnabled } from "../../../../lib/flags";
import { captureIpKey, captureRateLimited } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Captura de produto da extensão (E4, plano §7.3). Autenticação por token de
 * dispositivo (Bearer), idempotência por Idempotency-Key (requestId), CORS
 * restrito. A identidade (affiliate/tenant) vem do dispositivo, nunca do
 * payload. Fechada por `EXTENSION_CAPTURE_ENABLED`.
 */

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = extensionCorsHeaders(origin);

  if (!extensionCaptureEnabled()) {
    return Response.json({ ok: false, error: "not_enabled" }, { status: 403, headers });
  }

  const limit = captureRateLimited(captureIpKey(request.headers.get("x-forwarded-for")));
  if (limit.limited) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("bm_ext_")) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  const device = await authenticateDevice(hashToken(token));
  if (device.kind === "unknown") {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  if (device.kind === "revoked") {
    return Response.json({ ok: false, error: "device_revoked" }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers });
  }

  let payload;
  try {
    payload = validateExtensionCapturePayload(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "payload inválido";
    return Response.json({ ok: false, error: "invalid_payload", message }, { status: 400, headers });
  }

  try {
    const result = await persistExtensionCapture(device.device, payload);
    return Response.json(
      {
        ok: true,
        duplicate: result.duplicate,
        productId: result.productId,
        observationId: result.observationId,
        publication: {
          slug: result.publication.slug,
          url: `https://www.bizuminer.com.br/bizu/${result.publication.slug}`,
        },
      },
      { status: 200, headers },
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: "server_error", message: err instanceof Error ? err.message : "falha ao persistir" },
      { status: 500, headers },
    );
  }
}
