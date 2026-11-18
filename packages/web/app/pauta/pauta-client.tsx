"use client";

import Image from "next/image";
import AdminLink from "../_components/admin-link.tsx";
import { useEffect, useRef, useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";
import { MARKETPLACES, marketplaceDef } from "../../lib/marketplaces";
import type { PautaQrBundle } from "../../lib/qr-service";
import { copyToClipboard } from "../../lib/clipboard";
import { createPreviewWarmer } from "../../lib/product-preview-warmup";
import { offerPriceLabel, offerPriceNote } from "../../lib/offer-price";
import { curationOfferHref } from "../../lib/curation-navigation.ts";
import type { PautaCapture, PautaCaptureActions } from "../../lib/pauta-db";
import { evaluateFreshnessStatus, freshnessLabel, MINIMUM_HISTORY } from "../../lib/deal-signal";
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
  watchersCount?: number;
  needsPriceRefresh?: boolean;
  shelf?: "impact" | "daily" | "demand";
  nominalSavingsCents?: number;
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
const captureTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
});
const priceBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toneLabels: Record<CopyTone, string> = { relampago: "Achado", sincero: "Com contexto", direto: "Curto" };

const STORAGE_KEY = "bm_pauta_copied";
const PREPARATIONS_KEY = "bm_pauta_preparations_v1";
type CopiedPreparation = { product: PautaProduct; text: string; sourceConfirmationId?: string };
type SlotState = { config:{version:number|null;enabled:boolean;timezone:string;hours:string[];items_per_slot:number;
  repeat_hours:number;impulse_limit_cents:number|null;allow_price_improvement:boolean;improvement_percent:number;dom_window_hours:number};
  slots:Array<{id:string;scheduledAt:string;status:string;predicted?:Array<unknown>}>;canConfigure:boolean;channelActive:boolean };

function readPreparations(scope: string): CopiedPreparation[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`${PREPARATIONS_KEY}:${scope}`) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CopiedPreparation => !!item && typeof item === "object"
      && typeof item.text === "string" && typeof item.product?.id === "string"
      && typeof item.product?.confirmationId === "string");
  } catch { return []; }
}

