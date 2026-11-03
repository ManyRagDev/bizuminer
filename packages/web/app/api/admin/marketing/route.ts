import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import { validateWorkspace } from "../../../../lib/marketing-contract.ts";
import {
  loadMarketing,
  saveMarketing,
  MarketingConflict,
} from "../../../../lib/marketing-storage-core.ts";
import { marketingStorage } from "../../../../lib/marketing-store.ts";

export const preferredRegion = "gru1";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

async function handle(request: NextRequest, write: boolean) {
  const access = await checkAffiliateUser(request);
  if (access.kind !== "ok")
    return NextResponse.json(
      {
        error:
          access.kind === "no_session"
            ? "Sua sessão expirou. Entre novamente para continuar."
            : "Acesso restrito ao painel.",
      },
      { status: access.kind === "no_session" ? 401 : 403, headers },
    );
  const storageOwner=access.context.tenantId==="local" ? access.appUserId : "account_"+createHash("sha256").update(JSON.stringify([access.context.tenantId,access.appUserId])).digest("hex");
  const reply = (body: unknown, status = 200) =>
    sinkJson(access.sink, body, { status, headers });
  if (write && request.headers.get("origin") !== request.nextUrl.origin)
    return reply({ error: "Origem da solicitação inválida." }, 403);
  try {
    if (!write)
      return reply(await loadMarketing(marketingStorage(), storageOwner));
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply({ error: "Envie dados JSON." }, 415);
    // Bound the stream even when Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Dados ausentes." }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1000000) {
        await reader.cancel();
        return reply({ error: "Espaço maior que o limite permitido." }, 413);
      }
      chunks.push(chunk.value);
    }
    const payload = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let input;
    try {
      input = JSON.parse(new TextDecoder().decode(payload));
      if (!Number.isSafeInteger(input.revision) || input.revision < 1)
        throw new Error("Revisão inválida.");
      input.workspace = validateWorkspace(input.workspace);
    } catch (error) {
      return reply(
        { error: error instanceof Error ? error.message : "Dados inválidos." },
        400,
      );
    }
    return reply(
      await saveMarketing(
        marketingStorage(),
        storageOwner,
        input.revision,
        input.workspace,
      ),
    );
  } catch (error) {
    if (error instanceof MarketingConflict)
      return reply({ error: error.message }, 409);
    console.error(
      "[marketing] storage operation failed",
      error instanceof Error ? error.message : "unknown",
    );
    return reply(
      {
        error:
          "Não foi possível acessar o salvamento. Tente novamente; nenhuma alteração local foi descartada.",
      },
      503,
    );
  }
}
export function GET(request: NextRequest) {
  return handle(request, false);
}
export function PUT(request: NextRequest) {
  return handle(request, true);
}
