"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptureBatch as Batch } from "../../lib/capture-batch-db";
import { browserCaptureBookmarklet } from "../../lib/browser-capture-bookmarklet";

type MarketplaceSlug = "mercadolivre" | "shopee" | "aliexpress";
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
  awaiting_browser: "aguardando Mercado Livre no navegador",
};
const serverCaptureNotice =
  "Captura automática solicitada. O andamento e a triagem deste lote ficam salvos.";

export default function BatchCapturePanel({
  marketplaces = DEFAULT_MARKETPLACES,
}: {
  marketplaces?: CaptureMarketplaceOption[];
}) {
  const router = useRouter();
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Record<MarketplaceSlug, boolean>>(
    () => ({
      mercadolivre: false,
      shopee:
        marketplaces.find((item) => item.slug === "shopee")?.enabled ?? false,
      aliexpress:
        marketplaces.find((item) => item.slug === "aliexpress")?.enabled ??
        false,
    }),
  );
  const [batch, setBatch] = useState<Batch | null>(null);
  const [skipped, setSkipped] = useState<
    Array<{ marketplace: string; reason: string }>
  >([]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");
  const [browserBlock, setBrowserBlock] = useState("");
  const [browserBusy, setBrowserBusy] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/rodagem/lote", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data: { ok: boolean; batch?: Batch }) => {
        if (data.ok && data.batch)
          setBatch((current) => current ?? data.batch!);
      })
      .catch(() => {
        /* A new capture can still be requested; the server owns the lock. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!batch || batch.status !== "running") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/rodagem/lote?id=${encodeURIComponent(batch.id)}`,
          { cache: "no-store", signal: AbortSignal.timeout(15_000) },
        );
        const data = (await res.json()) as { ok: boolean; batch?: Batch };
        if (!cancelled && data.ok && data.batch) {
          setBatch(data.batch);
          if (data.batch.status !== "running") router.refresh();
        } else if (!cancelled)
          setBatch((current) => (current ? { ...current } : null));
      } catch {
        if (!cancelled) {
          setMessage(
            "Sem atualização do servidor. A execução continua sendo acompanhada pelo lote.",
          );
          setBatch((current) => (current ? { ...current } : null));
        }
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [batch, router]);

  const triage = batch?.triage;
  const automatedOptions = marketplaces.filter(
    (item) => item.slug !== "mercadolivre",
  );
  const selectedSlugs = automatedOptions
    .filter((item) => selected[item.slug])
    .map((item) => item.slug);
  const busy = requesting || batch?.status === "running";

  function toggleMarketplace(option: CaptureMarketplaceOption) {
    if (busy || !option.enabled) return;
    setSelected((current) => ({
      ...current,
      [option.slug]: !current[option.slug],
    }));
  }

  async function start() {
    if (busy || selectedSlugs.length === 0) return;
    setRequesting(true);
    setMessage("");
    setSkipped([]);
    setBatch(null);
    try {
      const res = await fetch("/api/admin/rodagem/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages,
          consent: selected.mercadolivre,
          marketplaces: selectedSlugs,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        batch?: Batch;
        error?: string;
        skipped?: Array<{ marketplace: string; reason: string }>;
      };
      if (!data.ok) {
        if (data.batch) setBatch(data.batch);
        setMessage(
          data.error === "batch_in_progress"
            ? "Já há uma captura em andamento."
            : data.error === "github_token_not_configured"
              ? "O executor de captura precisa ser configurado no servidor. Nenhum lote foi iniciado."
              : data.error === "dispatch_failed"
                ? "O executor não confirmou o início. O lote foi encerrado; confira a configuração antes de tentar novamente."
                : data.error === "no_marketplace_selected"
                  ? "Selecione pelo menos uma loja."
                  : data.error === "manual_capture_only"
                    ? "A captura do Mercado Livre é exclusivamente manual. Utilize a extensão ou o bookmarklet no navegador."
                    : "Não foi possível iniciar a captura. Confira abaixo a disponibilidade das lojas.",
        );
        return;
      }
      setBatch(data.batch ?? null);
      setSkipped(data.skipped ?? []);
      setMessage(serverCaptureNotice);
    } catch {
      setMessage("Não foi possível falar com o servidor.");
    } finally {
      setRequesting(false);
    }
  }

  async function continueBrowser(action: "import" | "skip" | "resume") {
    if (!batch || browserBusy) return;
    setBrowserBusy(true);
    try {
      const res = await fetch("/api/admin/rodagem/navegador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.id,
          action,
          block: browserBlock,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(
          data.error === "invalid_capture_block"
            ? "As ofertas copiadas são inválidas ou expiraram. No Mercado Livre, clique novamente no favorito de captura e cole o novo conteúdo aqui."
            : "Não foi possível continuar este lote. Confira seu estado e tente novamente.",
        );
        return;
      }
      setBatch(data.batch);
      setBrowserBlock("");
      setMessage(
        data.continuationPending
          ? "Produtos salvos. O executor não confirmou a retomada; use Continuar triagem."
          : action === "skip"
            ? "Mercado Livre omitido. Continuando com as lojas já capturadas."
            : `${data.importedCount} ${data.importedCount === 1 ? "oferta do Mercado Livre salva" : "ofertas do Mercado Livre salvas"} neste lote. A triagem continuará no executor.`,
      );
    } catch {
      setMessage(
        "Sem confirmação do servidor. O bloco pode ser reenviado sem duplicar a importação.",
      );
    } finally {
      setBrowserBusy(false);
    }
  }

  return (
    <section
      className="admin-section daily-capture"
      aria-labelledby="batch-capture-title"
    >
      <div className="admin-runs-head daily-capture-head">
        <div>
          <p className="eyebrow">Primeiro passo</p>
          <h2 id="batch-capture-title">Capturar ofertas de hoje</h2>
          <p>
            Capture ofertas automaticamente nas lojas com API oficial (Shopee e
            AliExpress) ou use a Extensão BizuMiner para capturar o Mercado Livre
            direto no seu navegador.
          </p>
        </div>
        <label className="daily-pages-control">
          Páginas por loja
          <select
            value={pages}
            disabled={busy}
            onChange={(event) => setPages(Number(event.target.value))}
          >
            <option value={1}>1 página</option>
            <option value={2}>2 páginas</option>
            <option value={3}>3 páginas</option>
          </select>
        </label>
      </div>

      <div
        className="capture-marketplace-grid"
        aria-label="Lojas com automação direta via API"
      >
        {automatedOptions.map((option) => {
          const batchState =
            batch?.status === "running"
              ? batch.marketplaces.find(
                  (item) => item.marketplace === option.slug,
                )?.status
              : undefined;
          const skippedState = skipped.find(
            (item) => item.marketplace === option.slug,
          );
          const unavailable = !option.enabled;
          return (
            <label
              key={option.slug}
              className={`capture-marketplace-option${selected[option.slug] ? " selected" : ""}${unavailable ? " unavailable" : ""}`}
            >
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
                    ? (statusLabel[batchState] ?? batchState)
                    : skippedState
                      ? skippedState.reason === "capture_disabled"
                        ? "indisponível na configuração"
                        : "consentimento necessário"
                      : unavailable
                        ? "captura indisponível"
                        : "pronta (API oficial)"}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <div className="daily-capture-action">
        <button
          type="button"
          disabled={busy || selectedSlugs.length === 0}
          onClick={() => void start()}
        >
          {requesting
            ? "iniciando…"
            : batch?.status === "running"
              ? batch.phase === "triaging"
                ? "IA avaliando este lote…"
                : batch.phase === "queued"
                  ? "aguardando executor…"
                  : batch.phase === "awaiting_browser"
                    ? "aguardando Mercado Livre…"
                    : "captura em andamento…"
              : `Capturar em ${selectedSlugs.length} ${selectedSlugs.length === 1 ? "loja (API)" : "lojas (API)"} →`}
        </button>
        <span>
          {selectedSlugs.length === 0
            ? "Selecione pelo menos uma loja"
            : `${selectedSlugs.length} de ${automatedOptions.length} lojas automáticas selecionadas`}
        </span>
      </div>

      <div className="daily-ml-bridge">
        <div className="daily-ml-bridge-info">
          <span className="daily-ml-tag">MERCADO LIVRE · VIA EXTENSÃO</span>
          <strong>Capturar ofertas do Mercado Livre no navegador</strong>
          <p>
            Com a <b>Extensão BizuMiner</b> ativa, abra as ofertas do Mercado Livre e clique em <b>“Importar ofertas e continuar”</b> no popup da extensão. Todos os produtos serão capturados sem risco de bloqueio e enviados para a triagem.
          </p>
        </div>
        <div className="daily-ml-bridge-action">
          <a
            href="https://www.mercadolivre.com.br/ofertas"
            target="_blank"
            rel="noopener noreferrer"
            className="daily-ml-btn"
          >
            Abrir ofertas no Mercado Livre ↗
          </a>
        </div>
      </div>

      {message && (
        <p className="admin-message" role="status">
          {batch?.status === "ok" && batch.browser?.importedCount
            ? `${batch.browser.importedCount} ${batch.browser.importedCount === 1 ? "oferta do Mercado Livre salva" : "ofertas do Mercado Livre salvas"} neste lote. Triagem concluída.`
            : batch?.phase === "awaiting_browser" &&
                message === serverCaptureNotice
              ? "Aguardando importação manual do Mercado Livre. Confira as instruções abaixo."
              : message}
        </p>
      )}
      {batch && (
        <p className="admin-message">
          {batch.status === "running"
            ? "Execução em andamento"
            : "Última execução"}{" "}
          ·{" "}
          {new Date(batch.started_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          })}
          <br />
          {batch.marketplaces
            .map(
              (item) =>
                `${marketplaces.find((option) => option.slug === item.marketplace)?.label ?? item.marketplace}: ${statusLabel[item.status] ?? item.status}`,
            )
            .join(" · ")}
        </p>
      )}
      {batch?.status === "running" && (
        <div className="workflow-live-state" role="status">
          {batch.phase !== "awaiting_browser" && (
            <span className="triage-spinner" aria-hidden="true" />
          )}
          <div>
            <strong>
              {batch.phase === "triaging"
                ? "A IA está fazendo a triagem deste lote."
                : batch.phase === "queued"
                  ? "Aguardando o executor iniciar a captura."
                  : batch.phase === "awaiting_browser"
                    ? "Aguardando importação manual do Mercado Livre."
                    : "Buscando ofertas nas lojas selecionadas."}
            </strong>
            <small>
              {batch.phase === "awaiting_browser"
                ? "Você pode concluir sem Mercado Livre ou importar ofertas pelo navegador. As outras lojas já capturadas ficam preservadas."
                : "O andamento fica salvo. Reabrir o painel retoma o acompanhamento."}
            </small>
          </div>
        </div>
      )}
      {batch?.browser?.canContinue && (
        <div className="browser-capture-continuation">
          <h3>Contingência do Mercado Livre</h3>
          <p>
            {batch.marketplaces.find((item) => item.marketplace === "mercadolivre")?.error === "ml_access_verification_required"
              ? "O ML devolveu uma verificação de acesso ao coletor automático. Importar pelo navegador é uma alternativa manual opcional."
              : "Este lote está aguardando uma importação pelo navegador. Novos lotes tentam primeiro a captura automática."}
          </p>
          <details>
            <summary>Usar importação manual neste lote</summary>
            <ol className="browser-capture-steps">
              <li>
                <h4>1. Crie o favorito de captura</h4>
                <p>
                  Você faz isso uma vez. Depois, reutiliza o mesmo favorito em
                  novas capturas.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(browserCaptureBookmarklet())
                      .then(
                        () => setCopiedBookmarklet(true),
                        () => {
                          setCopiedBookmarklet(false);
                          setMessage(
                            "A cópia não foi permitida. Abra Ver código para copiar manualmente e copie o conteúdo inteiro.",
                          );
                        },
                      )
                  }
                >
                  {copiedBookmarklet
                    ? "Código copiado — agora salve o favorito"
                    : "Copiar código do favorito"}
                </button>
                <p>
                  Salve esta página nos favoritos do navegador. No gerenciador de
                  favoritos, edite o nome para <b>Copiar ofertas BizuMiner</b> e
                  substitua todo o <b>endereço / URL</b> pelo código copiado.
                  Salve na barra de favoritos.
                </p>
                <p className="browser-capture-help">
                  No Opera: use o coração ao lado do endereço para salvar a
                  página. Abra o gerenciador de favoritos e clique no lápis desse
                  favorito para editar nome e URL.
                </p>
                <details>
                  <summary>Ver código para copiar manualmente</summary>
                  <label htmlFor="browser-capture-code">
                    Código completo para o endereço do favorito
                  </label>
                  <textarea
                    id="browser-capture-code"
                    rows={3}
                    readOnly
                    value={browserCaptureBookmarklet()}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </details>
              </li>
              <li>
                <h4>2. Abra o Mercado Livre e copie as ofertas</h4>
                <a
                  href="https://www.mercadolivre.com.br/ofertas"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir ofertas do Mercado Livre →
                </a>
                <p>
                  Na nova aba, faça login se solicitado e espere os produtos
                  aparecerem. Depois, clique no favorito{" "}
                  <b>Copiar ofertas BizuMiner</b> que você criou no passo 1.
                </p>
                <p>
                  Um aviso informa quantas ofertas foram copiadas. Se aparecer uma
                  caixa com texto para copiar, copie todo o conteúdo dela.
                </p>
              </li>
              <li>
                <h4>3. Volte aqui, cole e importe</h4>
                <label htmlFor="browser-capture-block">
                  Cole aqui as ofertas copiadas
                </label>
                <textarea
                  id="browser-capture-block"
                  rows={4}
                  value={browserBlock}
                  onChange={(e) => setBrowserBlock(e.target.value)}
                  placeholder="Clique neste campo e cole (Ctrl+V) depois de usar o favorito no Mercado Livre."
                />
                <button
                  type="button"
                  disabled={browserBusy || !browserBlock.trim()}
                  onClick={() => void continueBrowser("import")}
                >
                  {browserBusy
                    ? "Importando…"
                    : "Importar ofertas e iniciar triagem"}
                </button>
                <p>
                  Depois deste clique, o painel confirma a importação e inicia a
                  triagem automaticamente.
                </p>
              </li>
            </ol>
            <p>
              Conclua a importação até{" "}
              <b>
                {new Date(batch.browser.deadline).toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>{" "}
              (horário de Brasília). O lote aguarda sua ação até esse horário.
            </p>
            <details>
              <summary>Já uso a extensão BizuMiner</summary>
              <p>
                Você pode usar a extensão no lugar do favorito: abra as ofertas do
                Mercado Livre, clique no ícone da extensão BizuMiner e em{" "}
                <b>Ler ofertas desta página</b>. Confira a quantidade e clique em{" "}
                <b>Importar … ofertas e continuar</b>. Depois volte ao painel para
                acompanhar a triagem.
              </p>
              <p>
                Se a extensão não mostrar essa opção, use os três passos acima.
                Para conectar uma extensão já instalada, acesse{" "}
                <a
                  href="/admin?aba=captura-manual#devices-title"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Dispositivos da extensão
                </a>
                .
              </p>
            </details>
          </details>
          <button
            type="button"
            className="secondary"
            disabled={browserBusy}
            onClick={() => void continueBrowser("skip")}
          >
            Continuar este lote sem Mercado Livre
          </button>
        </div>
      )}
      {batch?.browser?.canResume && (
        <button
          type="button"
          disabled={browserBusy}
          onClick={() => void continueBrowser("resume")}
        >
          Continuar triagem
        </button>
      )}
      {triage && (
        <div className="workflow-result" role="status">
          <div>
            <strong>
              Triagem deste lote: {triage.processed}{" "}
              {triage.processed === 1 ? "avaliado" : "avaliados"}
            </strong>
            <span>
              {triage.approved} aprovados no catálogo · {triage.held} retidos ·{" "}
              {triage.rejected} rejeitados · {triage.annotatedPending} para
              revisão
            </span>
          </div>
          <a href="/admin/curadoria?aba=selecao">
            Conferir seleção e preparar pauta →
          </a>
        </div>
      )}
      {batch?.error && (
        <p className="admin-message admin-message--notice" role="alert">
          {batch.error === "execution_timeout"
            ? "A última operação excedeu o prazo e foi encerrada. Os produtos já capturados foram preservados. Você pode iniciar uma nova captura."
            : batch.error === "gemini_key_not_configured"
              ? "A captura terminou, mas a chave da IA está ausente no executor. Configure-a antes de triar."
              : "A operação terminou com falha. Consulte o histórico; produtos já capturados ficam disponíveis em Pendências e na triagem manual."}
        </p>
      )}
      {batch?.status === "partial" && !batch.error && (
        <p className="admin-message admin-message--notice" role="alert">
          Algumas consultas falharam. A triagem avaliou os produtos disponíveis
          deste lote.
        </p>
      )}
    </section>
  );
}
