/**
 * Botão injetado no card (E5). Shadow DOM para não herdar CSS do ML. O clique
 * é o ÚNICO gatilho de envio: extrai só o card clicado e manda ao service
 * worker. O observer apenas decora — nunca envia.
 */

import { extractCard, type ExtractedCard } from "./card-extractor.ts";
import { extractAmazonCardFromElement, extractAmazonProductFromDoc } from "./amazon-extractor.ts";
import { newRequestId } from "../lib/contracts.ts";

export type CaptureResponse = {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
  publication?: { slug: string; url: string };
};

const BTN = {
  idle: "Adicionar ao BizuMiner",
  saving: "Salvando…",
  done: "✓ Adicionado",
  error: "Tentar novamente",
  reconnect: "Reconectar extensão",
} as const;

const COLORS = {
  bg: "#dfff70",
  ink: "#151515",
  done: "#2563eb",
  error: "#a52a24",
};

export function decorateCard(card: Element): boolean {
  if (card.querySelector("[data-bizuminer]")) return false;

  const host = document.createElement("div");
  host.setAttribute("data-bizuminer", "");
  host.style.cssText = "position:absolute;top:8px;right:8px;z-index:999;";
  const shadow = host.attachShadow({ mode: "open" });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = BTN.idle;
  btn.style.cssText =
    `font:600 12px/1 system-ui,-apple-system,sans-serif;color:${COLORS.ink};` +
    `background:${COLORS.bg};border:none;border-radius:999px;padding:7px 12px;` +
    `cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);`;
  shadow.appendChild(btn);

  const setState = (label: string, bg: string) => {
    btn.textContent = label;
    btn.style.background = bg;
  };

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    void handleClick(card, setState);
  });

  const cardEl = card as HTMLElement;
  if (getComputedStyle(cardEl).position === "static") cardEl.style.position = "relative";
  card.appendChild(host);
  return true;
}

async function handleClick(card: Element, setState: (label: string, bg: string) => void): Promise<void> {
  const isAmazon = /(^|\.)amazon\.com\.br$/.test(window.location.hostname);
  const isMlPdp = !isAmazon && !card.classList.contains("poly-card") && Boolean(document.querySelector("h1.ui-pdp-title"));
  let extracted = isAmazon
    ? (card.hasAttribute("data-asin")
        ? extractAmazonCardFromElement(card)
        : extractAmazonProductFromDoc(document, window.location.href))
    : isMlPdp
      ? extractMlProductFromDoc(document, window.location.href)
      : (extractCard(card.outerHTML) ?? extractMlProductFromDoc(document, window.location.href));

  if (!extracted) {
    // Card incompleto: fallback PDP (nunca capturar vazio em silêncio).
    setState("Abrir produto para completar", COLORS.error);
    if (!isAmazon && !isMlPdp) {
      window.open(extractProductLink(card.outerHTML) ?? window.location.href, "_blank", "noopener");
    }
    return;
  }

  const requestId = newRequestId();
  setState(BTN.saving, COLORS.bg);

  let response: CaptureResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "CAPTURE",
      requestId,
      card: extracted,
      pageUrl: isMlPdp ? extracted.productUrl : window.location.href,
    })) as CaptureResponse;
  } catch {
    setState(BTN.error, COLORS.bg);
    return;
  }

  if (response.ok) {
    setState(BTN.done, COLORS.done);
    if (response.publication?.url) {
      void copyText(response.publication.url);
    }
  } else if (response.error === "not_paired") {
    setState(BTN.reconnect, COLORS.error);
  } else if (response.error === "queued") {
    setState("Salvo — envio pendente", COLORS.bg);
  } else {
    setState(BTN.error, COLORS.bg);
  }
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // clipboard indisponível no mundo isolado: não quebra o fluxo.
  }
}

function extractProductLink(html: string): string | null {
  const m = /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"/.exec(html);
  if (!m) return null;
  try {
    return new URL(m[1]!.replace(/&amp;/g, "&"), "https://www.mercadolivre.com.br").toString();
  } catch {
    return null;
  }
}

