"use client";

import { useEffect, useState } from "react";
import { mergeSavedProducts, readSavedState, writeSavedState } from "../../../lib/saved-products";
import type { VitrineProduct } from "../../../lib/deal-view";

export default function SaveDealButton({ product }: { product: VitrineProduct }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const state = readSavedState(window.localStorage);
    setSaved(state.ids.includes(product.id));
    setReady(true);
  }, [product.id]);

  function toggle() {
    const state = readSavedState(window.localStorage);
    const isSaved = state.ids.includes(product.id);
    const ids = isSaved ? state.ids.filter((id) => id !== product.id) : [...state.ids, product.id];
    const products = isSaved
      ? state.products.filter((item) => item.id !== product.id)
      : mergeSavedProducts(ids, state.products, [product]);
    writeSavedState(window.localStorage, { ids, products });
    setSaved(!isSaved);
    // Espelha no servidor (área do comprador); o localStorage segue como cache local.
    void fetch("/api/minha/favoritos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, saved: !isSaved }),
    }).catch(() => {});
  }

  return <button className={saved ? "detail-save-button active" : "detail-save-button"} type="button" aria-label={`${saved ? "Remover" : "Salvar"} ${product.title}`} aria-pressed={saved} disabled={!ready} onClick={toggle}><span aria-hidden="true">{saved ? "♥" : "♡"}</span><b>{saved ? "salvo" : "salvar"}</b></button>;
}
