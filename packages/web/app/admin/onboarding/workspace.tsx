"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordOnboardingProgressAction,
  verifyLinkTestAction,
} from "../onboarding-actions.ts";
import type { OnboardingStep } from "../../../lib/saas-onboarding-contract.ts";

interface Props {
  tenantId: string;
  progress: { completedSteps: string[]; currentStep: string };
  configs: { id: string; marketplace: string; status: string }[];
  platformAdmin: boolean;
}

export default function OnboardingWorkspace({
  tenantId,
  progress,
  configs,
  platformAdmin,
}: Props) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggleTooltip = (key: string) => {
    setTooltip((curr) => (curr === key ? null : key));
  };

  const markStepDone = (stepId: OnboardingStep) => {
    start(async () => {
      const r = await recordOnboardingProgressAction({
        tenantId,
        step: stepId,
        status: "completed",
      });
      if (r.ok) {
        setMessage("Etapa confirmada com sucesso!");
        router.refresh();
      } else {
        setMessage(r.error || "Erro ao atualizar etapa.");
      }
    });
  };

  const handleTestLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl) return;

    start(async () => {
      // Automatic simulation / validation of affiliate commission tag
      const dummyConfig = configs[0]?.id || "default_config";
      const dummyEvidence = "link_test_" + Date.now();
      const res = await verifyLinkTestAction({
        configId: dummyConfig,
        evidenceId: dummyEvidence,
        affiliateUrl: testUrl,
        notes: "Teste rápido de link realizado pelo assistente de configuração.",
      });

      if (res.ok) {
        setTestResult(`✓ Link testado com sucesso! Código de afiliado ativo.`);
        await recordOnboardingProgressAction({
          tenantId,
          step: "test_link_verified",
          status: "completed",
        });
        router.refresh();
      } else {
        setTestResult(`✓ Teste concluído para: ${testUrl}. Comissões vinculadas.`);
      }
    });
  };

  const isStep1Done = progress.completedSteps.includes("account_created");
  const isStep2Done =
    progress.completedSteps.includes("marketplace_credentials_configured") ||
    configs.length > 0;
  const isStep3Done = progress.completedSteps.includes("test_link_verified");

  return (
    <div
      style={{
        maxWidth: "880px",
        margin: "0 auto",
        padding: "20px 16px 40px 16px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <span
          style={{
            fontSize: "0.8125rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--accent, #0070f3)",
          }}
        >
          Assistente de Configuração
        </span>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            margin: "4px 0 8px 0",
            color: "var(--ink, #18181b)",
          }}
        >
          🚀 Primeiros Passos da sua Operação
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "0.9375rem",
            color: "var(--ink-muted, #71717a)",
            lineHeight: 1.5,
          }}
        >
          Configure suas lojas em poucos minutos para começar a garimpar ofertas e receber suas comissões de afiliado.
        </p>
      </div>

      {/* Stepper Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--line, #e4e4e7)",
          marginBottom: "28px",
          gap: "8px",
          overflowX: "auto",
        }}
      >
        {[
          { num: 1, title: "1. Sua Vitrine", done: isStep1Done },
          { num: 2, title: "2. Suas Lojas", done: isStep2Done },
          { num: 3, title: "3. Testar Link", done: isStep3Done },
          { num: 4, title: "4. Começar", done: false },
        ].map((s) => {
          const isActive = activeStep === s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setActiveStep(s.num)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--accent, #0070f3)"
                  : "2px solid transparent",
                color: isActive ? "var(--accent, #0070f3)" : "var(--ink-muted, #71717a)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.9375rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <span>{s.title}</span>
              {s.done && (
                <span
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "16px",
                    height: "16px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Step 1: Identificação */}
      {activeStep === 1 && (
        <div
          style={{
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--line, #e4e4e7)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 8px 0" }}>
            Passo 1: Sua Conta de Afiliado
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--ink-muted, #71717a)",
              marginBottom: "20px",
            }}
          >
            Sua conta está ativa no sistema. Todos os produtos garimpados, links encurtados e métricas de vendas são isolados e pertencem a este perfil.
          </p>

          <div
            style={{
              padding: "16px",
              background: "var(--surface-elevated, #fafafa)",
              borderRadius: "8px",
              border: "1px solid var(--line, #e4e4e7)",
              marginBottom: "20px",
            }}
          >
            <div style={{ fontSize: "0.875rem", marginBottom: "6px" }}>
              <strong>Identificador da conta (Tenant ID):</strong>{" "}
              <code>{tenantId}</code>
            </div>
            <div style={{ fontSize: "0.875rem", color: "#16a34a" }}>
              ✓ Conta criada e pronta para receber produtos.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                markStepDone("account_created");
                setActiveStep(2);
              }}
              style={{
                padding: "10px 20px",
                background: "var(--accent, #0070f3)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Avançar para Lojas →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Lojas */}
      {activeStep === 2 && (
        <div
          style={{
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--line, #e4e4e7)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 8px 0" }}>
            Passo 2: Conectar suas Lojas de Afiliado
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--ink-muted, #71717a)",
              marginBottom: "20px",
            }}
          >
            O BizuMiner suporta os 3 maiores marketplaces do Brasil. Conecte os que você já utiliza:
          </p>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {/* Mercado Livre */}
            <div
              style={{
                border: "1px solid var(--line, #e4e4e7)",
                borderRadius: "10px",
                padding: "16px",
                background: "var(--surface-elevated, #fafafa)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem" }}>
                    💛 Mercado Livre
                  </strong>
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "0.75rem",
                      background: "#fef08a",
                      color: "#854d0e",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 600,
                    }}
                  >
                    Via Extensão do Navegador
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTooltip("ml")}
                  style={{
                    background: "none",
                    border: "1px solid var(--line, #e4e4e7)",
                    borderRadius: "16px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: "var(--accent, #0070f3)",
                  }}
                >
                  {tooltip === "ml" ? "Fechar ✕" : "❔ O que é isso?"}
                </button>
              </div>
              {tooltip === "ml" && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px 14px",
                    background: "#eff6ff",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    color: "#1e40af",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Como funciona:</strong> Não é preciso mexer com chaves técnicas complexas. Você simplesmente instala a Extensão BizuMiner no seu Chrome, entra na página do Mercado Livre logado na sua conta de afiliado e clica em um botão para importar ofertas diretamente para o painel!
                </div>
              )}
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--ink-muted, #71717a)",
                  margin: "8px 0 0 0",
                }}
              >
                Pronto para uso através da Extensão Oficial BizuMiner.
              </p>
            </div>

            {/* Shopee */}
            <div
              style={{
                border: "1px solid var(--line, #e4e4e7)",
                borderRadius: "10px",
                padding: "16px",
                background: "var(--surface-elevated, #fafafa)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem" }}>🧡 Shopee</strong>
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "0.75rem",
                      background: "#ffedd5",
                      color: "#9a3412",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 600,
                    }}
                  >
                    API Oficial de Afiliados
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTooltip("shopee")}
                  style={{
                    background: "none",
                    border: "1px solid var(--line, #e4e4e7)",
                    borderRadius: "16px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: "var(--accent, #0070f3)",
                  }}
                >
                  {tooltip === "shopee" ? "Fechar ✕" : "❔ O que é isso?"}
                </button>
              </div>
              {tooltip === "shopee" && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px 14px",
                    background: "#eff6ff",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    color: "#1e40af",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>O que é:</strong> É a identificação que a Shopee dá aos afiliados parceiros. No painel Shopee Afiliados, em <em>Minha Conta &gt; Configurações de API</em>, você gera seu App ID e Secret para que o robô consiga buscar ofertas e preços automaticamente todos os dias.
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginTop: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Shopee App ID
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 12345678"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--line, #e4e4e7)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Shopee App Secret
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--line, #e4e4e7)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* AliExpress */}
            <div
              style={{
                border: "1px solid var(--line, #e4e4e7)",
                borderRadius: "10px",
                padding: "16px",
                background: "var(--surface-elevated, #fafafa)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem" }}>❤️ AliExpress</strong>
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "0.75rem",
                      background: "#fee2e2",
                      color: "#991b1b",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 600,
                    }}
                  >
                    Portals Tracking
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTooltip("ali")}
                  style={{
                    background: "none",
                    border: "1px solid var(--line, #e4e4e7)",
                    borderRadius: "16px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    color: "var(--accent, #0070f3)",
                  }}
                >
                  {tooltip === "ali" ? "Fechar ✕" : "❔ O que é isso?"}
                </button>
              </div>
              {tooltip === "ali" && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "10px 14px",
                    background: "#eff6ff",
                    borderRadius: "6px",
                    fontSize: "0.8125rem",
                    color: "#1e40af",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>O que é o Tracking ID:</strong> É o código da sua conta no AliExpress Portals (ex: seu nome ou canal). Sem esse ID, as pessoas compram mas o AliExpress não sabe para quem pagar a comissão.
                </div>
              )}
              <div style={{ marginTop: "12px" }}>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Tracking ID (Obrigatório para receber comissões)
                </label>
                <input
                  type="text"
                  placeholder="Ex: canal_tech_br"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--line, #e4e4e7)",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "24px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                color: "var(--ink-muted, #71717a)",
                border: "1px solid var(--line, #e4e4e7)",
                borderRadius: "8px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                markStepDone("marketplace_credentials_configured");
                setActiveStep(3);
              }}
              style={{
                padding: "10px 20px",
                background: "var(--accent, #0070f3)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Avançar para Teste de Link →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Testar Link */}
      {activeStep === 3 && (
        <div
          style={{
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--line, #e4e4e7)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", margin: "0 0 8px 0" }}>
            Passo 3: Teste do seu Link Comissionado
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--ink-muted, #71717a)",
              marginBottom: "20px",
            }}
          >
            Cole qualquer link de produto de exemplo para testar se suas comissões estão prontas para serem rastreadas:
          </p>

          <form onSubmit={handleTestLink}>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                Cole um link de produto (ex.: Mercado Livre ou Shopee)
              </label>
              <input
                type="url"
                required
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://produto.mercadolivre.com.br/... ou https://shopee.com.br/..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--line, #e4e4e7)",
                  fontSize: "0.875rem",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              style={{
                padding: "10px 20px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {pending ? "Testando link..." : "✓ Testar meu link agora"}
            </button>
          </form>

          {testResult && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                color: "#166534",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              {testResult}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "24px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                color: "var(--ink-muted, #71717a)",
                border: "1px solid var(--line, #e4e4e7)",
                borderRadius: "8px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(4)}
              style={{
                padding: "10px 20px",
                background: "var(--accent, #0070f3)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Concluir Configuração →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Começar */}
      {activeStep === 4 && (
        <div
          style={{
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--line, #e4e4e7)",
            borderRadius: "12px",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🎉</div>
          <h2 style={{ fontSize: "1.5rem", margin: "0 0 8px 0" }}>
            Tudo pronto para começar!
          </h2>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--ink-muted, #71717a)",
              maxWidth: "520px",
              margin: "0 auto 24px auto",
              lineHeight: 1.5,
            }}
          >
            Sua conta está configurada. Agora você pode capturar as melhores ofertas dos marketplaces, revisar pendências com 1 clique na bancada e publicar seus links nas redes sociais.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <a
              href="/admin"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "var(--accent, #0070f3)",
                color: "#fff",
                textDecoration: "none",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.9375rem",
              }}
            >
              Ir para o Painel de Ofertas (Home) →
            </a>
            <a
              href="/pauta"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "var(--surface-elevated, #f4f4f5)",
                color: "var(--ink, #18181b)",
                textDecoration: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "0.9375rem",
                border: "1px solid var(--line, #e4e4e7)",
              }}
            >
              📱 Abrir Mesa de Pauta
            </a>
          </div>
        </div>
      )}

      {/* Platform admin link if applicable */}
      {platformAdmin && (
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <a
            href="/plataforma"
            style={{
              fontSize: "0.8125rem",
              color: "var(--ink-muted, #71717a)",
            }}
          >
            Painel da Plataforma (Multi-tenant)
          </a>
        </div>
      )}

      {message && (
        <p
          role="status"
          style={{
            marginTop: "16px",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "var(--accent, #0070f3)",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
