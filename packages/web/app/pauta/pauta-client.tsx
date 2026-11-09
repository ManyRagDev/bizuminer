"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { MARKETPLACES, marketplaceDef } from "../../lib/marketplaces";
import type { PautaQrBundle } from "../../lib/qr-service";
import { copyToClipboard } from "../../lib/clipboard";
import { createPreviewWarmer } from "../../lib/product-preview-warmup";
import { offerPriceLabel } from "../../lib/offer-price";
import type { PautaCapture, PautaCaptureActions } from "../../lib/pauta-db";
import { freshnessLabel, MINIMUM_HISTORY } from "../../lib/deal-signal";
import {
  extractPautaCopyData,
  generateOfferCopy,
  type CopyTone,
} from "../../lib/copy-styles";

interface PautaProduct extends VitrineProduct {
  shareUrl: string;
  detailUrl: string;
  shopUrl: string;
  storyUrl: string | null;
  copyKey: string;
  confirmationId: string;
  previewUrl: string | null;
  editorialRationale: string;
  bioCode?: string;
}

const captureLabels: Record<PautaCapture["status"], string> = {
  ready: "Na pauta",
  pending: "Triagem por iniciar",
  review: "Decisão humana necessária",
  retry: "Reavaliar com IA",
  processing: "Lote em andamento",
  deferred: "Revisão adiada",
  rejected: "Rejeitada",
  held: "Em espera",
  blocked: "Fora da pauta",
  failed: "Triagem interrompida",
};
const emptyCaptureActions: PautaCaptureActions = { review: 0, triage: 0, retry: 0 };
const curationReviewUrl = "/admin/curadoria?aba=excecoes&sub=singulars";
const curationTriageUrl = "/admin/curadoria?aba=selecao";
const captureTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
});
const priceBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toneLabels: Record<CopyTone, string> = { relampago: "Achado", sincero: "Com contexto", direto: "Curto" };

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
  const [exposureMessage,setExposureMessage]=useState("");
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [recent, setRecent] = useState<PautaCapture[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [captureActions, setCaptureActions] = useState(emptyCaptureActions);
  const [marketplace, setMarketplace] = useState("");
  const [captureLimit, setCaptureLimit] = useState(12);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [activeTab, setActiveTab] = useState<"local" | "production">(
    qrBundle?.defaultMode ?? "local"
  );
  const [copiedMobileUrl, setCopiedMobileUrl] = useState(false);
  const [tone, setTone] = useState<CopyTone>("relampago");
  const [openPreviews, setOpenPreviews] = useState<Set<string>>(new Set());

  const togglePreview = (id: string) => {
    setOpenPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
    setProducts([]);
    setRecent([]);
    setRecentTotal(0);
    setCaptureActions(emptyCaptureActions);
    setUpdatedAt(null);
    setLoadError("");
    setLoading(true);
    setDoneIds(readDoneIds(scope));
    const controller = new AbortController();
    const warmer = createPreviewWarmer();
    previewWarmer.current = warmer;
    let checking = 0;
    let loadId = 0;
    const load = async (force = false) => {
      if (document.visibilityState === "hidden" || (checking && !force)) return;
      checking++;
      const id = ++loadId;
      const epoch = mutationEpoch.current;
      setDoneIds(readDoneIds(scope));
      try {
        const query = new URLSearchParams({ canal: channel, loja: marketplace });
        const response = await fetch(`/api/pauta?${query}`, {
          cache: "no-store", signal: controller.signal, headers: { "x-bm-account": accountKey },
        });
        if (!response.ok) throw new Error("pauta_failed");
        const data = await response.json() as {
          products: PautaProduct[]; recent: PautaCapture[]; recentTotal: number;
          captureActions: PautaCaptureActions; active: boolean; updatedAt: string;
        };
        if (controller.signal.aborted || epoch !== mutationEpoch.current || id !== loadId) return;
        setProducts(data.products);
        setRecent(data.recent);
        setRecentTotal(data.recentTotal);
        setCaptureActions(data.captureActions);
        setActive(data.active);
        setUpdatedAt(data.updatedAt);
        setLoadError("");
        for (const product of data.products.slice(0, 10)) {
          if (product.previewUrl) void warmer.warm(product.previewUrl);
        }
      } catch {
        if (!controller.signal.aborted && epoch === mutationEpoch.current && id === loadId) {
          setProducts([]);
          setLoadError("Não foi possível consultar a pauta. Tente atualizar.");
        }
      } finally {
        checking--;
        if (!controller.signal.aborted && id === loadId) setLoading(false);
      }
    };
    reloadPauta.current = () => load(true);
    void load();
    const timer = window.setInterval(() => { void load(); }, 20_000);
    const onVisible = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      controller.abort();
      reloadPauta.current = null;
      window.clearInterval(timer);
      warmer.dispose();
      if (previewWarmer.current === warmer) previewWarmer.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [scope, channel, accountKey, marketplace]);

  useEffect(() => {
    const deadlines = products.map(p => Date.parse(p.offerValidUntil ?? "")).filter(Number.isFinite);
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => {
      setProducts(current => current.filter(p => Date.parse(p.offerValidUntil ?? "") > Date.now()));
      void reloadPauta.current?.();
    }, Math.max(0, Math.min(...deadlines) - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [products]);

  async function confirmExposure(product: PautaProduct) {
    setConfirmingId(product.id);
    try {
      const response = await fetch("/api/pauta", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bm-account": accountKey },
        body: JSON.stringify({ channel, confirmationId: product.confirmationId, productId: product.id }),
      });
      if (response.status === 409) {
        setExposureMessage("Esta oferta mudou de posição ou de condição. A pauta foi atualizada.");
      } else if (response.ok) {
        setExposureMessage("Divulgação registrada neste canal.");
      } else {
        throw new Error("confirmation_failed");
      }
      mutationEpoch.current++;
      await reloadPauta.current?.();
    } catch {
      setExposureMessage("Não foi possível registrar a divulgação. Tente de novo.");
    } finally { setConfirmingId(null); }
  }

  async function copyLink(product: PautaProduct, forceOnlyLink = false) {
    if (!(Date.parse(product.offerValidUntil ?? "") > Date.now())) {
      void reloadPauta.current?.();
      return;
    }
    if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true);
    // When in WhatsApp channel, default action copies the rich copy (relâmpago/sincero/direto).
    // When in Stories channel or explicitly requested, copies the link URL.
    const isCopyingLink = forceOnlyLink || channel === "stories";
    const text = isCopyingLink
      ? product.shareUrl
      : generateOfferCopy(extractPautaCopyData(product), tone);

    const ok = await copyToClipboard(text);
    if (!ok && typeof window !== "undefined") {
      window.prompt("Copie o conteúdo abaixo:", text);
    }
    if (ok) {
      writeDoneId(product.copyKey ?? product.id, scope);
      setDoneIds((prev) => new Set([...prev, product.copyKey ?? product.id]));
      setCopiedId(forceOnlyLink ? `${product.id}:link` : product.id);
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
  const actionCount = captureActions.review + captureActions.triage + captureActions.retry;
  const emptyAction = !active
    ? { href: "/admin/configuracoes", label: "Conferir configuração do canal" }
    : actionCount > 0
      ? { href: "#pendencias-curadoria", label: "Ver pendências" }
      : { href: "#capturas-recentes", label: "Ir ao histórico de capturas" };

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
          Ofertas aprovadas pelo Bizu, em ordem de qualidade e atualidade. Copiar um link não registra a divulgação.
        </p>
        {updatedAt && <p className="pauta-selection-note">Última consulta às {captureTime.format(new Date(updatedAt))}.</p>}
        <div className="pauta-card-actions">
          {actionCount > 0 && !loadError && <a href="#pendencias-curadoria">Pendências de curadoria ({actionCount})</a>}
          <a href="#capturas-recentes">Histórico de capturas</a>
          <button type="button" disabled={loading} onClick={() => void reloadPauta.current?.()}>Atualizar agora</button>
        </div>
        <div className="pauta-progress">
          <div
            className="pauta-progress-bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      <nav className="pauta-card-actions" aria-label="Canal da pauta">
        <button type="button" aria-pressed={channel==='whatsapp'} onClick={()=>setChannel('whatsapp')}>WhatsApp</button>
        <button type="button" aria-pressed={channel==='stories'} onClick={()=>setChannel('stories')}>Stories</button>
      </nav>

      {channel === "whatsapp" && (
        <div className="pauta-tone-bar">
          <span className="pauta-tone-label">Tom do WhatsApp:</span>
          <button
            type="button"
            className={`pauta-tone-pill ${tone === "relampago" ? "active" : ""}`}
            onClick={() => setTone("relampago")}
            title="Preço e o fato que mais destaca a oferta"
          >
            Achado
          </button>
          <button
            type="button"
            className={`pauta-tone-pill ${tone === "sincero" ? "active" : ""}`}
            onClick={() => setTone("sincero")}
            title="Inclui benefício, condições e ressalvas"
          >
            Com contexto
          </button>
          <button
            type="button"
            className={`pauta-tone-pill ${tone === "direto" ? "active" : ""}`}
            onClick={() => setTone("direto")}
            title="Curto e objetivo para grupos rápidos"
          >
            Curto
          </button>
        </div>
      )}
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
        <div style={{ padding: "32px 20px", textAlign: "center", background: "var(--paper-deep, #f4f4f5)", borderRadius: "12px", margin: "24px 0" }}>
          <h3 style={{ fontSize: "16px", marginBottom: "8px", color: "var(--ink-title, #18181b)" }}>Nenhuma oferta pronta na pauta agora</h3>
          <p style={{ color: "var(--ink-muted, #71717a)", fontSize: "14px", lineHeight: 1.5, maxWidth: "420px", margin: "0 auto 16px" }}>
            {active ? "Confira as pendências de curadoria ou consulte o histórico para entender o que ficou fora da pauta." : "Este canal está desativado ou chegou ao fim da validade."}
          </p>
          <a href={emptyAction.href} style={{ display: "inline-block", padding: "10px 18px", background: "var(--brand, #0070f3)", color: "#fff", borderRadius: "8px", fontWeight: 600, textDecoration: "none", fontSize: "14px" }}>
            {emptyAction.label}
          </a>
        </div>
      )}

      {products.length > 0 && <h2>Prontas para divulgar</h2>}
      {done.length > 0 && (
        <section className="pauta-done-section">
          {done.map((product) => (
            <div key={product.id} className="pauta-copied-row">
            <button
              className="pauta-done-item"
              onPointerEnter={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
              onFocus={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
              onClick={() => copyLink(product)}
              title={channel === "whatsapp" ? "Copiar mensagem novamente" : "Copiar link novamente"}
            >
              <span className="pauta-done-check">✓</span>
              <span className="pauta-done-title">{product.displayTitle ?? product.title}</span>
              <span className="pauta-done-code">
                {product.bioCode || marketplaceDef(product.marketplace)?.label}
              </span>
            </button>
            <button type="button" disabled={confirmingId !== null} onClick={() => void confirmExposure(product)}>
              {confirmingId === product.id ? "Registrando…" : "Confirmar divulgação"}
            </button>
            </div>
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
                    {(product.benefit || product.editorialRationale) && <p className="pauta-editorial-rationale">{product.benefit || product.editorialRationale}</p>}
                    {product.purchaseContents && <p className="pauta-editorial-contents"><b>O que vem:</b> {product.purchaseContents}</p>}
                    {product.caveat && <p className="pauta-editorial-context"><b>Ressalva:</b> {product.caveat}</p>}
                    {product.offerOptionLabel && <p><b>Opção:</b> {product.offerOptionLabel}</p>}
                    {product.offerConditions && <p><b>Condições:</b> {product.offerConditions}</p>}
                    <div className="pauta-card-meta" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                      <strong><a href={product.detailUrl ?? `/bizu/${product.slug}`}>{offerPriceLabel(product)}</a></strong>
                      {product.discountPercent != null && product.discountPercent > 0 && product.discountPercent < 99 && (
                        <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                          {product.discountPercent}% no anúncio
                        </span>
                      )}
                      {product.lowestVerified && product.historyDays >= MINIMUM_HISTORY.days && product.observationCount >= MINIMUM_HISTORY.observations && (
                        <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
                          Menor preço no histórico
                        </span>
                      )}
                      {product.ratingStar != null && product.ratingStar > 0 && (
                        <span style={{ fontSize: "12px", color: "var(--ink-muted, #71717a)" }}>
                          ★ {product.ratingStar.toFixed(1)}
                        </span>
                      )}
                      {mp && <span>{mp.stampLabel}</span>}
                      <span>{freshnessLabel(product.evidenceObservedAt)}</span>
                    </div>
                  </div>
                </div>
                <button
                  className="pauta-copy-btn"
                  onPointerEnter={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
                  onFocus={() => { if (product.previewUrl) void previewWarmer.current?.warm(product.previewUrl, true); }}
                  onClick={() => copyLink(product)}
                >
                  {copiedId === product.id
                    ? (channel === "whatsapp" ? "✓ MENSAGEM COPIADA!" : "✓ LINK COPIADO!")
                    : (channel === "whatsapp" ? "📋 COPIAR WHATSAPP" : "COPIAR LINK DO STORY")}
                </button>
                <div className="pauta-card-actions">
                  {channel === "whatsapp" && (
                    <button
                      type="button"
                      onClick={() => copyLink(product, true)}
                      title="Copiar apenas a URL sem o texto da cópia"
                    >
                      {copiedId === `${product.id}:link` ? "✓ Link copiado" : "🔗 Copiar só o link"}
                    </button>
                  )}
                  <a href={product.detailUrl ?? `/bizu/${product.slug}`}>Conferir indicação</a>
                  <a href={product.shopUrl ?? `/go/${product.slug}`} target="_blank" rel="noreferrer sponsored">Conferir na loja ↗</a>
                  {channel === "stories" && product.storyUrl && <a href={product.storyUrl} target="_blank" rel="noreferrer">Abrir arte do Story</a>}
                  <button type="button" disabled={confirmingId !== null} onClick={() => void confirmExposure(product)}>
                    {confirmingId === product.id ? "Registrando…" : "Confirmar divulgação"}
                  </button>
                </div>
                {channel === "whatsapp" ? (
                  <div className="pauta-preview-box">
                    <div className="pauta-preview-header">
                      <span className="pauta-preview-tag">
                        {isNext ? `Prévia da mensagem (${toneLabels[tone]})` : "Prévia da mensagem"}
                      </span>
                      {!isNext && (
                        <button
                          type="button"
                          className="pauta-preview-toggle-btn"
                          onClick={() => togglePreview(product.id)}
                        >
                          {openPreviews.has(product.id) ? "Ocultar prévia ▲" : "Ver prévia ▼"}
                        </button>
                      )}
                    </div>
                    {(isNext || openPreviews.has(product.id)) && (
                      <pre className="pauta-card-message-preview">
                        {generateOfferCopy(extractPautaCopyData(product), tone)}
                      </pre>
                    )}
                  </div>
                ) : (
                  isNext && (
                    <p className="pauta-card-preview">{product.shareUrl}</p>
                  )
                )}
              </article>
            );
          })}
        </section>
      )}
      {actionCount > 0 && !loadError && <section id="pendencias-curadoria" className="pauta-captures pauta-capture-attention" aria-labelledby="pauta-capture-attention-heading">
        <h2 id="pauta-capture-attention-heading">Pendências de curadoria</h2>
        <p className="pauta-selection-note">Capturas das últimas 48 horas{marketplace && ` · ${marketplaceDef(marketplace)?.label ?? marketplace}`}.</p>
        {captureActions.review > 0 && <div className="pauta-card-actions">
          <p><strong>{captureActions.review}</strong> {captureActions.review === 1 ? "oferta precisa" : "ofertas precisam"} de uma decisão humana.</p>
          <a href={curationReviewUrl}>Abrir fila de decisão</a>
        </div>}
        {(captureActions.triage > 0 || captureActions.retry > 0) && <div className="pauta-card-actions">
          <div>
            {captureActions.triage > 0 && <p><strong>{captureActions.triage}</strong> {captureActions.triage === 1 ? "oferta ainda precisa passar" : "ofertas ainda precisam passar"} pela triagem.</p>}
            {captureActions.retry > 0 && <p><strong>{captureActions.retry}</strong> {captureActions.retry === 1 ? "oferta retida" : "ofertas retidas"} pelo antigo piso de R$ 20 podem ser reavaliadas pela IA.</p>}
          </div>
          <a href={curationTriageUrl}>Abrir triagem com IA</a>
        </div>}
      </section>}
      <details id="capturas-recentes" className="pauta-captures">
        <summary>Histórico de capturas{updatedAt ? ` (${recentTotal})` : ""}</summary>
        <div className="pauta-card-actions">
          <label>
            Loja
            <select value={marketplace} onChange={event => { setMarketplace(event.target.value); setCaptureLimit(12); }}>
              <option value="">Todas as lojas</option>
              {MARKETPLACES.map(store => <option key={store.slug} value={store.slug}>{store.label}</option>)}
            </select>
          </label>
        </div>
        <p className="pauta-selection-note">
          {updatedAt ? `${recentTotal} produtos com preço registrado nas últimas 48 horas.` : "Preços registrados nas últimas 48 horas."}
          {recentTotal > recent.length && " Mostrando as 200 mais recentes. Use o filtro por loja para refinar."}
        </p>
        {loading && <p>Buscando capturas…</p>}
        {!loading && !loadError && !recent.length && <p>Nenhuma captura nesta janela.</p>}
        {recent.length > 0 && <ul className="pauta-capture-list">
          {recent.slice(0, captureLimit).map(capture => (
            <li key={capture.id}>
              <div>
                <strong>{capture.title}</strong>
                <p>{marketplaceDef(capture.marketplace)?.label ?? capture.marketplace} · {captureTime.format(new Date(capture.capturedAt))}</p>
                {capture.priceType === "exact" && capture.currency === "BRL" && <p>{priceBRL.format(capture.priceCents / 100)}</p>}
              </div>
              <div>
                <strong className={capture.status === "review" ? "pauta-review-needed" : undefined}>{captureLabels[capture.status]}</strong>
                <p>{capture.reasons.join(" ")}</p>
                {capture.status === "review" && <a href={`/admin/ofertas/${encodeURIComponent(capture.id)}`}>Revisar esta oferta</a>}
                {(capture.status === "pending" || capture.status === "failed" || capture.status === "retry") && <a href={curationTriageUrl}>Abrir triagem com IA</a>}
                {capture.status === "blocked" && <a href={`/admin/ofertas/${encodeURIComponent(capture.id)}`}>Ver detalhes da oferta</a>}
              </div>
            </li>
          ))}
        </ul>}
        {captureLimit < recent.length && <div className="pauta-card-actions">
          <button type="button" onClick={() => setCaptureLimit(limit => limit + 24)}>Ver mais capturas</button>
        </div>}
      </details>
    </div>
  );
}
