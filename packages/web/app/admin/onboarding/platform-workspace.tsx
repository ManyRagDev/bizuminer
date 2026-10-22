"use client";
import { useState, useTransition } from "react";
import {
  provisionPilotAction,
  suspendAccountAction,
  reactivateAccountAction,
} from "../onboarding-actions.ts";
export default function PlatformWorkspace() {
  const [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  return (
    <section>
      <h1>Administração da plataforma</h1>{" "}
      <form
        action={(f) =>
          start(async () => {
            try {
              const r = await provisionPilotAction({
                targetTenantId: String(f.get("tenant")),
                targetAffiliateId: String(f.get("affiliate")),
                publicSlug: String(f.get("slug")),
                displayName: String(f.get("name")),
                planVersion: String(f.get("plan")),
                endsAt: new Date(String(f.get("pilotEnds"))).toISOString(),
                termsRef: String(f.get("terms")),
                limits: {
                  maxActiveCampaigns: Number(f.get("campaigns")),
                  maxDailyKits: Number(f.get("kits")),
                  allowedMarketplaces: String(f.get("marketplaces"))
                    .split(",")
                    .map((x) => x.trim()),
                },
                ownerEmail: String(f.get("email")),
                invitationExpiresAt: new Date(
                  String(f.get("expires")),
                ).toISOString(),
              });
              setMessage(
                r.ok
                  ? "Conta provisionada. Código privado (não enviado): " +
                      r.invitation?.rawToken
                  : (r.error ?? "Falha"),
              );
            } catch (e) {
              setMessage(String(e));
            }
          })
        }
      >
        <h2>Provisionar piloto aprovado</h2>
        <p>
          Administração da plataforma. Informe termos e quotas ratificados;
          nenhum convite será enviado automaticamente.
        </p>
        {[
          ["tenant", "Conta"],
          ["affiliate", "Identificador de afiliado"],
          ["slug", "Slug público"],
          ["name", "Nome"],
          ["plan", "Versão do plano aprovado"],
          ["terms", "Referência dos termos aprovados"],
          ["marketplaces", "Marketplaces aprovados, separados por vírgula"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} required />
          </label>
        ))}
        <label>
          Limite de campanhas{" "}
          <input name="campaigns" type="number" min="1" required />
        </label>
        <label>
          Kits por dia <input name="kits" type="number" min="1" required />
        </label>
        <label>
          E-mail do responsável <input name="email" type="email" required />
        </label>
        <label>
          Validade do convite{" "}
          <input name="expires" type="datetime-local" required />
        </label>
        <label>
          Fim do piloto aprovado{" "}
          <input name="pilotEnds" type="datetime-local" required />
        </label>
        <button disabled={pending}>Provisionar com termos informados</button>
      </form>
      <form
        action={(f) =>
          start(async () => {
            const input = {
              targetTenantId: String(f.get("tenant")),
              reason: String(f.get("reason")),
            };
            const r =
              String(f.get("operation")) === "suspend"
                ? await suspendAccountAction(input)
                : await reactivateAccountAction(input);
            setMessage(r.ok ? "Estado da conta atualizado." : r.error);
          })
        }
      >
        <h2>Estado da conta</h2>
        <label>
          Conta <input name="tenant" required />
        </label>
        <label>
          Operação{" "}
          <select name="operation">
            <option value="suspend">Suspender preservando dados</option>
            <option value="reactivate">Reativar</option>
          </select>
        </label>
        <label>
          Motivo <textarea name="reason" required />
        </label>
        <button disabled={pending}>Registrar mudança</button>
      </form>
      <p role="status" style={{ overflowWrap: "anywhere" }}>
        {message}
      </p>
    </section>
  );
}
