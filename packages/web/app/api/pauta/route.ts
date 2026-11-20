import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../lib/api-auth";
import { marketplaceDef } from "../../../lib/marketplaces";
import { confirmPautaExposure, discardPautaPreparation, preparePautaCopy, readLivePauta, readPautaVersion, readPendingPautaPreparations, skipPautaOffer, skipPautaOffersBatch } from "../../../lib/pauta-db.ts";
import { enrichPautaResponse } from "../../../lib/pauta-response.ts";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const channel = request.nextUrl.searchParams.get("canal") === "stories" ? "stories" : "whatsapp";
  const marketplace = marketplaceDef(request.nextUrl.searchParams.get("loja") ?? "")?.slug ?? null;
  try {
    const knownRevision = request.nextUrl.searchParams.get("revision");
    if (knownRevision && knownRevision === await readPautaVersion(check.context, channel)) {
      const preparations = await readPendingPautaPreparations(check.context, channel);
      return sinkJson(check.sink, { unchanged: true, revision: knownRevision, preparations }, { headers: noStore });
    }
    const selection = await readLivePauta(check.context, channel, marketplace);
    const enriched = enrichPautaResponse(selection, check.context.tenantId);
    return sinkJson(check.sink, { ...enriched, channel }, { headers: noStore });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    console.error("pauta_read_failed", { tenantId: check.context.tenantId, channel, code });
    return sinkJson(check.sink, { ok: false, error: "pauta_unavailable" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind !== "ok") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || (body.channel !== "whatsapp" && body.channel !== "stories")) {
    return Response.json({ ok: false, error: "invalid_channel" }, { status: 400 });
  }

  if (body.action === "skip_batch") {
    if (!Array.isArray(body.items) || !body.items.length) {
      return sinkJson(check.sink, { ok: false, error: "invalid_items" }, { status: 400, headers: noStore });
    }
    const validItems = body.items.filter((item: unknown): item is { confirmationId: string; productId: string } => {
      return typeof item === "object" && item !== null
        && typeof (item as any).confirmationId === "string"
        && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test((item as any).confirmationId)
        && typeof (item as any).productId === "string"
        && /^[a-zA-Z0-9_-]{1,120}$/.test((item as any).productId);
    });
    if (!validItems.length) {
      return sinkJson(check.sink, { ok: false, error: "no_valid_items" }, { status: 400, headers: noStore });
    }
    const ok = await skipPautaOffersBatch(check.context, body.channel, validItems);
    return sinkJson(check.sink, { ok }, { status: ok ? 200 : 409, headers: noStore });
  }

  if (typeof body.confirmationId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.confirmationId)
    || typeof body.productId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.productId)) {
    return Response.json({ ok: false, error: "invalid_exposure" }, { status: 400 });
  }

  if (body.action === "prepare") {
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 12000)
      return sinkJson(check.sink, { ok: false, error: "invalid_preparation" }, { status: 400, headers: noStore });
    if (body.slotId !== undefined && (typeof body.slotId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.slotId)))
      return sinkJson(check.sink, { ok: false, error: "invalid_slot" }, { status: 400, headers: noStore });
    if (body.requestId !== undefined && (typeof body.requestId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.requestId)))
      return sinkJson(check.sink, { ok: false, error: "invalid_preparation" }, { status: 400, headers: noStore });
    const confirmationId = await preparePautaCopy(check.context, body.channel, body.confirmationId, body.productId, body.text, undefined, body.slotId, body.requestId);
    return sinkJson(check.sink, { ok: confirmationId !== null, confirmationId },
      { status: confirmationId ? 200 : 409, headers: noStore });
  }

  if (body.action === "discard") {
    const ok = await discardPautaPreparation(check.context, body.channel, body.confirmationId, body.productId);
    return sinkJson(check.sink, { ok }, { status: ok ? 200 : 409, headers: noStore });
  }

  if (body.action === "skip") {
    const ok = await skipPautaOffer(check.context, body.channel, body.confirmationId, body.productId);
    return sinkJson(check.sink, { ok }, { status: ok ? 200 : 409, headers: noStore });
  }

  if (body.action !== undefined && body.action !== "confirm")
    return sinkJson(check.sink, { ok: false, error: "invalid_action" }, { status: 400, headers: noStore });

  const ok = await confirmPautaExposure(check.context, body.channel, body.confirmationId, body.productId);
  return sinkJson(check.sink, { ok }, { status: ok ? 200 : 409, headers: noStore });
}
