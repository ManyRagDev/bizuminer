/** Self-contained PDP reader for execution in the logged-in active browser. */
export function collectMercadoLivreProduct() {
  const page=new URL(location.href);
  if (page.protocol!=="https:" || !/(^|\.)mercadolivre\.com\.br$/i.test(page.hostname)) return null;
  const externalId=(page.searchParams.get("wid") ?? page.pathname.match(/MLB-?(\d{6,})/i)?.[1]?.replace(/^(\d)/,"MLB$1"))?.toUpperCase();
  if (!externalId || !/^MLB\d{6,}$/.test(externalId)) return null;
  if (document.querySelector('iframe[src*="captcha" i], form[action*="validateCaptcha" i], #captchacharacters'))
    return {status:"blocked" as const,products:[]};
  if (document.querySelector('form[action*="signin" i], form[action*="login" i]')) return {status:"needs_login" as const,products:[]};
  const heading=(document.querySelector("h1.ui-pdp-title")?.textContent ?? "").trim().replace(/\s+/g," ");
  const unavailable=document.querySelector('.ui-pdp-message--error, .ui-pdp-not-found, [data-testid="item-unavailable"]');
  if (unavailable && /(?:an[uú]ncio|produto|item).{0,60}(?:indispon[ií]vel|n[aã]o est[aá] dispon[ií]vel|n[aã]o existe)/i.test(unavailable.textContent ?? "")) {
    // A message alongside a selected or selectable variation can describe
    // that option only; it does not prove the entire listing unavailable.
    const ambiguous=page.searchParams.has('variation') || !!document.querySelector('[data-variation-id], [class*="ui-pdp-variations"]');
    return {status:ambiguous ? "configuration_mismatch" as const : "unavailable_confirmed" as const,products:[]};
  }
  const priceRoot=document.querySelector('.ui-pdp-price__second-line, .ui-pdp-price__main-container');
  const amount=priceRoot?.querySelector('[aria-label*="reais" i]');
  if (heading && !priceRoot) return {status:"no_price" as const,products:[]};
  const label=amount?.getAttribute("aria-label") ?? "";
  const match=/(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/i.exec(label);
  const priceCents=match ? Number(match[1]!.replace(/\./g,""))*100+Number(match[2] ?? 0) : 0;
  if (!heading || !Number.isSafeInteger(priceCents) || priceCents<=0 || /\b(?:faixa|entre)\b/i.test(label)) return {status:"parse_error" as const,products:[]};
  const image=document.querySelector<HTMLImageElement>('img.ui-pdp-image, img[data-zoom][src*="mlstatic.com"]');
  const selected=document.querySelector('[data-variation-id][aria-checked="true"], [data-variation-id][aria-selected="true"]');
  const shownId=selected?.getAttribute('data-variation-id')?.trim();
  const requestedId=page.searchParams.get('variation');
  const variantKey=shownId && /^\d{1,24}$/.test(shownId) && (!requestedId || requestedId===shownId) ? shownId : undefined;
  if ((requestedId || shownId) && !variantKey) return {status:"configuration_mismatch" as const,products:[]};
  const variantLabel=variantKey ? (selected?.getAttribute('aria-label') ?? selected?.getAttribute('title') ?? selected?.textContent ?? '').trim().replace(/\s+/g,' ').slice(0,100) : undefined;
  const productUrl=page.origin+page.pathname+(page.searchParams.has("wid") ? `?wid=${encodeURIComponent(externalId)}` : "");
  let cdEndsAt: string | undefined;
  const cdEl = document.querySelector(".poly-component__countdown")
    || Array.from(document.querySelectorAll("[class*='countdown']")).find((el) => el.querySelectorAll(".poly-countdown__block").length >= 2);
  if (cdEl) {
    const blocks = Array.from(cdEl.querySelectorAll(".poly-countdown__block")).slice(0, 3);
    if (blocks.length === 2 || blocks.length === 3) {
      const nums: number[] = [];
      for (const b of blocks) {
        const rollers = Array.from(b.querySelectorAll(".poly-countdown__roller-container"));
        let digits = "";
        if (rollers.length > 0) {
          for (const r of rollers) {
            const st = r.querySelector(".poly-countdown__digit--static") || r.querySelector(".poly-countdown__digit");
            const t = (st?.textContent || "").trim();
            if (/^\d{1,2}$/.test(t)) digits += t;
          }
        } else {
          digits = Array.from(b.querySelectorAll(".poly-countdown__digit--static, .poly-countdown__digit"))
            .map((d) => (d.textContent || "").trim())
            .filter((t) => /^\d{1,2}$/.test(t))
            .slice(0, 2)
            .join("");
        }
        if (digits) {
          const val = parseInt(digits, 10);
          if (Number.isFinite(val)) nums.push(val);
        }
      }
      let sec = 0;
      if (nums.length === 3) sec = (nums[0] || 0) * 3600 + (nums[1] || 0) * 60 + (nums[2] || 0);
      else if (nums.length === 2) sec = (nums[0] || 0) * 60 + (nums[1] || 0);
      if (sec > 0) cdEndsAt = new Date(Date.now() + sec * 1000).toISOString();
    }
  }
  const catalogId = page.pathname.match(/\/p\/(MLB\d{6,})/i)?.[1]?.toUpperCase();
  const candidateIds = [externalId, catalogId].filter((id): id is string => Boolean(id));
  if (!cdEndsAt && typeof document.querySelectorAll === "function") {
    for (const s of Array.from(document.querySelectorAll("script"))) {
      const text = s.textContent || "";
      if (!text.includes("period_end") && !text.includes("finish_date")) continue;
      for (const id of candidateIds) {
        if (!text.includes(id)) continue;
        const idToken = `"id":"${id}"`;
        let idIdx = text.indexOf(idToken);
        if (idIdx === -1) idIdx = text.indexOf(id);
        if (idIdx !== -1) {
          const nextCardIdx = text.indexOf('"metadata":{"id":', idIdx + 20);
          const endBound = nextCardIdx !== -1
            ? Math.min(text.length, nextCardIdx, idIdx + 10000)
            : Math.min(text.length, idIdx + 8000);
          const windowSlice = text.slice(idIdx, endBound);
          const m = /"(?:period_end|finish_date)"\s*:\s*"([^"]+)"/.exec(windowSlice);
          if (m && m[1]) {
            const endsMs = Date.parse(m[1]);
            if (Number.isFinite(endsMs) && endsMs > Date.now()) {
              cdEndsAt = new Date(endsMs).toISOString();
              break;
            }
          }
        }
        const kvsToken = `"${id}":{`;
        const kvsIdx = text.indexOf(kvsToken);
        if (kvsIdx !== -1) {
          const nextKvsIdx = text.indexOf('},"MLB', kvsIdx + kvsToken.length);
          const kvsBound = nextKvsIdx !== -1
            ? Math.min(text.length, nextKvsIdx + 2, kvsIdx + 2000)
            : Math.min(text.length, kvsIdx + 1500);
          const kvsSlice = text.slice(kvsIdx, kvsBound);
          const m2 = /"(?:finish_date|period_end)"\s*:\s*"([^"]+)"/.exec(kvsSlice);
          if (m2 && m2[1]) {
            const endsMs = Date.parse(m2[1]);
            if (Number.isFinite(endsMs) && endsMs > Date.now()) {
              cdEndsAt = new Date(endsMs).toISOString();
              break;
            }
          }
        }
      }
      if (cdEndsAt) break;
    }
  }

  return {status:"observed" as const,products:[{externalId,title:heading,productUrl,priceCents,currency:"BRL" as const,
    priceType:/a\s+partir\s+de/i.test(label) ? "from" as const : "exact" as const,
    ...(cdEndsAt ? {promotionType:"lightning" as const,promotionEndsAt:cdEndsAt} : {}),
    ...(variantKey ? {variantKey,...(variantLabel ? {variantLabel} : {})} : {}),
    ...(image?.src?.startsWith("https://") ? {imageUrl:image.src} : {})}]};
}
