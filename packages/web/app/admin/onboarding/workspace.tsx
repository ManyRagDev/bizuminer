"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordOnboardingProgressAction,
  verifyLinkTestAction,
} from "../onboarding-actions.ts";
const steps = [
  ["account_created", "Conta criada", "/admin?aba=afiliados"],
  [
    "marketplace_credentials_configured",
    "Configuração própria de marketplace",
    "/admin?aba=afiliados",
  ],
  ["test_link_verified", "Teste de link documentado", "#teste-link"],
  [
    "audience_policy_configured",
    "Política do seu público",
    "/admin/curadoria?aba=radar",
  ],
  ["first_campaign_created", "Primeira campanha", "/admin/campanhas"],
  ["first_kit_approved", "Primeiro material aprovado", "/admin/campanhas"],
  [
    "first_publication_confirmed",
    "Primeira publicação confirmada",
    "/admin/campanhas",
  ],
] as const;
export default function OnboardingWorkspace({
  tenantId,
  progress,
  configs,
  platformAdmin,
}: {
  tenantId: string;
  progress: { completedSteps: string[]; currentStep: string };
  configs: { id: string; marketplace: string; status: string }[];
  platformAdmin: boolean;
}) {
  const [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  return (
    <section>
      <h1>Primeiros passos da sua conta</h1>
      <p>
        Dados, credenciais e resultados pertencem à conta selecionada. Uma
        configuração salva não comprova atribuição de venda pelo marketplace.
      </p>
      <ol>
        {steps.map(([id, label, href]) => (
          <li key={id}>
            <a href={href}>{label}</a> ·{" "}
            {progress.completedSteps.includes(id)
              ? "Concluída com fatos"
              : "Pendente"}{" "}
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await recordOnboardingProgressAction({
                    tenantId,
                    step: id,
                    status: "completed",
                  });
                  setMessage(r.ok ? "Evidência confirmada." : r.error);
                  router.refresh();
                })
              }
            >
              Verificar etapa
            </button>
          </li>
        ))}
      </ol>
      <form
        id="teste-link"
        action={(f) =>
          start(async () => {
            const r = await verifyLinkTestAction({
              configId: String(f.get("config")),
              evidenceId: String(f.get("evidence")),
              affiliateUrl: String(f.get("url")),
              notes: String(f.get("notes")),
            });
            setMessage(
              r.ok
                ? "Teste humano documentado e vinculado à configuração."
                : (r.error ?? "Falha"),
            );
            router.refresh();
          })
        }
      >
        <h2>Comprovar teste do link</h2>
        <label>
          Configuração{" "}
          <select name="config">
            {configs.map((c) => (
              <option value={c.id} key={c.id}>
                {c.marketplace} · {c.status}
              </option>
            ))}
          </select>
        </label>
        <p>
          Use a evidência privada do teste no portal, enviada abaixo. Ela é
          necessária para registrar o resultado.
        </p>
        <label>
          Arquivo de evidência{" "}
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const f = new FormData();
              f.set("file", file);
              f.set("tenantId", tenantId);
              f.set("kind", "account_evidence");
              const response = await fetch("/api/admin/artifacts/upload", {
                method: "POST",
                body: f,
              });
              const r = await response.json();
              setMessage(
                response.ok ? "Evidência enviada. ID: " + r.id : r.error,
              );
            }}
          />
        </label>
        <label>
          ID da evidência privada <input name="evidence" required />
        </label>
        <label>
          Link de afiliado testado <input name="url" type="url" required />
        </label>
        <label>
          Resultado observado e referência <textarea name="notes" required />
        </label>
        <button disabled={pending}>Registrar teste humano</button>
      </form>
      {platformAdmin && (
        <a href="/plataforma">Administrar contas da plataforma</a>
      )}
      <p role="status" style={{ overflowWrap: "anywhere" }}>
        {message}
      </p>
    </section>
  );
}