export function extractMlProductFromDoc(doc: Document, pageHref: string): ExtractedCard | null {
  let page: URL;
  try {
    page = new URL(pageHref);
  } catch {
    return null;
  }
  if (page.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/i.test(page.hostname)) return null;
  const normalizedPath = page.pathname.replace(/\/+$/, "");
  const title = (doc.querySelector("h1.ui-pdp-title")?.textContent || "").replace(/\s+/gu, " ").trim();
  if (!title || title.length < 3 || title.length > 2000) return null;

  const pageFragment = new URLSearchParams(page.hash.slice(1));
  const pageFiltered = (page.searchParams.get("pdp_filters") || pageFragment.get("pdp_filters") || "").match(/item_id:(MLB\d{6,})/i);
  const pageDirect = !normalizedPath.includes("/p/") ? normalizedPath.match(/\/MLB-?(\d{6,})/i) : null;
  const domItemInput = doc.querySelector<HTMLInputElement>('input[name="item_id"], input[name="itemId"]')?.value || "";
  const domMetaApp = doc.querySelector('meta[name="twitter:app:url:iphone"], meta[property="al:ios:url"], meta[property="al:android:url"]')?.getAttribute("content") || "";
  const domMetaMatch = domMetaApp.match(/id=(MLB\d{6,})/i);
  const domActionLink = doc.querySelector<HTMLAnchorElement>('.ui-pdp-container a[href*="wid=MLB"], .ui-pdp-container a[href*="item_id:MLB"], .ui-pdp-container a[href*="item_id=MLB"]')?.href || "";
  const domActionMatch = domActionLink.match(/(?:wid=|item_id[:=])(MLB\d{6,})/i);
  let scriptItemId = "";
  for (const s of Array.from(doc.querySelectorAll("script"))) {
    const m = /"item_id"\s*:\s*"(MLB\d{6,})"/i.exec(s.textContent || "");
    if (m) { scriptItemId = m[1]!.toUpperCase(); break; }
  }
  const listingId = (
    page.searchParams.get("wid") ||
    pageFragment.get("wid") ||
    (pageFiltered ? pageFiltered[1] : "") ||
    (/^MLB\d{6,}$/i.test(domItemInput) ? domItemInput : "") ||
    (domMetaMatch ? domMetaMatch[1] : "") ||
    (domActionMatch ? domActionMatch[1] : "") ||
    scriptItemId
  ).toUpperCase();
  const externalId = listingId || (pageDirect ? "MLB" + pageDirect[1] : "");
  if (!/^MLB\d{6,}$/.test(externalId)) return null;

  const money = (label: string | null): number | undefined => {
    const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/i.exec(label || "");
    return m ? Number(m[1]!.replace(/\./g, "")) * 100 + Number(m[2] || 0) : undefined;
  };
  const priceRoot =
    doc.querySelector(".ui-pdp-price__second-line") ||
    doc.querySelector(".ui-pdp-price__main-container") ||
    doc.querySelector(".ui-pdp-price");
  const priceEl =
    doc.querySelector('.ui-pdp-price__second-line [aria-label*="reais" i]') ||
    doc.querySelector('.ui-pdp-price__second-line[aria-label*="reais" i]') ||
    priceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous)[aria-label*="reais" i]') ||
    priceRoot?.querySelector('.andes-money-amount:not(.andes-money-amount--previous) [aria-label*="reais" i]') ||
    priceRoot?.querySelector('[aria-label*="reais" i]:not([aria-label^="Antes:" i])');
  const priceLabel = priceEl?.getAttribute("aria-label") || "";
  if (/\b(?:faixa|entre)\b/i.test(priceLabel)) return null;
  let priceCents = money(priceLabel || null);
  if (!priceCents && priceRoot) {
    const amountBox = priceRoot.querySelector(".andes-money-amount:not(.andes-money-amount--previous)") || priceRoot;
    const frac = (amountBox.querySelector(".andes-money-amount__fraction")?.textContent || "").replace(/\./g, "").trim();
    const cents = (amountBox.querySelector(".andes-money-amount__cents")?.textContent || "").trim();
    if (/^\d+$/.test(frac)) {
      priceCents = Number(frac) * 100 + (/^\d{1,2}$/.test(cents) ? Number(cents.padEnd(2, "0")) : 0);
    }
  }
  if (!priceCents || priceCents <= 0) return null;

  const originalEl =
    doc.querySelector('.ui-pdp-price__original-value [aria-label*="reais" i]') ||
    doc.querySelector('.ui-pdp-price__original-value[aria-label*="reais" i]') ||
    doc.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous[aria-label*="reais" i]') ||
    doc.querySelector('.ui-pdp-price__main-container .andes-money-amount--previous [aria-label*="reais" i]') ||
    doc.querySelector('.ui-pdp-price [aria-label^="Antes:" i]');
  const originalPriceCents = money(originalEl?.getAttribute("aria-label") || null);
  const img = doc.querySelector<HTMLImageElement>(
    'img.ui-pdp-image[src^="https://"], img[data-zoom][src*=".mlstatic.com/"], .ui-pdp-gallery img[src*=".mlstatic.com/"]',
  );
  const imageUrl = img?.src?.startsWith("https://") ? img.src : img?.getAttribute("data-src") || undefined;
  const productUrl = page.origin + normalizedPath + (listingId || normalizedPath.includes("/p/") ? `?wid=${externalId}` : "");

  return {
    externalId,
    title,
    productUrl,
    ...(imageUrl?.startsWith("https://") ? { imageUrl } : {}),
    priceCents,
    currency: "BRL",
    priceType: /a\s+partir\s+de/i.test(priceLabel) ? "from" : "exact",
    ...(originalPriceCents && originalPriceCents > priceCents ? { originalPriceCents } : {}),
    marketplace: "mercadolivre",
  };
}
