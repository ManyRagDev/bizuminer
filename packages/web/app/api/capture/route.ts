import { NextRequest } from "next/server";
import { parseManualPayload, persistManualCapture } from "../../../lib/manual-capture";
import { captureIpKey, captureRateLimited } from "../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Captura manual direta do bookmarklet.
 *
 * ⚠️ DEPRECATED (E4, 26/08/2026): token global será aposentado quando a borda
 * de extensão (POST /api/extension/captures) estiver estável. Este endpoint
 * continua limitado à casa (CAPTURE_TOKEN) até lá — não é base multi-afiliado.
 *
 * Diferente de /api/admin/captura (que usa a sessão do dono), este endpoint é
 * chamado pelo bookmarklet rodando na página do Mercado Livre — cross-origin,
 * sem cookie de sessão do BizuMiner. Por isso a autenticação é um token
 * estático (`CAPTURE_TOKEN`), enviado em `Authorization: Bearer`.
 *
 * O token NÃO é um segredo forte (está embutido no bookmarklet, visível no
 * client-side), e não precisa ser: ele só autoriza a gravação de ofertas do
 * próprio dono. Quem tem o bookmarklet é o dono. A validação do payload é a
 * mesma de sempre (BM1/parseManualPayload), o que impede lixo no banco.
 */

const CAPTURE_TOKEN = process.env.CAPTURE_TOKEN;

function corsHeaders(): Record<string, string> {
  return {
    // Permitido para o bookmarklet rodando em qualquer página do ML.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  if (!CAPTURE_TOKEN) {
    return Response.json(
      { ok: false, error: "capture_token_not_configured" },
      { status: 500, headers: corsHeaders() },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== CAPTURE_TOKEN) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: corsHeaders() },
    );
  }

  const limit = captureRateLimited(captureIpKey(request.headers.get("x-forwarded-for")));
  if (limit.limited) {
    return Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: corsHeaders() },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: corsHeaders() });
  }

  let payload;
  try {
    payload = parseManualPayload(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "payload inválido";
    return Response.json(
      { ok: false, error: "invalid_payload", message },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const result = await persistManualCapture(payload);
    return Response.json({ ok: true, ...result }, { status: 200, headers: corsHeaders() });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "server_error",
        message: err instanceof Error ? err.message : "falha ao persistir",
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}
