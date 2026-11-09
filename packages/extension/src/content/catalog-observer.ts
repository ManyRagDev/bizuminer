/**
 * Observer do catálogo (E5 / Track 017). Decora cards novos que o scroll infinito injeta
 * no Mercado Livre e na Amazon Brasil. Só marca/decora — NÃO envia nada (I1).
 */

function isAmazonPage(): boolean {
  return typeof window !== "undefined" && /(^|\.)amazon\.com\.br$/.test(window.location.hostname);
}

export function findCards(): Element[] {
  if (isAmazonPage()) {
    // 1. Página de produto individual (PDP)
    const pdpContainer =
      document.querySelector("#titleSection") ||
      document.querySelector("#centerCol") ||
      document.querySelector("#desktop_buybox") ||
      document.querySelector("#dp");
    if (pdpContainer && document.querySelector("#productTitle, #title")) {
      return [pdpContainer];
    }
    // 2. Página de ofertas, busca ou listagem
    const amazonCards = Array.from(
      document.querySelectorAll<HTMLElement>("div[data-asin]:not([data-asin='']), .s-result-item[data-asin]:not([data-asin=''])"),
    );
    if (amazonCards.length > 0) return amazonCards;
    return [];
  }
  return Array.from(document.querySelectorAll<HTMLElement>(".poly-card"));
}

export function observeCatalog(onNewCard: (card: Element) => void): MutationObserver {
  const isAmazon = isAmazonPage();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (isAmazon) {
          if (node.hasAttribute("data-asin") && node.getAttribute("data-asin") !== "") {
            onNewCard(node);
            continue;
          }
          for (const card of Array.from(node.querySelectorAll<HTMLElement>("div[data-asin]:not([data-asin=''])"))) {
            onNewCard(card);
          }
        } else {
          if (node.classList.contains("poly-card")) {
            onNewCard(node);
            continue;
          }
          for (const card of Array.from(node.querySelectorAll<HTMLElement>(".poly-card"))) {
            onNewCard(card);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
