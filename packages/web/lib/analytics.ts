/**
 * Utilitários para rastreamento de métricas no Google Analytics 4 (GA4).
 * Suporta o ID de medição via variável de ambiente NEXT_PUBLIC_GA_ID.
 */

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || "";

declare global {
  interface Window {
    gtag?: (
      command: "event" | "config" | "set" | "js",
      targetIdOrAction: string | Date,
      params?: Record<string, unknown>
    ) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Dispara um evento genérico para o GA4 se estiver no navegador e o GA estiver ativo.
 */
export function trackEvent(action: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || !window.gtag) {
    return;
  }

  try {
    window.gtag("event", action, params);
  } catch (err) {
    console.warn("[analytics] Falha ao enviar evento:", action, err);
  }
}

/**
 * Registra a visualização de um item/oferta (evento padrão 'view_item' do GA4).
 */
export function trackViewItem({
  id,
  name,
  category,
  price,
  store,
}: {
  id: string;
  name: string;
  category?: string;
  price?: number;
  store?: string;
}) {
  trackEvent("view_item", {
    currency: "BRL",
    value: price,
    items: [
      {
        item_id: id,
        item_name: name,
        item_category: category,
        price: price,
        affiliation: store,
      },
    ],
  });
}

/**
 * Registra o clique para a loja parceira / link de afiliado.
 */
export function trackAffiliateClick({
  id,
  name,
  store,
  destinationUrl,
  price,
}: {
  id: string;
  name?: string;
  store?: string;
  destinationUrl?: string;
  price?: number;
}) {
  trackEvent("affiliate_click", {
    offer_id: id,
    offer_name: name,
    store: store,
    destination_url: destinationUrl,
    value: price,
    currency: "BRL",
  });
}

/**
 * Registra a cópia do código do cupom.
 */
export function trackCopyCoupon({
  id,
  couponCode,
  store,
}: {
  id: string;
  couponCode: string;
  store?: string;
}) {
  trackEvent("copy_coupon", {
    offer_id: id,
    coupon: couponCode,
    store: store,
  });
}

/**
 * Registra compartilhamento de oferta (WhatsApp, Telegram, Copiar Link, etc.).
 */
export function trackShare({
  id,
  method,
}: {
  id: string;
  method?: string;
}) {
  trackEvent("share", {
    method: method || "direct",
    content_type: "offer",
    item_id: id,
  });
}
