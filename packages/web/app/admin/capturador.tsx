"use client";

import { useState } from "react";
import { BOOKMARKLET_VERSION } from "../../lib/bookmarklet";

type CaptureResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  title?: string;
  priceCents?: number;
  originalPriceCents?: number | null;
  isNew?: boolean;
  previousPriceCents?: number | null;
};

const priceBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

/**
 * Captura manual via bookmarklet.
 *
 * Fluxo: o curador navega no ML como humano → clica no favorito → o bookmarklet
 * envia o payload DIRETO para o endpoint de captura (com fallback de copiar o
 * bloco BM1 para colagem manual). O bookmarklet é gerado no SERVIDOR
 * (page.tsx) e chega aqui pronto — o token de captura não é exposto ao client.
 *
 * Instalação: o React bloqueia URLs `javascript:` em `href`, então NÃO usamos
 * link arrastável (incidente 25/08/2026). O dono copia o código e cria o
 * favorito manualmente: Ctrl+D → renomeia → apaga o endereço → cola → salvar.
 *
 * O aviso de responsabilidade é proposital (decisão 24/08, linguagem ajustada
 * em E0/25/08): a coleta automática via sweep é um limite técnico adotado para
 * reduzir risco — não uma conclusão jurídica — e está desligada por default. O
 * bookmarklet é o caminho de risco residual mínimo (ação humana, sem requisição
 * automatizada). O dono opta por usar.
 */
export default function Capturador({ bookmarkletHref, bookmarkletOk }: { bookmarkletHref: string; bookmarkletOk: boolean }) {
  const [block, setBlock] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !block.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/captura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ block: block.trim() }),
      });
      const payload = (await response.json()) as CaptureResponse;
      setResult(payload);
      if (payload.ok) setBlock("");
    } catch {
      setResult({ ok: false, error: "server_error", message: "Falha de rede ao enviar o bloco." });
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setCopiedCode(true);
    } catch {
      setCopiedCode(false);
    }
  }

  return (
    <section className="admin-section capturador-section" aria-labelledby="capturador-title">
      <h2 id="capturador-title">Captura manual — bookmarklet</h2>

      <div className="capturador-warning" role="note">
        <p>
          <b>Atenção:</b> a coleta automática (<i>sweep</i>) da página de ofertas está <b>desligada por default</b> —
          um limite técnico adotado para reduzir risco à conta de afiliado. O bookmarklet abaixo é a alternativa de
          <b> risco residual mínimo</b>: você navega como humano e ele apenas lê a página que você já abriu — sem
          requisição automatizada. Uso por sua conta e risco.
        </p>
      </div>

      {!bookmarkletOk && (
        <div className="capturador-result error" role="alert">
          <p><b>Bookmarklet quebrado:</b> o código gerado não compila. Verifique o script em <code>lib/bookmarklet.ts</code>.</p>
        </div>
      )}

      <div className="capturador-step">
        <h3>1. Instale o bookmarklet</h3>
        <p>
          <button type="button" onClick={() => void copyCode()}>{copiedCode ? "copiado!" : "copiar código"}</button>
        </p>
        <p className="capturador-note">
          Depois: <b>Ctrl+D</b> em qualquer página → renomeie para “Salvar no BizuMiner” → apague o campo de endereço →
          cole o código → salvar. (v{BOOKMARKLET_VERSION})
        </p>
      </div>

      <div className="capturador-step">
        <h3>2. Capture a oferta</h3>
        <p>
          Abra uma página de produto no Mercado Livre e clique no favorito “Salvar no BizuMiner”. A oferta é enviada
          direto ao BizuMiner — sem copiar nem colar. Se o envio falhar, o bloco é copiado para colagem manual abaixo.
        </p>
      </div>

      <form className="capturador-form" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="capturador-bloco">Bloco BM1 capturado</label>
        <textarea
          id="capturador-bloco"
          className="capturador-textarea"
          rows={4}
          value={block}
          onChange={(event) => { setBlock(event.target.value); setResult(null); }}
          placeholder="Cole aqui o bloco BM1 (só se o envio automático falhar)…"
        />
        <button type="submit" disabled={busy || !block.trim()}>
          {busy ? "gravando…" : "gravar oferta"}
        </button>
      </form>

      {result && (
        <div className={`capturador-result ${result.ok ? "ok" : "error"}`} role="status">
          {result.ok ? (
            <p>
              <b>Oferta gravada.</b> {result.title}
              <br />
              {priceBRL(result.priceCents!)}
              {result.originalPriceCents != null ? ` · de ${priceBRL(result.originalPriceCents)}` : ""}
              {" "}· {result.isNew ? "produto novo" : "produto atualizado"}
              {result.previousPriceCents != null ? ` · preço anterior ${priceBRL(result.previousPriceCents)}` : ""}
            </p>
          ) : (
            <p>
              <b>Não foi possível gravar.</b> {result.message ?? result.error}
            </p>
          )}
        </div>
      )}

      <p className="admin-footnote">
        O preço capturado manualmente <b>congela</b> — não participa do “menor preço verificado” (que exige ≥3
        observações em ≥7 dias do robô). A data de captura é exibida na página do produto.
      </p>
    </section>
  );
}
