"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { marketplaceDef } from "../../lib/marketplaces";
import type { PautaQrBundle } from "../../lib/qr-service";
import { copyToClipboard } from "../../lib/clipboard";
import { createPreviewWarmer } from "../../lib/product-preview-warmup";
import { offerPriceLabel } from "../../lib/offer-price";

interface PautaProduct extends VitrineProduct {
  shareUrl: string;
  detailUrl: string;shopUrl:string;storyUrl:string;copyKey:string;
  previewUrl: string;
  editorialRationale: string;
  editorialPurchaseContents: string;
  editorialContext?: string | null;
  isHeroHighlight?: boolean;
}

const STORAGE_KEY = "bm_pauta_copied";
const localDay = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function readDoneIds(scope: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${scope}`);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { date: string; ids: string[] };
    const today = localDay();
    if (data.date !== today) return new Set();
    return new Set(data.ids);
  } catch {
    return new Set();
  }
}

function writeDoneId(id: string,scope:string) {
  const today = localDay();
  const existing = readDoneIds(scope);
  existing.add(id);
  localStorage.setItem(
    `${STORAGE_KEY}:${scope}`,
    JSON.stringify({ date: today, ids: [...existing] }),
  );
}


export default function PautaClient({
  qrBundle,
  accountKey="",userKey="",
  mobileUrl = "",
  qrDataUrl = "",
}: {
  qrBundle?: PautaQrBundle;
  accountKey?:string;userKey?:string;
  mobileUrl?: string;
  qrDataUrl?: string;
}) {
  const [channel,setChannel]=useState<"whatsapp"|"stories">("whatsapp");
  const scope=`${userKey}:${accountKey}:${channel}`;
  const [editionId,setEditionId]=useState<string|null>(null);
  const [exposureMessage,setExposureMessage]=useState("");
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectionMode, setSelectionMode] = useState("unavailable");
  const [renewal, setRenewal] = useState<{ active: boolean; renewedAt: string | null }>({ active: false, renewedAt: null });
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
  const reloadPauta=useRef<(()=>Promise<void>)|null>(null);
  const mutationEpoch=useRef(0);
  const [confirmingId,setConfirmingId]=useState<string|null>(null);
  const previewWarmer = useRef<ReturnType<typeof createPreviewWarmer> | null>(null);

  useEffect(() => {
    // No mobile pequeno, inicia colapsado para economizar espaço de tela
    if (typeof window !== "undefined" && window.innerWidth < 600) {
      setShowQr(false);
    }
  }, []);

  useEffect(() => {
    setProducts([]);setLoading(true);setDoneIds(readDoneIds(scope));
    const controller = new AbortController();
    const warmer = createPreviewWarmer();
    previewWarmer.current = warmer;
    let checking = 0;
    const load = async (force=false) => {
      if (document.visibilityState === "hidden" || checking && !force) return;
      checking++;
      const epoch=mutationEpoch.current;
      // A pauta can stay open across the daily renewal. Re-read the local day
      // instead of carrying yesterday's copied markers until a full reload.
      setDoneIds(readDoneIds(scope));
      try {
        const response = await fetch(`/api/pauta?canal=${channel}`, { cache: "no-store", signal: controller.signal,headers:{"x-bm-account":accountKey} });
        if (!response.ok) throw new Error("pauta_failed");
        const data = await response.json() as { products: PautaProduct[]; selectionMode: string; selectionVersion: number | null; validUntil: string | null; heroValidUntil: string | null; homepageReady?: boolean; renewedAt?: string | null;editionId?:string|null };
        if (controller.signal.aborted || epoch!==mutationEpoch.current) return;
        setProducts(data.products);setEditionId(data.editionId ?? null);
        setSelectionMode(data.selectionMode);
        setRenewal({ active: data.homepageReady === true, renewedAt: data.renewedAt ?? null });
        setSelectionVersion(data.selectionVersion);
        setSelectionValidUntil(data.validUntil);
        setHeroValidUntil(data.heroValidUntil);
        setHeroBadgeCurrent(data.heroValidUntil !== null && Date.parse(data.heroValidUntil) > Date.now());
        setLoadError("");
        // The URL contains the offer revision. The warmer skips unchanged,
        // still-cached images and downloads at most two final previews at once.
        for (const product of data.products.slice(0, 10)) {
          if (product.previewUrl) void warmer.warm(product.previewUrl);
        }
      } catch {
        if (!controller.signal.aborted && epoch===mutationEpoch.current) setLoadError("Não foi possível carregar a seleção. Atualize a página para tentar novamente.");
      } finally { checking--; if (!controller.signal.aborted) setLoading(false); }
    };
    reloadPauta.current=()=>load(true);
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    const onVisible = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      controller.abort();reloadPauta.current=null;window.clearInterval(timer);
      warmer.dispose();
      if (previewWarmer.current === warmer) previewWarmer.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [scope,channel,accountKey]);

  useEffect(() => {
    const deadline = heroValidUntil ? Date.parse(heroValidUntil) : NaN;
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => setHeroBadgeCurrent(false), Math.max(0, deadline - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [heroValidUntil]);
  useEffect(() => {
    const deadlines=products.map(p=>Date.parse(p.offerValidUntil ?? selectionValidUntil ?? "")).filter(Number.isFinite);
    const deadline=deadlines.length ? Math.min(...deadlines):NaN;
    if (!Number.isFinite(deadline)) return;
    const timer=window.setTimeout(()=>{setProducts(current=>current.filter(p=>Date.parse(p.offerValidUntil ?? selectionValidUntil ?? "")>Date.now()));setHeroBadgeCurrent(false);},Math.max(0,deadline-Date.now()+50));
    return ()=>window.clearTimeout(timer);
  },[selectionValidUntil,products]);

  async function copyLink(product: PautaProduct) {
    if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true);
    // Keep clipboard access in the user gesture, including on iOS. Preview
    // preparation runs ahead of the click instead of delaying the copy.
    const ok = await copyToClipboard(product.shareUrl);
    if (!ok && typeof window !== "undefined") {
      window.prompt("Copie o link abaixo:", product.shareUrl);
    }
    if (ok) {
      writeDoneId(product.copyKey ?? product.id,scope);
      setDoneIds((prev) => new Set([...prev, product.copyKey ?? product.id]));
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

  const pending = products.filter((p) => !doneIds.has(p.copyKey ?? p.id));
  const done = products.filter((p) => doneIds.has(p.copyKey ?? p.id));
  const progress = products.length > 0 ? done.length / products.length : 0;

  return (
    <div className="pauta-page">
      <nav className="section-local-nav" aria-label="Publicação">
        <a className="active" href="/pauta">Pauta de links</a>
        <a href="/admin?aba=publicacao">Criador de posts</a>
      </nav>
      <header className="pauta-header">
        <div className="pauta-header-top">
          <h1>PAUTA · {channel==="stories" ? "STORIES":"WHATSAPP"}</h1>
          <span className="pauta-count">
            {done.length}/{products.length} links copiados neste aparelho
          </span>
        </div>
        <p className="pauta-selection-note">
          {selectionMode === "catalog" ? "Catálogo de transição · confira a oferta antes de divulgar" : `Indicações preparadas para ${channel==="stories" ? "Stories":"WhatsApp"}`}{selectionVersion !== null ? ` · versão ${selectionVersion}` : ""}.
          Copiar um link não confirma divulgação.
        </p>
        {renewal.renewedAt && <p className="pauta-selection-note">Última renovação: {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(renewal.renewedAt))} (São Paulo).</p>}
        {!loading && !renewal.active && <p className="pauta-selection-note"><a href="/admin/curadoria?aba=selecao">Conferir renovação e produtos aptos na curadoria →</a></p>}
        <div className="pauta-progress">
          <div
            className="pauta-progress-bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      <nav className="pauta-card-actions" aria-label="Canal da pauta"><button type="button" aria-pressed={channel==='whatsapp'} onClick={()=>setChannel('whatsapp')}>WhatsApp</button><button type="button" aria-pressed={channel==='stories'} onClick={()=>setChannel('stories')}>Stories</button></nav>
      {exposureMessage && <p role="status">{exposureMessage}</p>}
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
              onPointerEnter={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
              onFocus={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
              onClick={() => copyLink(product)}
              title="Copiar novamente"
            >
              <span className="pauta-done-check">✓</span>
              <span className="pauta-done-title">{product.displayTitle ?? product.title}</span>
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
                    <a className="pauta-card-image" href={product.detailUrl ?? `/bizu/${product.slug}`}>
                      <Image
                        src={product.imageUrl}
                        alt={product.displayTitle ?? product.title}
                        width={80}
                        height={80}
                        unoptimized
                      />
                    </a>
                  )}
                  <div className="pauta-card-info">
                {isNext && (
                      <span className="pauta-card-signal">PRÓXIMO</span>
                    )}
                    <h3><a href={product.detailUrl ?? `/bizu/${product.slug}`}>{product.displayTitle ?? product.title}</a></h3>
                    <p className="pauta-editorial-rationale">{product.benefit ?? product.editorialRationale}</p>
                    {product.isHeroHighlight && heroBadgeCurrent && <span className="pauta-card-signal">DESTAQUE DA HERO</span>}
                    {(product.purchaseContents ?? product.editorialPurchaseContents) && <p className="pauta-editorial-contents"><b>O que vem:</b> {product.purchaseContents ?? product.editorialPurchaseContents}</p>}
                    {product.caveat && <p className="pauta-editorial-context"><b>Ressalva:</b> {product.caveat}</p>}
                    {product.editorialContext && <p className="pauta-editorial-context">{product.editorialContext}</p>}
                    {product.offerOptionLabel && <p><b>Opção:</b> {product.offerOptionLabel}</p>}
                    {product.offerConditions && <p><b>Condições:</b> {product.offerConditions}</p>}
                    <div className="pauta-card-meta">
                      <strong><a href={product.detailUrl ?? `/bizu/${product.slug}`}>{offerPriceLabel(product)}</a></strong>
                      {mp && <span>{mp.stampLabel}</span>}
                    </div>
                  </div>
                </div>
                <button
                  className="pauta-copy-btn"
                  onPointerEnter={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
                  onFocus={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
                  onClick={() => copyLink(product)}
                >
                  {copiedId === product.id ? "✓ COPIADO" : "COPIAR LINK"}
                </button>
                <div className="pauta-card-actions">
                  <a href={product.detailUrl ?? `/bizu/${product.slug}`}>Conferir indicação</a>
                  <a href={product.shopUrl ?? `/go/${product.slug}`} target="_blank" rel="noreferrer sponsored">Conferir na loja ↗</a>
                  {channel==='stories' && <a href={product.storyUrl} target="_blank" rel="noreferrer">Abrir arte do Story</a>}
                  {editionId && <button type="button" disabled={confirmingId!==null} onClick={async()=>{
                    setConfirmingId(product.id);
                    try{
                      const response=await fetch('/api/pauta',{method:'POST',headers:{'Content-Type':'application/json','x-bm-account':accountKey},body:JSON.stringify({channel,editionId,productId:product.id})});
                      if(!response.ok)throw new Error();
                      const result=await response.json() as {preparationFailed?:boolean};
                      mutationEpoch.current++;
                      setExposureMessage(result.preparationFailed ? 'Divulgação registrada. Não foi possível completar a atualização da pauta agora.':'Divulgação confirmada. A pauta foi reavaliada para respeitar o intervalo deste canal.');
                      await reloadPauta.current?.();
                    }catch{setExposureMessage('Não foi possível confirmar a divulgação. Atualize a pauta e tente novamente.');}
                    finally{setConfirmingId(null);}
                  }}>{confirmingId===product.id ? 'Confirmando…':'Confirmar que divulguei'}</button>}
                </div>
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
