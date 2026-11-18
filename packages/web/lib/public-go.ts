import { createHash } from "node:crypto";
import { db } from "./db.ts";
import { publicCampaignHistory, publicCampaignLink, publicMonetizedTarget, publicOfferHistory, recordPublicClick,publicWorkspaceLink } from "./public-offer-db.ts";
import { isCampaignLinkCode } from "./commerce-contract.ts";
import { optionDetailPath } from "./offer-option.ts";

export async function publicGo(request: Request, slug: string, code: string | null, sqlFactory: typeof db = db): Promise<Response> {
  try {
    const option=new URL(request.url).searchParams.get('opcao');
    if (code && (!isCampaignLinkCode(code) || !await publicCampaignLink(code, slug, sqlFactory))) {
      const history=isCampaignLinkCode(code)?await publicCampaignHistory(code,slug,sqlFactory):null;
      if(history && (!option || option===history.option_key))
        return new Response(null,{status:302,headers:{Location:optionDetailPath(slug,history.option_key??undefined),'Cache-Control':'no-store'}});
      return new Response("Link de campanha inválido", { status: 404 });
    }
    const stored=code?await publicWorkspaceLink(code,slug,sqlFactory):null;
    if(stored?.workspace&&!stored.available)return new Response('Esta opção precisa de nova conferência',{status:404});
    if(stored?.workspace && option && option!==stored.option_key)
      return new Response('A opção não corresponde ao link de campanha',{status:404,headers:{'Cache-Control':'no-store'}});
    const target = await publicMonetizedTarget(slug, sqlFactory,option ?? (stored?.workspace ? stored.option_key : null));
    if (!target) {
      if (await publicOfferHistory(slug,sqlFactory)) return new Response(null,{status:302,headers:{Location:`/bizu/${encodeURIComponent(slug)}`,"Cache-Control":"no-store"}});
      return new Response("Oferta ou monetização indisponível", { status: 404 });
    }
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
