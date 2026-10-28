"use client";

import { useEffect, useRef, useState } from "react";
import { composeMessage, COMPOSER_MAX_SELECTION } from "../../lib/composer";
import { priceHighlight } from "../../lib/deal-signal";
import { offerPriceLabel } from "../../lib/offer-price";
import type { ProductPresentation } from "../../lib/product-presentation";

type SearchProduct = Partial<ProductPresentation> & {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  previousMinPriceCents: number | null;
  observationCount: number;
  historyDays: number;
  lowestVerified: boolean;
  marketplace: string;
};

type Destination = "whatsapp" | "telegram";

function signalLabel(product: SearchProduct): string | null {
  if (product.priceType !== "exact" || product.currency !== "BRL") return null;
  const highlight = priceHighlight({
    priceCents: product.priceCents,
    previousMinPriceCents: product.previousMinPriceCents,
    observationCount: product.observationCount,
    historyDays: product.historyDays,
    lowestVerified: product.lowestVerified,
  });
  if (!highlight) return null;
  return highlight.tone === "unproven" ? null : highlight.label;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function Composer({ baseUrl }: { baseUrl: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [selected, setSelected] = useState<SearchProduct[]>([]);
  const [destination, setDestination] = useState<Destination>("whatsapp");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");
  const message = composeMessage(selected, destination, baseUrl);
  const selectedIds = useRef(new Set<string>());

  useEffect(() => {
    selectedIds.current = new Set(selected.map((product) => product.id));
  }, [selected]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/deals?limit=24");
        const payload = (await response.json()) as { products: SearchProduct[] };
        setResults(payload.products ?? []);
      } catch {
        setResults([]);
      }
    })();
  }, []);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    setSearching(true);
    setSearchedFor(term);
    try {
      const url = `/api/deals?limit=24${term ? `&q=${encodeURIComponent(term)}` : ""}`;
      const response = await fetch(url);
      const payload = (await response.json()) as { products: SearchProduct[] };
      setResults(payload.products ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function toggle(product: SearchProduct) {
    setCopied(false);
    setSelected((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current.filter((item) => item.id !== product.id);
      }
      if (current.length >= COMPOSER_MAX_SELECTION) return current;
      return [...current, product];
    });
  }

  function remove(id: string) {
    setCopied(false);
    setSelected((current) => current.filter((item) => item.id !== id));
  }

  async function copy() {
    if (!message || copying) return;
    setCopying(true); setCopyError(""); setCopied(false);
    try {
      const response = await fetch(`/api/deals/selected?ids=${encodeURIComponent(selected.map(product => product.id).join(","))}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível conferir as ofertas agora. Tente novamente.");
      const payload = await response.json() as { ready: boolean; products: SearchProduct[] };
      if (!payload.ready) throw new Error("A conferência de ofertas ainda não está disponível neste ambiente.");
      setSelected(payload.products);
      if (payload.products.length !== selected.length) throw new Error("Um produto deixou de estar disponível. Confira a seleção atualizada antes de copiar.");
      const currentMessage = composeMessage(payload.products, destination, baseUrl);
      const ok = await copyText(currentMessage);
      setCopied(ok);
      if (!ok) setCopyError("Não foi possível copiar. Selecione o texto atualizado abaixo.");
    } catch (error) { setCopyError(error instanceof Error ? error.message : "Não foi possível conferir as ofertas agora."); }
    finally { setCopying(false); }
  }

  const lot = selected.length > 1;
  const fullSelection = selected.length >= COMPOSER_MAX_SELECTION;

  return (
    <section className="admin-section composer-section" aria-labelledby="composer-title">
      <h2 id="composer-title">Composer — montar a mensagem</h2>

      <form className="composer-search" onSubmit={(event) => void search(event)} role="search">
        <label className="sr-only" htmlFor="composer-busca">Buscar produto no catálogo</label>
        <input
          id="composer-busca"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar produto no catálogo…"
        />
        <button type="submit" disabled={searching}>{searching ? "buscando…" : "buscar"}</button>
      </form>

      <div className="composer-results" aria-live="polite">
        {results.length === 0 && !searching && (
          <p className="composer-note">{searchedFor ? "Nenhum produto encontrado para essa busca." : "O catálogo vem do banco — busque ou selecione abaixo."}</p>
        )}
        <ul>
          {results.map((product) => {
            const checked = selected.some((item) => item.id === product.id);
            const disabled = !checked && fullSelection;
            const label = signalLabel(product);
            return (
              <li key={product.id} className={checked ? "composer-result checked" : "composer-result"}>
                <label>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(product)} />
                  <span className="composer-result-main">
                    <b>{product.displayTitle ?? product.title}</b>
                    <small>{offerPriceLabel(product)}{label ? ` · ${label}` : ""}</small>
                  </span>
                </label>
                <a href={`/bizu/${product.slug}`} target="_blank" rel="noreferrer">ver no site ↗</a>
              </li>
            );
          })}
        </ul>
        {fullSelection && !searchedFor && (
          <p className="composer-note">Limite de {COMPOSER_MAX_SELECTION} produtos por mensagem atingido.</p>
        )}
      </div>

      {selected.length > 0 && (
        <div className="composer-picked">
          <span className="composer-picked-label">selecionados ({selected.length}/{COMPOSER_MAX_SELECTION})</span>
          <div className="composer-chips">
            {selected.map((product) => (
              <span key={product.id} className="composer-chip">
                {product.displayTitle ?? product.title}
                <button type="button" aria-label={`Remover ${product.displayTitle ?? product.title}`} onClick={() => remove(product.id)}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="composer-destination" role="radiogroup" aria-label="Destino da mensagem">
        <button
          type="button"
          className={destination === "whatsapp" ? "active" : ""}
          aria-pressed={destination === "whatsapp"}
          onClick={() => { setDestination("whatsapp"); setCopied(false); }}
        >
          WhatsApp
        </button>
        <button
          type="button"
          className={destination === "telegram" ? "active" : ""}
          aria-pressed={destination === "telegram"}
          onClick={() => { setDestination("telegram"); setCopied(false); }}
        >
          Telegram
        </button>
      </div>

      <div className="composer-advice" role="note">
        {lot && destination === "whatsapp" && (
          <p>No WhatsApp só o <b>primeiro link</b> da mensagem gera card — considere uma mensagem por produto.</p>
        )}
        {destination === "telegram" && (
          <p>A publicação automática com foto e botão entra na D-5. Por enquanto, copie o texto e cole no canal.</p>
        )}
      </div>

      <label className="composer-preview-label" htmlFor="composer-preview">mensagem pronta</label>
      <textarea
        id="composer-preview"
        className="composer-preview"
        readOnly
        rows={lot ? 8 : 6}
        value={message}
        placeholder="Selecione um ou mais produtos acima para gerar a mensagem."
      />
      {copyError && <p role="alert">{copyError}</p>}
      <button type="button" className="composer-copy" disabled={!message || copying} onClick={() => void copy()}>
        {copying ? "Conferindo ofertas…" : copied ? "copiado!" : "copiar mensagem"}
      </button>
    </section>
  );
}
