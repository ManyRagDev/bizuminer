import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";
import { decodeManualCaptureBlock, persistManualCapture } from "../../../../lib/manual-capture";

export const runtime = "nodejs";

/**
 * Captura manual: recebe o bloco BM1 gerado pelo bookmarklet (que o curador
 * colou no painel), decodifica, valida e persiste produto + observação.
 *
 * Só o dono (ADMIN_EMAIL) envia — mesmo gate das rodagens. O bloco em si não
 * carrega segredo: a autenticidade é da sessão; o checksum só garante que a
 * cópia manual não veio truncada.
 */
export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { block?: unknown };
  try {
    body = (await request.json()) as { block?: unknown };
  } catch {
    return sinkJson(check.sink, { ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (typeof body.block !== "string" || body.block.trim().length === 0) {
    return sinkJson(check.sink, { ok: false, error: "missing_block" }, { status: 400 });
  }

  let payload;
  try {
    payload = decodeManualCaptureBlock(body.block);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bloco inválido";
    return sinkJson(check.sink, { ok: false, error: "invalid_block", message }, { status: 400 });
  }

  try {
    const result = await persistManualCapture(payload);
    return sinkJson(check.sink, { ok: true, ...result }, { status: 200 });
  } catch (err) {
    return sinkJson(
      check.sink,
      { ok: false, error: "server_error", message: err instanceof Error ? err.message : "falha ao persistir" },
      { status: 500 },
    );
  }
}
