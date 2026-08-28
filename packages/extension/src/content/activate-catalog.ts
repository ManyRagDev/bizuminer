/**
 * Entrada do content script (E5). Injetada via chrome.scripting após o clique
 * no ícone ("Ativar nesta página"). Decora os cards já renderizados e instala
 * o observer para os novos. Ativar NÃO envia nada — só o clique no botão envia.
 */

import { decorateCard } from "./bizu-button.ts";
import { findCards, observeCatalog } from "./catalog-observer.ts";

function activate(): void {
  const cards = findCards();
  for (const card of cards) decorateCard(card);
  observeCatalog((card) => decorateCard(card));
}

activate();
