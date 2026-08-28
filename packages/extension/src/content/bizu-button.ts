/**
 * Botão injetado no card (E5). Shadow DOM para não herdar CSS do ML. O clique
 * é o ÚNICO gatilho de envio: extrai só o card clicado e manda ao service
 * worker. O observer apenas decora — nunca envia.
 */

import { extractCard } from "./card-extractor.ts";
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
  const extracted = extractCard(card.outerHTML);
  if (!extracted) {
    // Card incompleto: fallback PDP (nunca capturar vazio em silêncio).
    setState("Abrir produto para completar", COLORS.error);
    window.open(extractProductLink(card.outerHTML) ?? window.location.href, "_blank", "noopener");
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
      pageUrl: window.location.href,
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
