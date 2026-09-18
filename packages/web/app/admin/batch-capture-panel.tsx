"use client";

import { useEffect, useState } from "react";

type Batch = { id: string; status: "running" | "ok" | "partial" | "error"; marketplaces: Array<{ marketplace: string; status: string; runs: number }> };
const label: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", aliexpress: "AliExpress", waiting: "aguardando", running: "rodando", ok: "concluída", partial: "parcial", error: "erro" };

export default function BatchCapturePanel() {
  const [pages, setPages] = useState(1);
  const [consent, setConsent] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!batch || batch.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/rodagem/lote?id=${encodeURIComponent(batch.id)}`);
        const data = await res.json() as { ok: boolean; batch?: Batch };
        if (data.ok && data.batch) setBatch(data.batch);
      } catch { /* próxima leitura tenta de novo */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [batch]);
  async function start() {
    if (requesting || batch?.status === "running") return;
    setRequesting(true); setMessage("");
    try {
      const res = await fetch("/api/admin/rodagem/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages, consent }) });
      const data = await res.json() as { ok: boolean; batch?: Batch; error?: string; skipped?: Array<{ marketplace: string }> };
      if (!data.ok) { setMessage(data.error === "batch_in_progress" ? "Já há um lote em andamento." : "Não foi possível iniciar o lote. Verifique as credenciais das lojas e a migration."); return; }
      setBatch(data.batch ?? null);
      const skipped = data.skipped?.map((item) => label[item.marketplace] ?? item.marketplace).join(", ");
      setMessage(skipped ? `Lote iniciado. Sem captura em: ${skipped}.` : "Lote iniciado. O painel acompanhará cada loja.");
    } catch { setMessage("Não foi possível falar com o servidor."); }
    finally { setRequesting(false); }
  }
  const busy = requesting || batch?.status === "running";
  return <section className="admin-section" aria-labelledby="batch-capture-title">
    <div className="admin-runs-head"><div><p className="eyebrow">Começo do dia</p><h2 id="batch-capture-title">Rodar captura diária</h2><p>Comece pelas lojas disponíveis. Depois o próximo passo será a triagem IA.</p></div>
      <div className="admin-trigger"><label>páginas <select value={pages} disabled={busy} onChange={(event) => setPages(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><button type="button" disabled={busy} onClick={() => void start()}>{busy ? "lote em andamento…" : "rodar 2 lojas ▸"}</button></div></div>
    <label className="admin-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} /> incluir Mercado Livre também (3 lojas; confirma o consentimento)</label>
    {message && <p className="admin-message" role="status">{message}</p>}
    {batch && <div className="admin-message admin-message--notice"><b>Lote {batch.status === "running" ? "em andamento" : label[batch.status]}:</b> {batch.marketplaces.map((item) => `${label[item.marketplace] ?? item.marketplace}: ${label[item.status] ?? item.status}`).join(" · ")}{batch.status !== "running" && <><br /><a href="/admin/curadoria?aba=pipeline">Seguir para triagem IA →</a></>}</div>}
  </section>;
}
