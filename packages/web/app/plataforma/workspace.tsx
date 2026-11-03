"use client";
import { useState } from "react";
import { provisionPilotAction } from "../admin/onboarding-actions.ts";
import { submitSaaSRevenueEntry } from "../admin/financeiro/actions.ts";
import {
  calculateSaaSRevenueSummary,
  type SaaSRevenueEntry,
} from "../../lib/commercial-financial-contract.ts";
export default function Platform({
  canManageRevenue,
  revenues,
}: {
  canManageRevenue: boolean;
  revenues: any[];
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [invitation, setInvitation] = useState("");
  const entries: SaaSRevenueEntry[] = revenues.map((e) => ({
    id: e.id,
    tenantId: "local",
    obligationKey: e.obligation_key,
    eventKey: e.event_key,
    contractRef: e.contract_ref,
    amountCents: Number(e.amount_cents),
    currency: e.currency,
    state: e.state,
    occurredAt: e.occurred_at,
    sourceRef: e.source_ref,
    predecessorId: e.predecessor_id,
    createdAt: e.created_at,
  }));
  const money = (v: number) =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(v / 100),
    summary = calculateSaaSRevenueSummary(entries, "BRL");
  return (
    <>
      <section className="bm-card">
        <h2>Provisionar conta piloto por convite</h2>
        <p>
          Use os termos já aprovados para o piloto. O convite será gerado para
          envio manual.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const tenant = String(d.get("tenant"));
              const result = await provisionPilotAction({
                targetTenantId: tenant,
                targetAffiliateId: "aff_" + tenant,
                publicSlug: tenant,
                displayName: String(d.get("name")),
                planVersion: String(d.get("plan")),
                endsAt: new Date(String(d.get("ends"))).toISOString(),
                termsRef: String(d.get("terms")),
                ownerEmail: String(d.get("email")),
                invitationExpiresAt: new Date(
                  Date.now() + 48 * 3600000,
                ).toISOString(),
                limits: {
                  maxActiveCampaigns: Number(d.get("campaigns")),
                  maxDailyKits: Number(d.get("kits")),
                  allowedMarketplaces: ["mercadolivre", "shopee", "aliexpress"],
                },
              });
              if (!result.ok || !result.invitation)
                throw new Error(
                  "Não foi possível provisionar. Confira os termos, limites e a identificação da conta.",
                );
              setInvitation(result.invitation.rawToken);
              setNotice(
                "Conta provisionada. O convite ainda precisa ser enviado por você.",
              );
            } catch (e) {
              setNotice(
                e instanceof Error ? e.message : "Não foi possível concluir.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="bm-grid">
              <label>
                Identificação da conta
                <input name="tenant" pattern="[a-z0-9._-]{1,64}" required />
              </label>
              <label>
                Nome da conta
                <input name="name" required maxLength={200} />
              </label>
              <label>
                E-mail do responsável
                <input name="email" type="email" required />
              </label>
              <label>
                Versão do plano piloto
                <input name="plan" required />
              </label>
              <label>
                Referência dos termos aprovados
                <input name="terms" required />
              </label>
              <label>
                Fim do piloto
                <input name="ends" type="datetime-local" required />
              </label>
              <label>
                Máximo de campanhas ativas
                <input name="campaigns" type="number" min="0" required />
              </label>
              <label>
                Máximo de materiais por dia
                <input name="kits" type="number" min="0" required />
              </label>
            </div>
            <button type="submit" className="bm-button">
              Provisionar piloto e gerar convite
            </button>
          </fieldset>
        </form>
        {invitation && (
          <label>
            Token do convite (validade: 48 horas)
            <textarea readOnly value={invitation} />
          </label>
        )}
      </section>
      {canManageRevenue && (
        <section className="bm-card bm-help">
          <h2>Receita SaaS da plataforma</h2>
          <p>
            Faturado líquido: {money(summary.billedNetCents)} · Recebido:{" "}
            {money(summary.receivedCashCents)}
          </p>
          <p>Este extrato é separado das comissões dos afiliados.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setBusy(true);
              try {
                const result = await submitSaaSRevenueEntry({
                  tenantId: "local",
                  obligationKey: String(d.get("obligation")),
                  eventKey: crypto.randomUUID(),
                  contractRef: String(d.get("contract")),
                  amountCents: Math.round(Number(d.get("amount")) * 100),
                  currency: "BRL",
                  state: d.get("state") as "billed" | "received",
                  occurredAt: new Date(String(d.get("date"))).toISOString(),
                  sourceRef: String(d.get("source")),
                });
                setNotice(
                  result.ok
                    ? "Lançamento registrado. Atualize a página para ver o extrato."
                    : "Não foi possível registrar o lançamento.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Obrigação de pagamento
                <input name="obligation" required />
              </label>
              <label>
                Contrato
                <input name="contract" required />
              </label>
              <label>
                Valor (R$)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Situação
                <select name="state">
                  <option value="billed">Faturada</option>
                  <option value="received">Recebida</option>
                </select>
              </label>
              <label>
                Data do evento
                <input name="date" type="datetime-local" required />
              </label>
              <label>
                Documento de origem
                <input name="source" required />
              </label>
              <button className="bm-button secondary" type="submit">
                Registrar receita
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {notice && (
        <p role="status" className="bm-notice">
          {notice}
        </p>
      )}
    </>
  );
}
