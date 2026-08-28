"use client";

import { useState } from "react";

type ConfigView = {
  marketplace: string;
  configured: boolean;
  status: "active" | "invalid" | "suspended" | null;
  validatedAt: string | null;
};

type AccountSummary = {
  id: string;
  tenantId: string;
  publicSlug: string;
  displayName: string;
  status: "active" | "suspended";
  ownerCount: number;
  configs: ConfigView[];
};

type AffiliatesResponse = {
  ok: boolean;
  accounts?: AccountSummary[];
  error?: string;
};

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Gestão mínima de afiliados (E1): mostra a conta da casa e o status da
 * credencial de marketplace SEM devolver tracking_id/tool_id. O formulário de
 * configuração envia os valores ao servidor, mas o servidor nunca os devolve
 * ao client.
 */
export default function Affiliates({ initialAccounts }: { initialAccounts: AccountSummary[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [trackingId, setTrackingId] = useState("");
  const [toolId, setToolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/affiliates");
    const payload = (await response.json()) as AffiliatesResponse;
    if (payload.ok && payload.accounts) setAccounts(payload.accounts);
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/affiliates/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateId: "aff_local",
          marketplace: "mercadolivre",
          trackingId: trackingId.trim(),
          toolId: toolId.trim(),
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (response.status !== 200 || !payload.ok) {
        setMessage(payload.error === "invalid_payload" ? "Preencha tracking id e tool id." : "Não foi possível salvar a configuração.");
      } else {
        setMessage("Configuração do Mercado Livre salva.");
        setTrackingId("");
        setToolId("");
        await refresh();
      }
    } catch {
      setMessage("Falha de rede ao salvar a configuração.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section" aria-labelledby="affiliates-title">
      <h2 id="affiliates-title">Afiliados</h2>

      {accounts.length === 0 ? (
        <p className="member-empty">Nenhuma conta de afiliado. A migration de fundação (E1) ainda não foi aplicada no banco.</p>
      ) : (
        <ul className="admin-list">
          {accounts.map((account) => {
            const ml = account.configs.find((c) => c.marketplace === "mercadolivre");
            return (
              <li key={account.id}>
                <span>
                  <b>{account.displayName}</b>{" "}
                  <span className="admin-fact">· tenant {account.tenantId} · slug {account.publicSlug} · {account.ownerCount} owner(s)</span>
                </span>
                <span>
                  ML: {ml?.configured ? `${ml.status}${ml.validatedAt ? ` (validado ${dateTime(ml.validatedAt)})` : ""}` : "não configurado"}
                </span>
                <span className={`run-status ${account.status === "active" ? "ok" : "error"}`}>{account.status}</span>
              </li>
            );
          })}
        </ul>
      )}

      <form className="capturador-form" onSubmit={(event) => void saveConfig(event)}>
        <h3>Credencial do Mercado Livre (casa)</h3>
        <label className="sr-only" htmlFor="aff-tracking">Tracking id (matt_word)</label>
        <input
          id="aff-tracking"
          type="text"
          value={trackingId}
          onChange={(event) => setTrackingId(event.target.value)}
          placeholder="tracking id (matt_word)"
          autoComplete="off"
        />
        <label className="sr-only" htmlFor="aff-tool">Tool id (matt_tool)</label>
        <input
          id="aff-tool"
          type="text"
          value={toolId}
          onChange={(event) => setToolId(event.target.value)}
          placeholder="tool id (matt_tool)"
          autoComplete="off"
        />
        <button type="submit" disabled={busy}>{busy ? "salvando…" : "salvar configuração"}</button>
      </form>

      {message && <p className="admin-message" role="status">{message}</p>}

      <p className="admin-footnote">
        Os valores de tracking/tool são gravados no servidor e nunca devolvidos a esta tela. A comissão por afiliado
        só entra no clique na entrega E3 — até lá o link continua usando a configuração global.
      </p>
    </section>
  );
}
