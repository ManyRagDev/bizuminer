"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { marketplaceDef } from "../../lib/marketplaces";
import type { PautaQrBundle } from "../../lib/qr-service";
import { copyToClipboard } from "../../lib/clipboard";

interface PautaProduct extends VitrineProduct {
  shareUrl: string;
  editorialRationale: string;
  editorialPurchaseContents: string;
  editorialContext?: string | null;
  isHeroHighlight?: boolean;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const STORAGE_KEY = "bm_pauta_copied";
const localDay = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function readDoneIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { date: string; ids: string[] };
    const today = localDay();
    if (data.date !== today) return new Set();
    return new Set(data.ids);
  } catch {
    return new Set();
  }
}

function writeDoneId(id: string) {
  const today = localDay();
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
}: {
  qrBundle?: PautaQrBundle;
  mobileUrl?: string;
  qrDataUrl?: string;
}) {
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectionMode, setSelectionMode] = useState("unavailable");
  const [selectionVersion, setSelectionVersion] = useState<number | null>(null);
  const [selectionValidUntil, setSelectionValidUntil] = useState<string | null>(null);
  const [heroValidUntil, setHeroValidUntil] = useState<string | null>(null);
  const [heroBadgeCurrent, setHeroBadgeCurrent] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [activeTab, setActiveTab] = useState<"local" | "production">(
    qrBundle?.defaultMode ?? "local"
  );
  const [copiedMobileUrl, setCopiedMobileUrl] = useState(false);

  useEffect(() => {
    // No mobile pequeno, inicia colapsado para economizar espaço de tela
    if (typeof window !== "undefined" && window.innerWidth < 600) {
      setShowQr(false);
    }
  }, []);

  useEffect(() => {
    setDoneIds(readDoneIds());
    const controller = new AbortController();
    let checking = false;
    const load = async () => {
      if (document.visibilityState === "hidden" || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/pauta", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("pauta_failed");
        const data = await response.json() as { products: PautaProduct[]; selectionMode: string; selectionVersion: number | null; validUntil: string | null; heroValidUntil: string | null };
        if (controller.signal.aborted) return;
        setProducts(data.products);
        setSelectionMode(data.selectionMode);
        setSelectionVersion(data.selectionVersion);
        setSelectionValidUntil(data.validUntil);
        setHeroValidUntil(data.heroValidUntil);
        setHeroBadgeCurrent(data.heroValidUntil !== null && Date.parse(data.heroValidUntil) > Date.now());
        setLoadError("");
      } catch {
        if (!controller.signal.aborted) setLoadError("Não foi possível carregar a seleção. Atualize a página para tentar novamente.");
      } finally { checking = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    const onVisible = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      controller.abort(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  useEffect(() => {
    const deadline = heroValidUntil ? Date.parse(heroValidUntil) : NaN;
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => setHeroBadgeCurrent(false), Math.max(0, deadline - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [heroValidUntil]);
  useEffect(() => {
    const deadline = selectionValidUntil ? Date.parse(selectionValidUntil) : NaN;
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => { setProducts([]); setHeroBadgeCurrent(false); }, Math.max(0, deadline - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [selectionValidUntil]);

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
        <p className="pauta-selection-note">
          {selectionMode === "catalog" ? "Melhores disponíveis no catálogo aprovado, compartilhados com a página inicial" : "Seleção editorial compartilhada com a página inicial"}{selectionVersion !== null ? ` · versão ${selectionVersion}` : ""}.
          Copiar um link não confirma divulgação.
        </p>
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

      {loadError && <p className="pauta-empty" role="alert">{loadError}</p>}
      {!loading && !loadError && products.length === 0 && (
        <p className="pauta-empty">Nenhum destaque válido para divulgação agora. Confira os produtos e a seleção na curadoria.</p>
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
                    <p className="pauta-editorial-rationale">{product.editorialRationale}</p>
                    {product.isHeroHighlight && heroBadgeCurrent && <span className="pauta-card-signal">DESTAQUE DA HERO</span>}
                    {product.editorialPurchaseContents && <p className="pauta-editorial-contents"><b>O que vem:</b> {product.editorialPurchaseContents}</p>}
                    {product.editorialContext && <p className="pauta-editorial-context">{product.editorialContext}</p>}
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
