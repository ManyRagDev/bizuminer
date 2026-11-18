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
  return {status:"observed" as const,products:[{externalId,title:heading,productUrl,priceCents,currency:"BRL" as const,
    priceType:/a\s+partir\s+de/i.test(label) ? "from" as const : "exact" as const,
    ...(variantKey ? {variantKey,...(variantLabel ? {variantLabel} : {})} : {}),
    ...(image?.src?.startsWith("https://") ? {imageUrl:image.src} : {})}]};
}