function savePreparations(scope: string, items: CopiedPreparation[]) {
  try { localStorage.setItem(`${PREPARATIONS_KEY}:${scope}`, JSON.stringify(items)); } catch { /* Still retain the draft in this tab. */ }
}
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
  initialChannel = "whatsapp",
  automaticCuration = false,
  mobileUrl = "",
  qrDataUrl = "",
}: {
  qrBundle?: PautaQrBundle;
  accountKey?:string;userKey?:string;
  initialChannel?: "whatsapp" | "stories";
  automaticCuration?: boolean;
  mobileUrl?: string;
  qrDataUrl?: string;
}) {
  const [channel,setChannel]=useState(initialChannel);
  const curationReviewUrl = `/admin/curadoria?${new URLSearchParams({aba:"excecoes",sub:"singulars",conta:accountKey})}`;
  const curationTriageUrl = `/admin/curadoria?${new URLSearchParams({aba:automaticCuration?"andamento":"selecao",conta:accountKey})}`;
  const scope=`${userKey}:${accountKey}:${channel}`;
  const [exposureMessage,setExposureMessage]=useState("");
  const [products, setProducts] = useState<PautaProduct[]>([]);
  const [recent, setRecent] = useState<PautaCapture[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [captureActions, setCaptureActions] = useState(emptyCaptureActions);
  const [marketplace, setMarketplace] = useState("");
  const [captureLimit, setCaptureLimit] = useState(12);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [preparations, setPreparations] = useState<CopiedPreparation[]>([]);
  const [slotState,setSlotState]=useState<SlotState|null>(null);
  const [slotError,setSlotError]=useState("");
  const [slotSaving,setSlotSaving]=useState(false);
  const [selectedSlot,setSelectedSlot]=useState("");
  const [slotHours,setSlotHours]=useState("");
  const [slotZone,setSlotZone]=useState("America/Sao_Paulo");
  const [slotEnabled,setSlotEnabled]=useState(false);
  const [slotItems,setSlotItems]=useState(3);
  const [slotRepeat,setSlotRepeat]=useState(240);
  const [slotImpulse,setSlotImpulse]=useState("200.00");
  const [slotImprove,setSlotImprove]=useState(false);
  const [slotImprovePercent,setSlotImprovePercent]=useState(5);
  const [slotDomHours,setSlotDomHours]=useState(12);
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
  const [shelfFilter, setShelfFilter] = useState<"all" | "impact" | "daily" | "demand" | "fresh">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [unlockedRefreshIds, setUnlockedRefreshIds] = useState<Set<string>>(() => new Set());

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

  useEffect(()=>{
    const controller=new AbortController();
    setSlotState(null);setSelectedSlot("");setSlotError("");
    void (async()=>{
      try {
        const response=await fetch(`/api/pauta/slots?channel=${channel}`,{cache:"no-store",signal:controller.signal,
          headers:{"x-bm-account":accountKey}});
        if(!response.ok) throw new Error();
        const data=await response.json() as SlotState;
        if(controller.signal.aborted) return;
        setSlotState(data);setSlotHours(data.config.hours.join(", "));setSlotZone(data.config.timezone);
        setSlotEnabled(data.config.enabled);setSlotItems(data.config.items_per_slot);setSlotRepeat(data.config.repeat_hours);
        setSlotImpulse(data.config.impulse_limit_cents===null ? "" : (data.config.impulse_limit_cents/100).toFixed(2));
        setSlotImprove(data.config.allow_price_improvement);setSlotImprovePercent(data.config.improvement_percent);setSlotDomHours(data.config.dom_window_hours);
      } catch {if(!controller.signal.aborted)setSlotError("Não foi possível consultar a agenda.");}
    })();
    return ()=>controller.abort();
  },[accountKey,channel]);

  async function saveSlotSettings() {
    setSlotSaving(true);setSlotError("");
    try {
      const hours=slotHours.split(",").map(value=>value.trim()).filter(Boolean);
      const impulse=slotImpulse.trim()==="" ? null : Math.round(Number(slotImpulse.replace(",","."))*100);
      if(impulse!==null && (!Number.isSafeInteger(impulse) || impulse<=0)) {
        setSlotError("Informe um teto válido ou deixe o campo vazio para desativá-lo.");return;
      }
      const response=await fetch("/api/pauta/slots",{method:"PUT",headers:{"Content-Type":"application/json","x-bm-account":accountKey},
        body:JSON.stringify({channel,version:slotState?.config.version ?? null,enabled:slotEnabled,timezone:slotZone,hours,itemsPerSlot:slotItems,
          repeatHours:slotRepeat,impulseLimitCents:impulse,allowPriceImprovement:slotImprove,improvementPercent:slotImprovePercent,domWindowHours:slotDomHours})});
      if(response.status===409) {setSlotError("A agenda mudou em outra sessão. Recarregue a página antes de salvar.");return;}
      if(!response.ok) {setSlotError("Confira os horários, o fuso e a quantidade de produtos.");return;}
      const updated=await fetch(`/api/pauta/slots?channel=${channel}`,{cache:"no-store",headers:{"x-bm-account":accountKey}});
      if(!updated.ok) throw new Error();
      const data=await updated.json() as SlotState;
      setSlotState(data);setSelectedSlot("");setSlotHours(data.config.hours.join(", "));
      setExposureMessage("Agenda salva. Os próximos horários dependem do processamento da conta.");
    } catch {setSlotError("Não foi possível salvar a agenda.");}
    finally {setSlotSaving(false);}
  }

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
    setPreparations(readPreparations(scope));
    const controller = new AbortController();
    const warmer = createPreviewWarmer();
    previewWarmer.current = warmer;
    let checking = 0;
    let loadId = 0;
    let revision: string | null = null;
    const load = async (force = false) => {
      if (document.visibilityState === "hidden" || (checking && !force)) return;
      checking++;
      const id = ++loadId;
      const epoch = mutationEpoch.current;
      setDoneIds(readDoneIds(scope));
      try {
        const query = new URLSearchParams({ canal: channel, loja: marketplace });
        if (revision && !force) query.set("revision", revision);
        const response = await fetch(`/api/pauta?${query}`, {
          cache: "no-store", signal: controller.signal, headers: { "x-bm-account": accountKey },
        });
        if (!response.ok) throw new Error("pauta_failed");
        const data = await response.json() as {
          products: PautaProduct[]; recent: PautaCapture[]; recentTotal: number;
          captureActions: PautaCaptureActions; active: boolean; updatedAt: string;
          revision: string; unchanged?: boolean; preparations?: CopiedPreparation[];
        };
        if (controller.signal.aborted || epoch !== mutationEpoch.current || id !== loadId) return;
        const serverPreparations = data.preparations ?? [];
        // Keep older local drafts created before server-side preparations were
        // introduced; current preparations are recovered from the account.
        const legacy = readPreparations(scope).filter(item => !item.sourceConfirmationId);
        const combined = [...serverPreparations, ...legacy];
        setPreparations(combined);
        savePreparations(scope, combined);
        if (data.unchanged) { setLoadError(""); return; }
        revision = data.revision;
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
          revision = null;
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
    // Navigation and explicit operations refresh the edition. An idle screen
    // must not repeatedly ask the database whether anything changed.
    let refreshTimer: number | undefined;
    let operationPending = false;
    const onVisible = () => {
      window.clearTimeout(refreshTimer);
      if (document.visibilityState === "hidden") return;
      refreshTimer = window.setTimeout(() => {
        const force = operationPending;
        operationPending = false;
        void load(force);
      }, 100);
    };
    const onOperation = (event: Event) => {
      if ((event as CustomEvent<{ tenantId?: string }>).detail?.tenantId !== accountKey) return;
      operationPending = true;
      mutationEpoch.current++;
      onVisible();
    };
    window.addEventListener("bm:operation-changed", onOperation);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      controller.abort();
      reloadPauta.current = null;
      window.clearTimeout(refreshTimer);
      window.removeEventListener("bm:operation-changed", onOperation);
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
        const expired = !(Date.parse(product.offerValidUntil ?? "") > Date.now());
        setExposureMessage(expired
          ? "Divulgação registrada com as condições da preparação; o prazo dela já venceu."
          : "Divulgação registrada com as condições da preparação.");
        setPreparations(current => {
          const remaining = current.filter(item => item.product.confirmationId !== product.confirmationId);
          savePreparations(scope, remaining);
          return remaining;
        });
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

    let preparedId: string;
    try {
      const requestId=crypto.randomUUID();
      const options:RequestInit={method:"POST",headers:{"Content-Type":"application/json","x-bm-account":accountKey},
        body:JSON.stringify({action:"prepare",channel,confirmationId:product.confirmationId,productId:product.id,text,requestId,
          ...(selectedSlot ? {slotId:selectedSlot} : {})})};
      const response=await fetch("/api/pauta",options).catch(()=>fetch("/api/pauta",options));
      if (response.status === 409) {
        setExposureMessage("A oferta ou o horário mudou, venceu ou atingiu o limite de produtos. Atualize antes de preparar outra mensagem.");
        void reloadPauta.current?.();
        return;
      }
      const result = await response.json() as { confirmationId?: string };
      if (!response.ok || !result.confirmationId) throw new Error("preparation_failed");
      preparedId = result.confirmationId;
    } catch {
      setExposureMessage("Não foi possível guardar a preparação. Tente novamente.");
      return;
    }
    const preparedProduct = { ...product, confirmationId: preparedId };
    mutationEpoch.current++;
    setPreparations(current => {
      const next = [...current, { product: preparedProduct, text, sourceConfirmationId: product.confirmationId }];
      savePreparations(scope, next);
      return next;
    });
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

  const rawPending = products.filter((p) => !doneIds.has(p.copyKey ?? p.id));
  const pending = rawPending.filter((p) => {
    if (shelfFilter === "impact" && p.shelf !== "impact") return false;
    if (shelfFilter === "daily" && p.shelf !== "daily") return false;
    if (shelfFilter === "demand" && !(p.watchersCount && p.watchersCount > 0)) return false;
    if (shelfFilter === "fresh" && p.needsPriceRefresh) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match = (p.title || "").toLowerCase().includes(q)
        || (p.displayTitle || "").toLowerCase().includes(q)
        || (p.benefit || "").toLowerCase().includes(q)
        || (p.editorialRationale || "").toLowerCase().includes(q)
        || (p.category || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });
  const done = products.filter((p) => doneIds.has(p.copyKey ?? p.id));
  const progress = products.length > 0 ? done.length / products.length : 0;
  const actionCount = captureActions.review + captureActions.triage + captureActions.retry;
  const emptyAction = !active
    ? { href: `/admin/configuracoes?${new URLSearchParams({conta:accountKey})}`, label: "Conferir configuração do canal" }
    : actionCount > 0
      ? { href: "#pendencias-curadoria", label: "Ver pendências" }
      : { href: "#capturas-recentes", label: "Ver produtos com preço recente" };

  return (
    <div className="pauta-page">
      <nav className="section-local-nav" aria-label="Publicação">
        <a className="active" href={`/pauta?${new URLSearchParams({conta:accountKey,canal:channel})}`}>Pauta de links</a>
        <a href={`/admin?${new URLSearchParams({aba:"publicacao",conta:accountKey})}`}>Criador de posts</a>
      </nav>
      <header className="pauta-header">
        <div className="pauta-header-top">
          <h1>PAUTA · {channel==="stories" ? "STORIES":"WHATSAPP"}</h1>
          <span className="pauta-count">
            {done.length}/{products.length} links copiados neste aparelho
          </span>
        </div>
        <p className="pauta-selection-note">
          Capturas e decisões de curadoria renovam a pauta. Ao voltar à tela ou atualizar, você consulta a edição disponível. Copiar um link não registra a divulgação.
        </p>
        {updatedAt && <p className="pauta-selection-note">Edição preparada em {captureTime.format(new Date(updatedAt))}.</p>}
        <div className="pauta-card-actions">
          {actionCount > 0 && !loadError && <a href="#pendencias-curadoria">Pendências de curadoria ({actionCount})</a>}
          <AdminLink href={`/admin/capturas?conta=${encodeURIComponent(accountKey)}`}>Capturas recebidas</AdminLink>
          <a href="#capturas-recentes">Produtos com preço recente</a>
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

      <section aria-label="Agenda da pauta">
        <h2>Agenda de {channel === "whatsapp" ? "WhatsApp" : "Stories"}</h2>
        {slotError && <p role="alert">{slotError}</p>}
        {slotState && <>
          <p>{!slotState.config.enabled ? "Agenda desativada até configurar os horários."
            : slotState.channelActive ? `Agenda ativa · ${slotState.config.timezone}`
            : "Agenda configurada, mas o canal está pausado ou sua validade terminou."}</p>
          {slotState.slots.length ? <label>Vincular preparação a um horário
            <select value={selectedSlot} onChange={event=>setSelectedSlot(event.target.value)}>
              <option value="">Sem horário específico</option>
              {slotState.slots.map(slot=><option value={slot.id} key={slot.id}>{new Intl.DateTimeFormat("pt-BR",{
                timeZone:slotState.config.timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(slot.scheduledAt))}</option>)}
            </select>
          </label> : slotState.config.enabled && slotState.channelActive && <p>O próximo horário será disponibilizado quando o executor processar a agenda.</p>}
          {selectedSlot && <p>Previsão de conferência: {slotState.slots.find(slot=>slot.id===selectedSlot)?.predicted?.length ?? 0} candidatos.
            A seleção e as condições são conferidas ao preparar.</p>}
          <button type="button" onClick={()=>void (async()=>{
            try {
              const response=await fetch(`/api/pauta/slots?channel=${channel}`,{cache:"no-store",headers:{"x-bm-account":accountKey}});
              if(!response.ok) throw new Error();
              const data=await response.json() as SlotState;
              setSlotState(data);setSelectedSlot(current=>data.slots.some(slot=>slot.id===current) ? current : "");setSlotError("");
            } catch {setSlotError("Não foi possível atualizar os horários.");}
          })()}>Atualizar horários</button>
          {slotState.canConfigure && <details><summary>Configurar horários</summary>
            <label>Horários separados por vírgula <input value={slotHours} placeholder="08:00, 11:00, 15:00, 19:00"
              onChange={event=>setSlotHours(event.target.value)} /></label>
            <label>Fuso horário <input value={slotZone} onChange={event=>setSlotZone(event.target.value)} /></label>
            <label>Produtos por horário <input type="number" min="1" max="4" value={slotItems}
              onChange={event=>setSlotItems(Number(event.target.value))} /></label>
            <p>Regras usadas quando a curadoria v2 estiver ativa neste canal:</p>
            <label>Intervalo após divulgação confirmada (horas) <input type="number" min="0" max="720" value={slotRepeat}
              onChange={event=>setSlotRepeat(Number(event.target.value))} /></label>
            <label>Teto de impulso em reais (vazio desativa) <input type="number" min="0.01" step="0.01" value={slotImpulse}
              onChange={event=>setSlotImpulse(event.target.value)} /></label>
            <label><input type="checkbox" checked={slotImprove} onChange={event=>setSlotImprove(event.target.checked)} />
              Permitir retorno antecipado por melhora de preço comparável</label>
            {slotImprove && <label>Melhora mínima (%) <input type="number" min="1" max="50" value={slotImprovePercent}
              onChange={event=>setSlotImprovePercent(Number(event.target.value))} /></label>}
            <label>Validade de conferência no navegador <select value={slotDomHours} onChange={event=>setSlotDomHours(Number(event.target.value))}>
              <option value={12}>12 horas</option><option value={24}>24 horas</option>
            </select></label>
            <label><input type="checkbox" checked={slotEnabled} onChange={event=>setSlotEnabled(event.target.checked)} /> Ativar agenda</label>
            <button type="button" disabled={slotSaving} onClick={()=>void saveSlotSettings()}>{slotSaving ? "Salvando…" : "Salvar agenda"}</button>
          </details>}
        </>}
      </section>

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
      {preparations.length > 0 && <section aria-label="Preparações salvas">
        <h2>Preparações salvas</h2>
        <p>O texto fica salvo na conta. Confirme somente o que você enviou; preparar ou copiar não registra divulgação.</p>
        {preparations.map(({ product, text, sourceConfirmationId }) => {
          const current = products.find(item => item.confirmationId === (sourceConfirmationId ?? product.confirmationId));
          const expired = !(Date.parse(product.offerValidUntil ?? "") > Date.now());
          return <article key={product.confirmationId}>
            <h3>{product.title}</h3>
            {(expired || !current) && <p>Esta preparação venceu ou suas condições mudaram. O texto salvo continua disponível para registrar um envio já realizado.</p>}
            <details><summary>Ver texto salvo</summary><pre style={{ whiteSpace: "pre-wrap" }}>{text}</pre></details>
            <button type="button" disabled={confirmingId !== null} onClick={() => void confirmExposure(product)}>
              {confirmingId === product.id ? "Registrando…" : "Confirmar que enviei"}
            </button>
          </article>;
        })}
      </section>}
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

      {rawPending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0 20px" }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar na pauta por produto, marca ou categoria (ex: fone, tv, airfryer)…"
            style={{ width: "100%", padding: "10px 14px", fontSize: "14px", borderRadius: "8px", border: "1px solid var(--line, #e4e4e7)", background: "var(--paper, #fff)" }}
          />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted, #71717a)" }}>Prateleiras:</span>
            <button
              type="button"
              className={`pauta-tone-pill ${shelfFilter === "all" ? "active" : ""}`}
              onClick={() => setShelfFilter("all")}
            >
              Todas ({rawPending.length})
            </button>
            <button
              type="button"
              className={`pauta-tone-pill ${shelfFilter === "impact" ? "active" : ""}`}
              onClick={() => setShelfFilter("impact")}
              title="PS5, Smart TVs, Eletrodomésticos e grandes economias nominais"
            >
              🏆 Alto Impacto ({rawPending.filter(p => p.shelf === "impact").length})
            </button>
            <button
              type="button"
              className={`pauta-tone-pill ${shelfFilter === "daily" ? "active" : ""}`}
              onClick={() => setShelfFilter("daily")}
              title="Produtos de compra rápida e utilidades cotidianas"
            >
              🛒 Giro Diário ({rawPending.filter(p => p.shelf === "daily").length})
            </button>
            <button
              type="button"
              className={`pauta-tone-pill ${shelfFilter === "demand" ? "active" : ""}`}
              onClick={() => setShelfFilter("demand")}
              title="Favoritados ou com alerta ativo de compradores"
            >
              🎯 Mais Procuradas ({rawPending.filter(p => (p.watchersCount ?? 0) > 0).length})
            </button>
            <button
              type="button"
              className={`pauta-tone-pill ${shelfFilter === "fresh" ? "active" : ""}`}
              onClick={() => setShelfFilter("fresh")}
              title="Ofertas conferidas nas últimas 48 horas"
            >
              🟢 Só Frescas &lt;48h ({rawPending.filter(p => !p.needsPriceRefresh).length})
            </button>
          </div>
          {(searchQuery || shelfFilter !== "all") && (
            <p style={{ fontSize: "12px", color: "var(--ink-muted, #71717a)", margin: 0 }}>
              Mostrando {pending.length} de {rawPending.length} ofertas
            </p>
          )}
        </div>
      )}

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
            </div>
          ))}
        </section>
      )}

      {rawPending.length > 0 && pending.length === 0 && (
        <div style={{ padding: "24px 16px", textAlign: "center", background: "var(--paper-deep, #f4f4f5)", borderRadius: "8px", margin: "16px 0" }}>
          <p style={{ margin: 0, color: "var(--ink-muted, #71717a)", fontSize: "14px" }}>
            Nenhuma oferta encontrada com os filtros selecionados.
          </p>
          <button
            type="button"
            className="pauta-tone-pill"
            style={{ marginTop: "10px" }}
            onClick={() => { setShelfFilter("all"); setSearchQuery(""); }}
          >
            Limpar filtros
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <section className="pauta-pending-section">
          {pending.map((product, index) => {
            const mp = marketplaceDef(product.marketplace);
            const isNext = index === 0;
            const freshness = evaluateFreshnessStatus(product.evidenceObservedAt);
            return (
              <article
                key={product.id}
                className={`pauta-card pauta-card-freshness-${freshness.level}${isNext ? " pauta-card-next" : ""}`}
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {isNext ? (
                          <span className="pauta-card-signal">PRÓXIMO</span>
                        ) : null}
                        {product.shelf === "impact" && (
                          <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                            🏆 Alto Impacto {product.nominalSavingsCents && product.nominalSavingsCents >= 5000 ? `· Economia de ${priceBRL.format(product.nominalSavingsCents / 100)}` : ""}
                          </span>
                        )}
                        {product.shelf === "daily" && (
                          <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                            🛒 Giro Diário
                          </span>
                        )}
                        {(product.watchersCount ?? 0) > 0 && (
                          <span style={{ background: "#fce7f3", color: "#9d174d", padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                            🎯 {product.watchersCount} de olho
                          </span>
                        )}
                      </div>
                      <span
                        className={`pauta-freshness-badge pauta-freshness-${freshness.level}`}
                        title={product.evidenceObservedAt ? `Coletado em: ${new Date(product.evidenceObservedAt).toLocaleString("pt-BR")} (idade: ~${Math.round(freshness.ageHours)}h)` : "Sem data"}
                      >
                        <span className="pauta-freshness-dot" />
                        {freshness.badgeLabel} · {freshness.label}
                      </span>
                    </div>
                    <h3><a href={product.detailUrl ?? `/bizu/${product.slug}`}>{product.displayTitle ?? product.title}</a></h3>
                    {(product.benefit || product.editorialRationale) && <p className="pauta-editorial-rationale">{product.benefit || product.editorialRationale}</p>}
                    {product.purchaseContents && <p className="pauta-editorial-contents"><b>O que vem:</b> {product.purchaseContents}</p>}
                    {product.caveat && <p className="pauta-editorial-context"><b>Ressalva:</b> {product.caveat}</p>}
                    {product.offerOptionLabel && <p><b>Opção:</b> {product.offerOptionLabel}</p>}
                    {product.offerConditions && <p><b>Condições:</b> {product.offerConditions}</p>}
                    {(product.priceType === "range" || product.priceType === "from") && <p>{offerPriceNote(product)}</p>}
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
                {product.needsPriceRefresh && !unlockedRefreshIds.has(product.id) ? (
                  <div style={{ margin: "8px 0" }}>
                    <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#b45309", background: "#fef3c7", padding: "6px 10px", borderRadius: "6px", lineHeight: 1.4 }}>
                      ⚠️ Preço observado há mais de 48h. Confira na loja (a extensão atualiza o preço automaticamente) antes de copiar.
                    </p>
                    <a
                      className="pauta-copy-btn"
                      style={{ display: "block", textAlign: "center", background: "#d97706", color: "#fff", textDecoration: "none", padding: "10px", borderRadius: "8px", fontWeight: 700 }}
                      href={product.shopUrl ?? `/go/${product.slug}`}
                      target="_blank"
                      rel="noreferrer sponsored"
                      onClick={() => {
                        setUnlockedRefreshIds(prev => new Set(prev).add(product.id));
                      }}
                    >
                      🔄 CONFERIR PREÇO NA LOJA (LIBERAR CÓPIA)
                    </a>
                  </div>
                ) : (
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
                )}
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
          <p><strong>{captureActions.review}</strong> {automaticCuration ? 'ofertas ainda não foram liberadas pelo fluxo automático. Consulte os bloqueios e as exceções na curadoria.' : `${captureActions.review === 1 ? "oferta precisa" : "ofertas precisam"} de uma decisão humana.`}</p>
          <a href={curationReviewUrl}>{automaticCuration ? 'Conferir na curadoria' : 'Abrir fila de decisão'}</a>
        </div>}
        {(captureActions.triage > 0 || captureActions.retry > 0) && <div className="pauta-card-actions">
          <div>
            {captureActions.triage > 0 && <p><strong>{captureActions.triage}</strong> {automaticCuration ? 'ofertas recentes têm pendências de curadoria. Consulte o andamento e os problemas para identificar a etapa.' : `${captureActions.triage === 1 ? "oferta ainda precisa passar" : "ofertas ainda precisam passar"} pela triagem.`}</p>}
            {captureActions.retry > 0 && <p><strong>{captureActions.retry}</strong> {captureActions.retry === 1 ? "oferta retida" : "ofertas retidas"} pelo antigo piso de R$ 20 podem ser reavaliadas pela IA.</p>}
          </div>
          <a href={curationTriageUrl}>{automaticCuration ? 'Conferir andamento e problemas' : 'Abrir triagem com IA'}</a>
        </div>}
      </section>}
      <details id="capturas-recentes" className="pauta-captures">
        <summary>Produtos com preço recente{updatedAt ? ` (${recentTotal})` : ""}</summary>
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
                {capture.priceType === "exact" && (capture.currency === "BRL" || !capture.currency) && <p>{priceBRL.format(capture.priceCents / 100)}</p>}
              </div>
              <div>
                <strong className={capture.status === "review" ? "pauta-review-needed" : undefined}>{automaticCuration && capture.status === 'pending' ? 'Aguardando processamento automático' : automaticCuration && capture.status === 'review' ? 'Conferir na curadoria' : captureLabels[capture.status]}</strong>
                <p>{capture.reasons.join(" ")}</p>
                {capture.status === "review" && <a href={curationOfferHref(capture.id,accountKey,{origin:"pauta",channel})}>Revisar esta oferta</a>}
                {(capture.status === "pending" || capture.status === "failed" || capture.status === "retry") && <a href={curationOfferHref(capture.id,accountKey,{origin:"pauta",channel})}>{automaticCuration ? 'Acompanhar esta oferta' : 'Conferir esta oferta'}</a>}
                {capture.status === "blocked" && (
                  <a href={curationOfferHref(capture.id,accountKey,{origin:"pauta",channel,confirm:true})}>
                    {capture.marketplace === "aliexpress" && capture.reasons.some(reason => reason.startsWith("Confirme manualmente"))
                      ? "Confirmar preço da opção" : "Ver detalhes da oferta"}
                  </a>
                )}
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
