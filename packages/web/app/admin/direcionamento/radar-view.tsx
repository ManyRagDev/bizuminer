"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityWithProduct } from "../../../lib/opportunity-db.ts";
import type { OpportunityState } from "../../../lib/opportunity-contract.ts";
import {
  fetchRadarOpportunitiesAction, createAudiencePolicyBundleAction, createOrUpdateOpportunityAction,
  archiveOpportunityAction,
  reactivateOpportunityAction,
} from "./opportunity-actions.ts";

export default function RadarView({
  tenantId,
  initialOpportunities,
}: {
  tenantId: string;
  initialOpportunities: OpportunityWithProduct[];
}) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<OpportunityWithProduct[]>(initialOpportunities);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [audienceFilter, setAudienceFilter] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      const res = await fetchRadarOpportunitiesAction({
        tenantId,
        channel: channelFilter !== "all" ? channelFilter : undefined,
        state: stateFilter !== "all" ? (stateFilter as OpportunityState) : undefined,
        audienceKey: audienceFilter.trim() ? audienceFilter.trim() : undefined,
      });
      if (res.ok) {
        setOpportunities(res.opportunities);
        setMessage(`Radar atualizado: ${res.opportunities.length} oportunidades encontradas.`);
      } else {
        setMessage(`Erro ao carregar radar: ${res.error}`);
      }
    });
  };

  const handleArchive = (opportunityId: string) => {
    startTransition(async () => {
      const res = await archiveOpportunityAction({ opportunityId, tenantId });
      if (res.ok) {
        setMessage("Oportunidade arquivada.");
        handleRefresh();
      } else {
        setMessage(`Erro ao arquivar: ${res.error}`);
      }
    });
  };

  const handleReactivate = (opportunityId: string) => {
    startTransition(async () => {
      const res = await reactivateOpportunityAction({ opportunityId, tenantId });
      if (res.ok) {
        setMessage("Oportunidade reativada.");
        handleRefresh();
      } else {
        setMessage(`Erro ao reativar: ${res.error}`);
      }
    });
  };

  const filtered = opportunities.filter((opp) => {
    if (channelFilter !== "all" && opp.channel !== channelFilter) return false;
    if (stateFilter !== "all" && opp.state !== stateFilter) return false;
    if (audienceFilter.trim() && !opp.audienceKey.toLowerCase().includes(audienceFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="admin-panel" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2>Radar de Oportunidades Comerciais</h2>
          <p style={{ margin: 0, color: "#666" }}>
            Priorização contínua com verificação de cooldown, pontuação de classe e direcionamento por público.
          </p>
        </div>
        <button type="button" onClick={handleRefresh} disabled={pending}>
          {pending ? "Carregando..." : "↻ Recarregar Radar"}
        </button>
      </div>

      {message && <p role="status" style={{ fontWeight: "bold", margin: "0.5rem 0" }}>{message}</p>}

      <details><summary>Política do público e monitoramento manual</summary>
      <form action={f=>startTransition(async()=>{const r=await createAudiencePolicyBundleAction({tenantId,name:String(f.get('name')),audienceKey:String(f.get('audience')),channel:String(f.get('channel')),cooldownHours:Number(f.get('hours')),version:String(f.get('version'))});setMessage(r.ok?'Política criada: '+JSON.stringify(r.result):r.error??'Falha');})}><h3>Política explícita de público/canal</h3><label>Nome <input name="name" required/></label><label>Público <input name="audience" required/></label><label>Canal <select name="channel"><option value="telegram_channel">Telegram</option><option value="whatsapp_channel">WhatsApp assistido</option><option value="instagram_stories">Instagram Stories</option></select></label><label>Cooldown em horas <input name="hours" type="number" min="0" step="any" required/></label><label>Versão <input name="version" required/></label><button disabled={pending}>Salvar política aprovada</button></form>
      <form action={f=>startTransition(async()=>{const r=await createOrUpdateOpportunityAction({tenantId,productId:String(f.get('product')),policyVersionId:String(f.get('policyVersion')),audienceKey:String(f.get('audience')),channel:String(f.get('channel')),humanPriority:{state:'monitored',reason:String(f.get('reason'))}});setMessage(r.ok?'Oportunidade monitorada: '+r.opportunityId:r.error);handleRefresh();})}><h3>Monitorar oferta avaliada</h3><label>Produto <input name="product" required/></label><label>Versão da política <input name="policyVersion" required/></label><label>Público <input name="audience" required/></label><label>Canal <select name="channel"><option value="telegram_channel">Telegram</option><option value="whatsapp_channel">WhatsApp assistido</option><option value="instagram_stories">Instagram Stories</option></select></label><label>Motivo <textarea name="reason" required/></label><button disabled={pending}>Monitorar com fatos atuais</button></form><p>Mercado Livre mantém coleta humana pela extensão. Somente fontes autorizadas entram na fila de APIs.</p></details>
      {/* Barra de Filtros */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "1rem 0", padding: "0.75rem", background: "#f8f9fa", borderRadius: "4px" }}>
        <label>
          Canal:{" "}
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
            <option value="all">Todos os canais</option>
            <option value="whatsapp_channel">WhatsApp</option>
            <option value="telegram_channel">Telegram</option>
            <option value="instagram_stories">Instagram Stories</option>
          </select>
        </label>

        <label>
          Estado:{" "}
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">Todos os estados</option>
            <option value="candidate">Candidata</option><option value="monitored">Em monitoramento</option><option value="prioritized">Priorizada</option><option value="held">Retida</option>
            <option value="archived">Arquivada</option>
          </select>
        </label>

        <label>
          Público:{" "}
          <input
            type="text"
            placeholder="Ex: promoções, tecnologia..."
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
          />
        </label>
      </div>

      {/* Listagem de Oportunidades */}
      {filtered.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", background: "#fafafa", borderRadius: "4px" }}>
          <p>Nenhuma oportunidade encontrada no radar com os filtros atuais.</p>
          <small>As oportunidades são alimentadas conforme a curadoria e a política de audiência qualificam ofertas.</small>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Oferta / Produto</th>
              <th style={{ padding: "0.5rem" }}>Canal</th>
              <th style={{ padding: "0.5rem" }}>Público</th>
              <th style={{ padding: "0.5rem" }}>Classe</th>
              <th style={{ padding: "0.5rem" }}>Pontuação</th>
              <th style={{ padding: "0.5rem" }}>Status / Cooldown</th>
              <th style={{ padding: "0.5rem" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opp) => {
              const isExpired = opp.validUntil && new Date(opp.validUntil) < new Date();
              return (
                <tr key={opp.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>
                    <strong>{opp.productTitle}</strong>
                    <br />
                    <small style={{ color: "#666" }}>ID: <code>{opp.productId.slice(0, 10)}...</code></small>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{opp.channel}</td>
                  <td style={{ padding: "0.5rem" }}><code>{opp.audienceKey}</code></td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: "bold",
                      background: opp.class === "gold" ? "#d4edda" : opp.class === "good_buy" ? "#d1ecf1" : "#f8f9fa",
                      color: opp.class === "gold" ? "#155724" : opp.class === "good_buy" ? "#0c5460" : "#383d41",
                    }}>
                      {opp.class}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{opp.reasons?.[0] ?? "—"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <div>
                      <strong>{opp.state}</strong>
                      {opp.validUntil && (
                        <div style={{ color: isExpired ? "#d9534f" : "#666", fontSize: "0.75rem" }}>
                          Válido até {new Date(opp.validUntil).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <a
                        href={`/admin/campanhas?conta=${encodeURIComponent(tenantId)}&productId=${encodeURIComponent(opp.productId)}&opportunityId=${encodeURIComponent(opp.id)}&channel=${encodeURIComponent(opp.channel)}&audienceKey=${encodeURIComponent(opp.audienceKey)}`}
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          background: "#0070f3",
                          color: "#fff",
                          borderRadius: "4px",
                          textDecoration: "none",
                          fontSize: "0.75rem",
                        }}
                      >
                        Preparar no Cockpit →
                      </a>
                      {opp.state === "archived" ? (
                        <button
                          type="button"
                          onClick={() => handleReactivate(opp.id)}
                          disabled={pending}
                          style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                        >
                          Reativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchive(opp.id)}
                          disabled={pending}
                          style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                        >
                          Arquivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
