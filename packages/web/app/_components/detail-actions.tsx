"use client";

import { useEffect, useState } from "react";
import { requestFavorite } from "../../lib/member-actions";
import type { VitrineProduct } from "../../lib/deal-view";
import { mergeSavedProducts, readSavedState, writeSavedState } from "../../lib/saved-products";

const INTENT_KEY = "bizuminer:watch-intent";

type Props = { product: VitrineProduct; initialSaved: boolean; initialWatching: boolean; isLoggedIn: boolean; cacheScope: string | null };

export default function DetailActions({ product, initialSaved, initialWatching, isLoggedIn, cacheScope }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [watching, setWatching] = useState(initialWatching);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingSessionSaves, setPendingSessionSaves] = useState(0);
  useEffect(() => {
    if (!isLoggedIn) {
      try { setSaved(readSavedState(sessionStorage).ids.includes(product.id)); } catch { /* Optional cache. */ }
      return;
    }
    try { setPendingSessionSaves(readSavedState(sessionStorage).ids.length); } catch { /* Optional cache. */ }
    let intent: string | null = null;
    try { intent = sessionStorage.getItem(INTENT_KEY); } catch { /* Optional cache. */ }
    if (intent !== product.id) return;
    try { sessionStorage.removeItem(INTENT_KEY); } catch { /* Optional cache. */ }
    void changeWatch(true);
    // Only run once for the product and login state; an explicit click owns the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, isLoggedIn]);

  async function save() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const next = !saved;
      if (isLoggedIn) {
        await requestFavorite(product.id, next);
      }
      try {
        const storage = sessionStorage;
        const state = readSavedState(storage, cacheScope);
        const ids = next ? [...new Set([...state.ids, product.id])] : state.ids.filter((id) => id !== product.id);
        writeSavedState(storage, { ids, products: mergeSavedProducts(ids, state.products, next ? [product] : []) }, cacheScope);
      } catch (error) {
        if (!isLoggedIn) throw error;
      }
      setSaved(next);
      setNotice(next ? isLoggedIn ? "Salvo na sua conta." : "Salvo neste navegador." : "Removido dos salvos.");
    } catch { setNotice("Não foi possível atualizar seus salvos. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function changeWatch(next: boolean) {
    if (!isLoggedIn) {
      try { sessionStorage.setItem(INTENT_KEY, product.id); } catch { setNotice("Não foi possível guardar sua escolha. Entre e tente novamente."); return; }
      window.location.assign(`/entrar?next=${encodeURIComponent(`/bizu/${product.slug}`)}`);
      return;
    }
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/minha/acompanhar", { method: next ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error();
      setWatching(next);
      setNotice(next ? "Acompanhando. Consulte mudanças comparáveis na sua área." : "Acompanhamento encerrado.");
    } catch { setNotice(next ? "Não foi possível acompanhar. É necessário um preço recente; tente novamente." : "Não foi possível parar o acompanhamento. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <div className="detail-actions">
    <button className={saved ? "detail-save-button active" : "detail-save-button"} type="button" aria-label={saved ? "Remover dos salvos" : "Salvar produto"} aria-pressed={saved} disabled={busy} onClick={() => void save()}><span aria-hidden="true">{saved ? "♥" : "♡"}</span><b>{saved ? "salvo" : "salvar"}</b></button>
    <button className="detail-save-button" type="button" aria-pressed={watching} disabled={busy} onClick={() => void changeWatch(!watching)}>{watching ? "parar de acompanhar" : "acompanhar preço"}</button>
    <p aria-live="polite">{notice || "Acompanhe mudanças comparáveis na sua área."}</p>
    {isLoggedIn && pendingSessionSaves > 0 && <p>Você tem {pendingSessionSaves} {pendingSessionSaves === 1 ? "salvo desta sessão" : "salvos desta sessão"}. <a href="/minha-area">Escolher sincronizar com sua conta</a>.</p>}
  </div>;
}
