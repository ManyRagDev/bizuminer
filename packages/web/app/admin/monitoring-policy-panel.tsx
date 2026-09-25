"use client";

import { useState } from "react";
import type { MonitoringPolicyEventView, MonitoringPolicyView } from "../../lib/affiliate-monitoring-db";

const STORES = [
  { marketplace: "shopee", label: "Shopee" },
  { marketplace: "aliexpress", label: "AliExpress" },
] as const;

export default function MonitoringPolicyPanel({ initialPolicies, initialEvents }: {
  initialPolicies: MonitoringPolicyView[] | null;
  initialEvents: MonitoringPolicyEventView[];
}) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function change(marketplace: "shopee" | "aliexpress", enabled: boolean) {
    if (busy || !policies) return;
    setBusy(marketplace);
    setMessage("");
    try {
      const response = await fetch("/api/admin/monitoring/policy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace, enabled }),
      });
      const result = await response.json() as { ok?: boolean; policy?: MonitoringPolicyView };
      if (!response.ok || !result.ok || !result.policy) throw new Error("save_failed");
      setPolicies((current) => current?.map((item) =>
        item.marketplace === marketplace ? result.policy! : item) ?? null);
      try {
        const history = await fetch("/api/admin/monitoring/policy");
        if (history.ok) {
          const updated = await history.json() as { events?: MonitoringPolicyEventView[] };
          if (updated.events) setEvents(updated.events);
        }
      } catch { /* escolha já foi salva; histórico recarrega na próxima visita */ }
      setMessage(`${marketplace === "shopee" ? "Shopee" : "AliExpress"} ${enabled ? "ativada" : "pausada"} para as próximas rodadas agendadas.`);
    } catch {
      setMessage("Não foi possível salvar a escolha. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-section" aria-labelledby="monitoring-policy-title">
      <h2 id="monitoring-policy-title">Cron por loja · conta da casa</h2>
      <p>A escolha vale para as próximas rodadas agendadas. Uma rodada já iniciada segue até terminar. O botão “Iniciar agora” continua disponível para execução manual.</p>
      {policies === null ? (
        <p className="admin-message admin-message--notice" role="status">A configuração por loja aguarda a atualização do banco.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Loja</th><th>Cron</th><th>Controle</th></tr></thead>
            <tbody>
              {STORES.map(({ marketplace, label }) => {
                const policy = policies.find((item) => item.marketplace === marketplace);
                return (
                  <tr key={marketplace}>
                    <td>{label}</td>
                    <td><span className={`run-status ${policy?.enabled ? "ok" : "empty"}`}>
                      {policy?.enabled ? "ativo" : "pausado"}
                    </span></td>
                    <td><button type="button" disabled={busy !== null || !policy}
                      onClick={() => void change(marketplace, !policy?.enabled)}>
                      {busy === marketplace ? "salvando…" : policy?.enabled ? "Pausar cron" : "Ativar cron"}
                    </button></td>
                  </tr>
                );
              })}
              <tr><td>Mercado Livre</td><td><span className="run-status empty">indisponível</span></td>
                <td>O acompanhamento automático por ID ainda não está habilitado.</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {message && <p className="admin-message" role="status">{message}</p>}
      {events.length > 0 && <div className="admin-table-wrap">
        <table className="admin-table">
          <caption>Últimas alterações do cron</caption>
          <thead><tr><th>Quando</th><th>Loja</th><th>Escolha</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.id}>
            <td>{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(event.changedAt))}</td>
            <td>{event.marketplace === "shopee" ? "Shopee" : "AliExpress"}</td>
            <td>{event.enabled ? "ativado" : "pausado"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  );
}
