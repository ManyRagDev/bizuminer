"use client";

import { useEffect, useRef, useState } from "react";
import { runAutomatedTriageAction } from "./curadoria/actions";

type MarketplaceSlug = "mercadolivre" | "shopee" | "aliexpress";
type BatchStatus = "running" | "ok" | "partial" | "error";
type Batch = {
  id: string;
  status: BatchStatus;
  marketplaces: Array<{ marketplace: string; status: string; runs: number }>;
};

export interface CaptureMarketplaceOption {
  slug: MarketplaceSlug;
  label: string;
  enabled: boolean;
}

const DEFAULT_MARKETPLACES: CaptureMarketplaceOption[] = [
  { slug: "mercadolivre", label: "Mercado Livre", enabled: true },
  { slug: "shopee", label: "Shopee", enabled: true },
  { slug: "aliexpress", label: "AliExpress", enabled: true },
];

const statusLabel: Record<string, string> = {
  waiting: "aguardando",
  running: "capturando…",
  ok: "concluída",
  partial: "parcial",
  error: "erro",
};

export default function BatchCapturePanel({ marketplaces = DEFAULT_MARKETPLACES }: { marketplaces?: CaptureMarketplaceOption[] }) {
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Record<MarketplaceSlug, boolean>>(() => ({
    mercadolivre: false,
    shopee: marketplaces.find((item) => item.slug === "shopee")?.enabled ?? false,
    aliexpress: marketplaces.find((item) => item.slug === "aliexpress")?.enabled ?? false,
  }));
  const [batch, setBatch] = useState<Batch | null>(null);
  const [skipped, setSkipped] = useState<Array<{ marketplace: string; reason: string }>>([]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");
  const [triageState, setTriageState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; processed: number; approved: number; held: number; rejected: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const autoTriageBatchId = useRef<string | null>(null);

  useEffect(() => {
    if (!batch || batch.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/rodagem/lote?id=${encodeURIComponent(batch.id)}`);
        const data = await res.json() as { ok: boolean; batch?: Batch };
        if (data.ok && data.batch) setBatch(data.batch);
      } catch {
        // A próxima leitura tenta novamente; o status visual permanece íntegro.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [batch]);

  useEffect(() => {
    if (!batch || (batch.status !== "ok" && batch.status !== "partial")) return;
    if (autoTriageBatchId.current === batch.id) return;
    autoTriageBatchId.current = batch.id;
    setTriageState({ kind: "running" });
    void runAutomatedTriageAction(100).then((result) => {
      if (!result.ok) {
        setTriageState({
          kind: "error",
          message: result.error === "triage_in_progress"
            ? "A triagem já está rodando. O painel pode ser atualizado em instantes."
            : "A captura terminou, mas a triagem automática falhou. Tente novamente em Operação.",
        });
        return;
      }
      setTriageState({
        kind: "done",
        processed: result.processed,
        approved: result.approved,
        held: result.held,
        rejected: result.rejected,
      });
    }).catch(() => {
      setTriageState({ kind: "error", message: "A captura terminou, mas não foi possível iniciar a triagem automática." });
    });
  }, [batch]);

  const selectedSlugs = marketplaces.filter((item) => selected[item.slug]).map((item) => item.slug);
  const busy = requesting || batch?.status === "running" || triageState.kind === "running";

  function toggleMarketplace(option: CaptureMarketplaceOption) {
    if (busy || (!option.enabled && option.slug !== "mercadolivre")) return;
    setSelected((current) => ({ ...current, [option.slug]: !current[option.slug] }));
  }

  async function start() {
    if (busy || selectedSlugs.length === 0) return;
    setRequesting(true);
    setMessage("");
    setSkipped([]);
    setBatch(null);
    setTriageState({ kind: "idle" });
    try {
      const res = await fetch("/api/admin/rodagem/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages, consent: selected.mercadolivre, marketplaces: selectedSlugs }),
      });
      const data = await res.json() as {
        ok: boolean;
        batch?: Batch;
        error?: string;
        skipped?: Array<{ marketplace: string; reason: string }>;
      };
      if (!data.ok) {
        setMessage(
          data.error === "batch_in_progress"
            ? "Já há uma captura em andamento."
            : data.error === "no_marketplace_selected"
              ? "Selecione pelo menos uma loja."
              : "Não foi possível iniciar a captura. Confira abaixo a disponibilidade das lojas.",
        );
        return;
      }
      setBatch(data.batch ?? null);
      setSkipped(data.skipped ?? []);
      setMessage("Captura iniciada. A triagem da IA começará automaticamente ao final.");
    } catch {
      setMessage("Não foi possível falar com o servidor.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="admin-section daily-capture" aria-labelledby="batch-capture-title">
      <div className="admin-runs-head daily-capture-head">
        <div>
          <p className="eyebrow">Primeiro passo</p>
          <h2 id="batch-capture-title">Capturar ofertas de hoje</h2>
          <p>Escolha as lojas. Ao terminar, a IA avalia automaticamente os novos produtos.</p>
        </div>
        <label className="daily-pages-control">
          Profundidade
          <select value={pages} disabled={busy} onChange={(event) => setPages(Number(event.target.value))}>
            <option value={1}>1 página</option>
            <option value={2}>2 páginas</option>
            <option value={3}>3 páginas</option>
          </select>
        </label>
      </div>

      <div className="capture-marketplace-grid" aria-label="Lojas incluídas na captura">
        {marketplaces.map((option) => {
          const batchState = batch?.marketplaces.find((item) => item.marketplace === option.slug)?.status;
          const skippedState = skipped.find((item) => item.marketplace === option.slug);
          const unavailable = !option.enabled && option.slug !== "mercadolivre";
          return (
            <label key={option.slug} className={`capture-marketplace-option${selected[option.slug] ? " selected" : ""}${unavailable ? " unavailable" : ""}`}>
              <input
                type="checkbox"
                checked={selected[option.slug]}
                disabled={busy || unavailable}
                onChange={() => toggleMarketplace(option)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>
                  {batchState
                    ? statusLabel[batchState] ?? batchState
                    : skippedState
                      ? skippedState.reason === "capture_disabled" ? "indisponível na configuração" : "consentimento necessário"
                      : option.slug === "mercadolivre"
                        ? "marcar confirma o consentimento desta execução"
                        : unavailable ? "captura indisponível" : "pronta"}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <div className="daily-capture-action">
        <button type="button" disabled={busy || selectedSlugs.length === 0} onClick={() => void start()}>
          {requesting
            ? "iniciando…"
            : batch?.status === "running"
              ? "captura em andamento…"
              : triageState.kind === "running"
                ? "IA avaliando os produtos…"
                : `Capturar em ${selectedSlugs.length} ${selectedSlugs.length === 1 ? "loja" : "lojas"} →`}
        </button>
        <span>{selectedSlugs.length === 0 ? "Selecione pelo menos uma loja" : `${selectedSlugs.length} de ${marketplaces.length} lojas selecionadas`}</span>
      </div>

      {message && <p className="admin-message" role="status">{message}</p>}
      {triageState.kind === "running" && (
        <div className="workflow-live-state" role="status">
          <span className="triage-spinner" aria-hidden="true" />
          <div><strong>Captura concluída. A IA está fazendo a triagem.</strong><small>Não é necessário abrir Pipeline & Lotes.</small></div>
        </div>
      )}
      {triageState.kind === "done" && (
        <div className="workflow-result" role="status">
          <div>
            <strong>Triagem concluída: {triageState.processed} avaliados</strong>
            <span>{triageState.approved} publicados · {triageState.held} aguardando condição · {triageState.rejected} descartados</span>
          </div>
          <a href="/admin/curadoria?aba=auditoria">Auditar seleção de hoje →</a>
        </div>
      )}
      {triageState.kind === "error" && <p className="admin-message admin-message--notice" role="alert">{triageState.message}</p>}
    </section>
  );
}
