"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { marketplaceDef } from "../../lib/marketplaces";
import type { PautaQrBundle } from "../../lib/qr-service";
import { copyToClipboard } from "../../lib/clipboard";

interface PautaProduct extends VitrineProduct {
  shareUrl: string;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const STORAGE_KEY = "bm_pauta_copied";

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


export default function PautaClient({
  qrBundle,
  mobileUrl = "",
  qrDataUrl = "",
  authTokenToPersist,
}: {
  qrBundle?: PautaQrBundle;
  mobileUrl?: string;
  qrDataUrl?: string;
  authTokenToPersist?: string;
}) {
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [activeTab, setActiveTab] = useState<"local" | "production">(
    qrBundle?.defaultMode ?? "local"
  );
  const [copiedMobileUrl, setCopiedMobileUrl] = useState(false);

  useEffect(() => {
    // Se veio autenticado via QR Code (?auth=...), grava o cookie no celular por 30 dias
    if (authTokenToPersist) {
      document.cookie = `bm_pauta_auth=${encodeURIComponent(authTokenToPersist)}; path=/; max-age=2592000; SameSite=Lax`;
      if (typeof window !== "undefined" && window.history.replaceState) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("auth");
        window.history.replaceState({}, "", currentUrl.pathname + (currentUrl.search ? currentUrl.search : ""));
      }
    }
  }, [authTokenToPersist]);

  useEffect(() => {
    // No mobile pequeno, inicia colapsado para economizar espaço de tela
    if (typeof window !== "undefined" && window.innerWidth < 600) {
      setShowQr(false);
    }
  }, []);

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

  async function copyLink(product: PautaProduct) {
    const ok = await copyToClipboard(product.shareUrl);
    if (!ok && typeof window !== "undefined") {
      window.prompt("Copie o link abaixo:", product.shareUrl);
    }
    if (ok) {
      writeDoneId(product.id);
      setDoneIds((prev) => new Set([...prev, product.id]));
      setCopiedId(product.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  const bundle = qrBundle ?? (qrDataUrl ? {
    local: {
      url: mobileUrl,
      qrDataUrl: qrDataUrl,
      label: "Rede Local (Wi-Fi)",
      badge: "Localhost / LAN",
      description: "Escaneie este código para abrir a pauta direto no smartphone via rede local.",
    },
    production: {
      url: "https://www.bizuminer.com.br/pauta",
      qrDataUrl: qrDataUrl,
      label: "Produção (Online)",
      badge: "Site Oficial",
      description: "Escaneie para abrir a pauta no site de produção.",
    },
    defaultMode: "local" as const,
  } : null);

  const activeItem = bundle ? (activeTab === "local" ? bundle.local : bundle.production) : null;

  const pending = products.filter((p) => !doneIds.has(p.id));
  const done = products.filter((p) => doneIds.has(p.id));
  const progress = products.length > 0 ? done.length / products.length : 0;

  return (
    <div className="pauta-page">
      <nav className="section-local-nav" aria-label="Publicação">
        <a className="active" href="/pauta">Pauta de links</a>
        <a href="/admin?aba=publicacao">Criador de posts</a>
      </nav>
      <header className="pauta-header">
        <div className="pauta-header-top">
          <h1>PAUTA · LINKS REDUZIDOS</h1>
          <span className="pauta-count">
            {done.length}/{products.length} links copiados neste aparelho
          </span>
        </div>
        <div className="pauta-progress">
          <div
            className="pauta-progress-bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      {bundle && (
        <section className="pauta-qr-banner" aria-label="Acesso no celular">
          <div className="pauta-qr-toggle-bar">
            <button
              type="button"
              onClick={() => setShowQr((prev) => !prev)}
              className="pauta-qr-toggle-btn"
            >
              <span>📱 <b>Abrir no celular via QR Code</b></span>
              <span>{showQr ? "▲ recolher" : "▼ escanear"}</span>
            </button>
          </div>

          {showQr && (
            <div className="pauta-qr-content-wrapper">
              <div className="pauta-qr-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "local"}
                  className={`pauta-qr-tab ${activeTab === "local" ? "active" : ""}`}
                  onClick={() => setActiveTab("local")}
                >
                  💻 <b>Rede Local (Wi-Fi)</b>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "production"}
                  className={`pauta-qr-tab ${activeTab === "production" ? "active" : ""}`}
                  onClick={() => setActiveTab("production")}
                >
                  🌐 <b>Produção (Online)</b>
                </button>
              </div>

              {activeItem && (
                <div className="pauta-qr-content">
                  <div className="pauta-qr-img-box">
                    <img
                      src={activeItem.qrDataUrl}
                      alt={`QR Code para ${activeItem.label}`}
                      width={140}
                      height={140}
                      className="pauta-qr-img"
                    />
                  </div>
                  <div className="pauta-qr-details">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="pauta-qr-badge">{activeItem.badge}</span>
                      <strong style={{ fontSize: "12px" }}>{activeItem.label}</strong>
                    </div>
                    <p>
                      {activeItem.description}
                    </p>
                    <div className="pauta-qr-url-row">
                      <span className="pauta-qr-url" title={activeItem.url}>{activeItem.url}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyToClipboard(activeItem.url);
                          setCopiedMobileUrl(true);
                          setTimeout(() => setCopiedMobileUrl(false), 2000);
                        }}
                        className="pauta-qr-copy-url-btn"
                      >
                        {copiedMobileUrl ? "✓ Copiado" : "Copiar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

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
    </div>
  );
}
