/**
 * Observer do catálogo (E5). Decora cards novos que o scroll infinito injeta.
 * Só marca/decora — NÃO envia nada (I1).
 */

export function findCards(): Element[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".poly-card"));
}

export function observeCatalog(onNewCard: (card: Element) => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (node.classList.contains("poly-card")) {
          onNewCard(node);
          continue;
        }
        for (const card of Array.from(node.querySelectorAll<HTMLElement>(".poly-card"))) {
          onNewCard(card);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
