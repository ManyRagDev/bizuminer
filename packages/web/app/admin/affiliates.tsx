"use client";

import { useState, useTransition } from "react";
import {
  createAccountInvitationAction,
  getAccountOnboardingStatusAction,
  exportAccountDataAction,
  suspendAccountAction,
  reactivateAccountAction,
} from "./onboarding-actions.ts";

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"operator" | "owner">("operator");
  const [invitationResult, setInvitationResult] = useState<{ rawToken: string; expiresAt: string } | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [targetTenantToSuspend, setTargetTenantToSuspend] = useState("");
  const [pending, startTransition] = useTransition();
  const configurableAccount = accounts[0] ?? null;

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
          affiliateId: configurableAccount?.id,
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
    <>
      <nav className="section-local-nav" aria-label="Configurações">
        <a href="/admin/curadoria?aba=bussola">Critérios e automação</a>
        <a className="active" href="/admin?aba=afiliados">Contas de afiliados</a>
      </nav>
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
        <h3>Credencial do Mercado Livre{configurableAccount ? ` · ${configurableAccount.displayName}` : ""}</h3>
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
        <button type="submit" disabled={busy || !configurableAccount}>{busy ? "salvando…" : "salvar configuração"}</button>
      </form>

      {message && <p className="admin-message" role="status">{message}</p>}

      {/* Seção 1: Convite Seguro de Membros (EP-12 / C-01) */}
      <div style={{ marginTop: "2rem", padding: "1rem", background: "#fcfcfc", border: "1px solid #e0e0e0", borderRadius: "6px" }}>
        <h3>Convite Seguro de Membros da Conta</h3>
        <p style={{ fontSize: "0.875rem", color: "#666" }}>
          Emita convites criptográficos com expiração e token de uso único (SHA-256). Apenas o papel owner pode convidar.
        </p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!inviteEmail.trim() || !configurableAccount) return;
          startTransition(async () => {
            const res = await createAccountInvitationAction({
              tenantId: configurableAccount.tenantId,
              invitedEmail: inviteEmail.trim(),
              role: inviteRole,
              expiresInHours: 72,
            });
            if (res.ok) {
              setInvitationResult({ rawToken: res.rawToken, expiresAt: res.expiresAt });
              setMessage(`Convite gerado para ${inviteEmail}.`);
              setInviteEmail("");
            } else {
              setMessage(`Erro ao emitir convite: ${res.error}`);
            }
          });
        }} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Email do Convidado:{" "}
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="operador@exemplo.com"
              required
            />
          </label>
          <label>
            Papel:{" "}
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
              <option value="operator">Operador (Acesso restrito à operação)</option>
              <option value="owner">Owner (Administração total da conta)</option>
            </select>
          </label>
          <button type="submit" disabled={pending || !configurableAccount}>
            Gerar Convite Seguro
          </button>
        </form>

        {invitationResult && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#e8f4fd", borderRadius: "4px", fontSize: "0.875rem" }}>
            <strong>Token de Convite Gerado (Uso Único):</strong>
            <pre style={{ margin: "0.5rem 0", background: "#fff", padding: "0.5rem", border: "1px solid #bce8f1" }}>
              {invitationResult.rawToken}
            </pre>
            <small>Expira em: {new Date(invitationResult.expiresAt).toLocaleString("pt-BR")}. Envie este token com segurança ao convidado.</small>
          </div>
        )}
      </div>

      {/* Seção 2: Onboarding Baseado em Evidências (EP-12 / CF-16) */}
      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fcfcfc", border: "1px solid #e0e0e0", borderRadius: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ margin: 0 }}>Progresso do Onboarding Baseado em Evidências</h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "#666" }}>
              Verificação contínua dos marcos operacionais da conta sem auto-declaração fraudulenta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!configurableAccount) return;
              startTransition(async () => {
                const res = await getAccountOnboardingStatusAction(configurableAccount.tenantId);
                if (res.ok) {
                  setOnboardingStatus(res.progress);
                  setMessage("Status do onboarding atualizado.");
                } else {
                  setMessage(`Erro ao consultar onboarding: ${res.error}`);
                }
              });
            }}
            disabled={pending || !configurableAccount}
          >
            Consultar Status
          </button>
        </div>

        {onboardingStatus && (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontWeight: "bold" }}>
              Concluídos: {onboardingStatus.completedSteps?.length ?? 0} passos · Próxima etapa: <code>{onboardingStatus.currentStep}</code>
            </p>
            <ul style={{ listStyle: "none", padding: 0, fontSize: "0.875rem" }}>
              {onboardingStatus.allSteps?.map((item: any) => (
                <li key={item.step} style={{ padding: "0.25rem 0", borderBottom: "1px solid #eee" }}>
                  <span style={{ marginRight: "0.5rem" }}>{item.status === "completed" ? "✓" : "○"}</span>
                  <strong>{item.step}</strong>: {item.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Seção 3: Exportação Protegida de Dados (G-PRIVACY / LGPD) */}
      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fcfcfc", border: "1px solid #e0e0e0", borderRadius: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ margin: 0 }}>Exportação Protegida de Dados da Conta (LGPD / GDPR)</h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "#666" }}>
              Download integral de todos os fatos, cadastros e lançamentos isolados do tenant.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!configurableAccount) return;
              startTransition(async () => {
                const res = await exportAccountDataAction(configurableAccount.tenantId);
                if (res.ok) {
                  const blob = new Blob([res.exportJson], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `export-${configurableAccount.tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setMessage("Dados da conta exportados com sucesso.");
                } else {
                  setMessage(`Erro na exportação: ${res.error}`);
                }
              });
            }}
            disabled={pending || !configurableAccount}
          >
            Exportar Dados (JSON)
          </button>
        </div>
      </div>

      {/* Seção 4: Suspensão Administrativa de Conta (CF-15) */}
      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: "6px" }}>
        <h3>Controle Administrativo de Suspensão (Platform Admin)</h3>
        <p style={{ fontSize: "0.875rem", color: "#742a2a" }}>
          Suspender ou reativar contas revoga imediatamente todas as operações e acessos RLS da conta (CF-15).
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Tenant ID:{" "}
            <input
              type="text"
              placeholder="ex: aff_..."
              value={targetTenantToSuspend}
              onChange={(e) => setTargetTenantToSuspend(e.target.value)}
            />
          </label>
          <label>
            Motivo:{" "}
            <input
              type="text"
              placeholder="Razão auditável"
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!targetTenantToSuspend.trim() || !suspensionReason.trim()) return;
              startTransition(async () => {
                const res = await suspendAccountAction({
                  targetTenantId: targetTenantToSuspend.trim(),
                  reason: suspensionReason.trim(),
                });
                if (res.ok) {
                  setMessage(`Conta ${targetTenantToSuspend} suspensa.`);
                  await refresh();
                } else {
                  setMessage(`Erro ao suspender: ${res.error}`);
                }
              });
            }}
            disabled={pending || !targetTenantToSuspend.trim() || !suspensionReason.trim()}
            style={{ background: "#e53e3e", color: "#fff" }}
          >
            Suspender Conta
          </button>
          <button
            type="button"
            onClick={() => {
              if (!targetTenantToSuspend.trim() || !suspensionReason.trim()) return;
              startTransition(async () => {
                const res = await reactivateAccountAction({
                  targetTenantId: targetTenantToSuspend.trim(),
                  reason: suspensionReason.trim(),
                });
                if (res.ok) {
                  setMessage(`Conta ${targetTenantToSuspend} reativada.`);
                  await refresh();
                } else {
                  setMessage(`Erro ao reativar: ${res.error}`);
                }
              });
            }}
            disabled={pending || !targetTenantToSuspend.trim() || !suspensionReason.trim()}
          >
            Reativar Conta
          </button>
        </div>
      </div>

      <p className="admin-footnote" style={{ marginTop: "1.5rem" }}>
        Os valores de tracking/tool são gravados no servidor e nunca devolvidos a esta tela. A comissão por afiliado
        só entra no clique na entrega E3 — até lá o link continua usando a configuração global.
      </p>
      </section>
    </>
  );
}
