"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { marketplaceDef } from "../../lib/marketplaces";

interface PautaProduct extends VitrineProduct {
  shareUrl: string;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const STORAGE_KEY = "bm_pauta_done";

function readDoneIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { date: string; ids: string[] };
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return new Set();
    return new Set(data.ids);
  } catch {
    return new Set();
  }
}

function writeDoneId(id: string) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = readDoneIds();
  existing.add(id);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ date: today, ids: [...existing] }),
  );
}

export default function PautaClient() {
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setDoneIds(readDoneIds());
    void fetch("/api/pauta")
      .then((r) => r.json() as Promise<{ products: PautaProduct[] }>)
      .then((data) => {
        setProducts(data.products);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function copyLink(product: PautaProduct) {
    navigator.clipboard.writeText(product.shareUrl).then(() => {
      writeDoneId(product.id);
      setDoneIds((prev) => new Set([...prev, product.id]));
      setCopiedId(product.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const pending = products.filter((p) => !doneIds.has(p.id));
  const done = products.filter((p) => doneIds.has(p.id));
  const progress = products.length > 0 ? done.length / products.length : 0;

  return (
    <main className="pauta-page">
      <header className="pauta-header">
        <div className="pauta-header-top">
          <h1>PAUTA</h1>
          <span className="pauta-count">
            {done.length}/{products.length}
          </span>
        </div>
        <div className="pauta-progress">
          <div
            className="pauta-progress-bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      {loading && <p className="pauta-loading">Carregando pauta…</p>}

      {!loading && products.length === 0 && (
        <p className="pauta-empty">Nenhum produto na pauta hoje.</p>
      )}

      {done.length > 0 && (
        <section className="pauta-done-section">
          {done.map((product) => (
            <button
              key={product.id}
              className="pauta-done-item"
              onClick={() => copyLink(product)}
              title="Copiar novamente"
            >
              <span className="pauta-done-check">✓</span>
              <span className="pauta-done-title">{product.title}</span>
              <span className="pauta-done-code">
                {product.shareUrl.replace(/^https?:\/\/[^/]+/, "")}
              </span>
            </button>
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="pauta-pending-section">
          {pending.map((product, index) => {
            const mp = marketplaceDef(product.marketplace);
            const isNext = index === 0;
            return (
              <article
                key={product.id}
                className={`pauta-card${isNext ? " pauta-card-next" : ""}`}
              >
                <div className="pauta-card-body">
                  {product.imageUrl && (
                    <div className="pauta-card-image">
                      <Image
                        src={product.imageUrl}
                        alt={product.title}
                        width={80}
                        height={80}
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="pauta-card-info">
                    {isNext && (
                      <span className="pauta-card-signal">PRÓXIMO</span>
                    )}
                    <h3>{product.title}</h3>
                    <div className="pauta-card-meta">
                      <strong>{brl(product.priceCents)}</strong>
                      {mp && <span>{mp.stampLabel}</span>}
                    </div>
                  </div>
                </div>
                <button
                  className="pauta-copy-btn"
                  onClick={() => copyLink(product)}
                >
                  {copiedId === product.id ? "✓ COPIADO" : "COPIAR LINK"}
                </button>
                {isNext && (
                  <p className="pauta-card-preview">{product.shareUrl}</p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
