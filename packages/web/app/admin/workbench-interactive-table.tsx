"use client";

import { useState, useTransition } from "react";
import type { WorkbenchItem, WorkbenchPage } from "../../lib/workbench-contract.ts";
import { submitCurationDecision } from "./curadoria/actions.ts";

interface Props {
  initialPage: WorkbenchPage;
}

export default function WorkbenchInteractiveTable({ initialPage }: Props) {
  const [items, setItems] = useState<WorkbenchItem[]>([...initialPage.items]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const handleDecision = (
    productId: string,
    decision: "approve" | "hold" | "reject",
  ) => {
    setResolvingId(productId);
    setErrorMap((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });

    startTransition(async () => {
      try {
        const reasonCode =
          decision === "reject"
            ? "low_utility"
            : decision === "hold"
              ? "insufficient_evidence"
              : undefined;

        const res = await submitCurationDecision({
          productId,
          decision,
          reasonCode,
        });

        if (res.ok) {
          // Remove the resolved item from local list
          setItems((prev) => prev.filter((it) => it.productId !== productId));
        } else {
          setErrorMap((prev) => ({
            ...prev,
            [productId]: res.error || "Erro ao registrar decisão",
          }));
        }
      } catch (err: any) {
        setErrorMap((prev) => ({
          ...prev,
          [productId]: err?.message || "Falha na comunicação",
        }));
      } finally {
        setResolvingId(null);
      }
    });
  };

  const pendingCount = items.length;

  return (
    <section
      id="bancada-hoje"
      className="workbench-container"
      style={{
        marginTop: "1.5rem",
        borderTop: "1px solid var(--line, #e4e4e7)",
        paddingTop: "1.25rem",
      }}
      aria-labelledby="workbench-title"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2
            id="workbench-title"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>🎯 Bancada de Trabalho Unificada</span>
            <span
              style={{
                fontSize: "0.8125rem",
                background: pendingCount > 0 ? "var(--accent, #0070f3)" : "#16a34a",
                color: "#fff",
                padding: "2px 10px",
                borderRadius: "12px",
                fontWeight: 600,
              }}
            >
              {pendingCount === 0
                ? "Tudo em dia!"
                : `${pendingCount} ${pendingCount === 1 ? "produto pendente" : "produtos pendentes"}`}
            </span>
          </h2>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "0.875rem",
              color: "var(--ink-muted, #71717a)",
            }}
          >
            Decida com 1 clique diretamente na linha. A ação recomendada pelo sistema vem destacada, mas você tem o controle total.
          </p>
        </div>
      </div>

      {pendingCount === 0 ? (
        <div
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            background: "var(--surface-elevated, #fafafa)",
            border: "1px dashed var(--line, #e4e4e7)",
            borderRadius: "10px",
            color: "var(--ink-muted, #71717a)",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🎉</div>
          <strong style={{ fontSize: "1.125rem", color: "var(--ink, #18181b)" }}>
            Bancada limpa! Todas as pendências de hoje foram resolvidas.
          </strong>
          <p style={{ margin: "6px 0 0 0", fontSize: "0.875rem" }}>
            Você pode capturar mais ofertas ou preparar a pauta para publicação no Instagram e Telegram.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid var(--line, #e4e4e7)",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "10px 12px" }}>Produto</th>
                <th style={{ padding: "10px 12px" }}>Loja</th>
                <th style={{ padding: "10px 12px" }}>Preço</th>
                <th style={{ padding: "10px 12px" }}>Diagnóstico IA</th>
                <th style={{ padding: "10px 12px", textAlign: "right", minWidth: "290px" }}>
                  Ações Diretas
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isResolving = resolvingId === item.productId || isPending;
                const suggested = item.primaryAction.suggestedDecision ?? "approved";
                const isKitDraft = item.primaryAction.actionType === "create_kit_draft";

                return (
                  <tr
                    key={item.productId}
                    style={{
                      borderBottom: "1px solid var(--line, #e4e4e7)",
                      opacity: resolvingId === item.productId ? 0.6 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <td style={{ padding: "12px", maxWidth: "260px" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={item.title}
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--ink-muted, #71717a)", marginTop: "2px" }}>
                        ID: {item.externalId}
                      </div>
                      {errorMap[item.productId] && (
                        <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "2px" }}>
                          ⚠️ {errorMap[item.productId]}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", textTransform: "capitalize" }}>
                      {item.marketplace}
                    </td>
                    <td style={{ padding: "12px", fontWeight: 600 }}>
                      {(item.currentPriceCents / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div
                        style={{
                          display: "inline-block",
                          background: "var(--surface-elevated, #f4f4f5)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: 500,
                          fontSize: "0.8125rem",
                        }}
                      >
                        {item.primaryAction.label}
                      </div>
                      {item.primaryAction.reason && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--ink-muted, #71717a)",
                            marginTop: "2px",
                          }}
                        >
                          {item.primaryAction.reason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {isKitDraft ? (
                        <a
                          href={item.primaryAction.href}
                          style={{
                            display: "inline-block",
                            padding: "6px 14px",
                            background: "#0070f3",
                            color: "#fff",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                          }}
                        >
                          Gerar Kit →
                        </a>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            gap: "6px",
                            justifyContent: "flex-end",
                            alignItems: "center",
                          }}
                        >
                          {/* Botão 1: APROVAR */}
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => handleDecision(item.productId, "approve")}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              cursor: isResolving ? "not-allowed" : "pointer",
                              fontSize: "0.8125rem",
                              fontWeight: suggested === "approved" ? 700 : 500,
                              background:
                                suggested === "approved"
                                  ? "#16a34a"
                                  : "var(--surface-elevated, #f4f4f5)",
                              color: suggested === "approved" ? "#ffffff" : "#16a34a",
                              border:
                                suggested === "approved"
                                  ? "1px solid #16a34a"
                                  : "1px solid #bbf7d0",
                              boxShadow:
                                suggested === "approved"
                                  ? "0 1px 2px rgba(22, 163, 74, 0.2)"
                                  : "none",
                            }}
                            title="Aprovar e enviar para o catálogo da vitrine"
                          >
                            {suggested === "approved" ? "★ Aprovar" : "✓ Aprovar"}
                          </button>

                          {/* Botão 2: RETER */}
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => handleDecision(item.productId, "hold")}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              cursor: isResolving ? "not-allowed" : "pointer",
                              fontSize: "0.8125rem",
                              fontWeight: suggested === "held" ? 700 : 500,
                              background:
                                suggested === "held"
                                  ? "#d97706"
                                  : "var(--surface-elevated, #f4f4f5)",
                              color: suggested === "held" ? "#ffffff" : "#d97706",
                              border:
                                suggested === "held"
                                  ? "1px solid #d97706"
                                  : "1px solid #fed7aa",
                              boxShadow:
                                suggested === "held"
                                  ? "0 1px 2px rgba(217, 119, 6, 0.2)"
                                  : "none",
                            }}
                            title="Manter em quarentena para verificar preço/variação"
                          >
                            {suggested === "held" ? "★ Reter" : "⏸ Reter"}
                          </button>

                          {/* Botão 3: DESCARTAR */}
                          <button
                            type="button"
                            disabled={isResolving}
                            onClick={() => handleDecision(item.productId, "reject")}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              cursor: isResolving ? "not-allowed" : "pointer",
                              fontSize: "0.8125rem",
                              fontWeight: 500,
                              background: "transparent",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                            }}
                            title="Rejeitar produto da triagem"
                          >
                            ✕ Descartar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
