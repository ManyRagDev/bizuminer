import { createHash } from "node:crypto";
import { db } from "./db.ts";
import { publicCampaignLink, publicMonetizedTarget, recordPublicClick } from "./public-offer-db.ts";
import { isCampaignLinkCode } from "./commerce-contract.ts";

export async function publicGo(request: Request, slug: string, code: string | null, sqlFactory: typeof db = db): Promise<Response> {
  try {
    if (code && (!isCampaignLinkCode(code) || !await publicCampaignLink(code, slug, sqlFactory))) {
      return new Response("Link de campanha inválido", { status: 404 });
    }
    const target = await publicMonetizedTarget(slug, sqlFactory);
    if (!target) return new Response("Oferta ou monetização indisponível", { status: 404 });
    const agent = request.headers.get("user-agent");
    const knownPreview = /facebookexternalhit|twitterbot|telegrambot|slackbot|discordbot|crawler|spider/i.test(agent ?? "");
    if (!knownPreview && request.method !== "HEAD") {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
      try {
        await recordPublicClick(slug, code, { agent, referer: request.headers.get("referer"), ipHash: createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0,32) }, sqlFactory);
      } catch { /* Telemetry availability cannot remove valid monetization. */ }
    }
    return new Response(null, { status: 302, headers: { Location: target.url, "Cache-Control": "no-store" } });
  } catch {
    return new Response("Não foi possível verificar a oferta agora", { status: 503 });
  }
}
