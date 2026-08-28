"use strict";
(() => {
  // src/content/card-extractor.ts
  function decodeHtmlEntities(value) {
    const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    let decoded = value;
    for (let pass = 0; pass < 3; pass++) {
      const next = decoded.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, body) => {
        if (body.startsWith("#x")) {
          const cp = Number.parseInt(body.slice(2), 16);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity;
        }
        if (body.startsWith("#")) {
          const cp = Number.parseInt(body.slice(1), 10);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity;
        }
        return named[body.toLowerCase()] ?? entity;
      });
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  }
  function parseMoneyAria(label) {
    const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);
    if (!m) return null;
    const reais = Number(m[1].replace(/\./g, ""));
    if (!Number.isFinite(reais)) return null;
    return { reais, centavos: m[2] ? Number(m[2]) : 0 };
  }
  function extractCard(html) {
    const anchor = /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
    const titleAlt = /class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
    const href = anchor?.[1]?.replace(/&amp;/g, "&");
    const title = anchor?.[2] ?? titleAlt?.[1] ? decodeHtmlEntities((anchor?.[2] ?? titleAlt?.[1]).trim()) : void 0;
    if (!href || !title) return null;
    let url;
    try {
      url = new URL(href, "https://www.mercadolivre.com.br");
    } catch {
      return null;
    }
    const externalId = url.searchParams.get("wid") ?? url.pathname.match(/(MLB\d{6,})/)?.[1];
    if (!externalId) return null;
    const productUrl = `${url.origin}${url.pathname}`;
    const currentSection = html.slice(html.indexOf("poly-price__current"));
    const currentLabel = /aria-label="(?!Antes:)([^"]*?reais[^"]*?)"/.exec(currentSection)?.[1];
    const current = currentLabel ? parseMoneyAria(currentLabel) : null;
    if (!current) return null;
    const priceCents = current.reais * 100 + current.centavos;
    if (priceCents <= 0) return null;
    const previousLabel = /aria-label="Antes:\s*([^"]*?reais[^"]*?)"/.exec(html)?.[1];
    const previous = previousLabel ? parseMoneyAria(previousLabel) : null;
    const originalPriceCents = previous && previous.reais > 0 ? previous.reais * 100 + previous.centavos : void 0;
    const imageUrl = /<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/.exec(html)?.[1];
    return {
      externalId,
      title,
      productUrl,
      imageUrl,
      priceCents,
      originalPriceCents: originalPriceCents && originalPriceCents > priceCents ? originalPriceCents : void 0
    };
  }

  // src/lib/contracts.ts
  function newRequestId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }

  // src/content/bizu-button.ts
  var BTN = {
    idle: "Adicionar ao BizuMiner",
    saving: "Salvando\u2026",
    done: "\u2713 Adicionado",
    error: "Tentar novamente",
    reconnect: "Reconectar extens\xE3o"
  };
  var COLORS = {
    bg: "#dfff70",
    ink: "#151515",
    done: "#2563eb",
    error: "#a52a24"
  };
  function decorateCard(card) {
    if (card.querySelector("[data-bizuminer]")) return false;
    const host = document.createElement("div");
    host.setAttribute("data-bizuminer", "");
    host.style.cssText = "position:absolute;top:8px;right:8px;z-index:999;";
    const shadow = host.attachShadow({ mode: "open" });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = BTN.idle;
    btn.style.cssText = `font:600 12px/1 system-ui,-apple-system,sans-serif;color:${COLORS.ink};background:${COLORS.bg};border:none;border-radius:999px;padding:7px 12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);`;
    shadow.appendChild(btn);
    const setState = (label, bg) => {
      btn.textContent = label;
      btn.style.background = bg;
    };
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      void handleClick(card, setState);
    });
    const cardEl = card;
    if (getComputedStyle(cardEl).position === "static") cardEl.style.position = "relative";
    card.appendChild(host);
    return true;
  }
  async function handleClick(card, setState) {
    const extracted = extractCard(card.outerHTML);
    if (!extracted) {
      setState("Abrir produto para completar", COLORS.error);
      window.open(extractProductLink(card.outerHTML) ?? window.location.href, "_blank", "noopener");
      return;
    }
    const requestId = newRequestId();
    setState(BTN.saving, COLORS.bg);
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "CAPTURE",
        requestId,
        card: extracted,
        pageUrl: window.location.href
      });
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
      setState("Salvo \u2014 envio pendente", COLORS.bg);
    } else {
      setState(BTN.error, COLORS.bg);
    }
  }
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
    }
  }
  function extractProductLink(html) {
    const m = /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"/.exec(html);
    if (!m) return null;
    try {
      return new URL(m[1].replace(/&amp;/g, "&"), "https://www.mercadolivre.com.br").toString();
    } catch {
      return null;
    }
  }

  // src/content/catalog-observer.ts
  function findCards() {
    return Array.from(document.querySelectorAll(".poly-card"));
  }
  function observeCatalog(onNewCard) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.classList.contains("poly-card")) {
            onNewCard(node);
            continue;
          }
          for (const card of Array.from(node.querySelectorAll(".poly-card"))) {
            onNewCard(card);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  // src/content/activate-catalog.ts
  function activate() {
    const cards = findCards();
    for (const card of cards) decorateCard(card);
    observeCatalog((card) => decorateCard(card));
  }
  activate();
})();
