"use client";

import Image from "next/image";
import { useState, useTransition, useMemo } from "react";
import type { WorkbenchItem, WorkbenchPage } from "../../lib/workbench-contract.ts";
import { submitCurationDecision } from "./curadoria/actions.ts";

interface Props {
  initialPage: WorkbenchPage;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function ProductThumbnail({ imageUrl }: { imageUrl: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);

  return (
    <div
      style={{
        width: "72px",
        height: "72px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        border: "1px solid var(--line, #e4e4e7)",
        borderRadius: "8px",
        background: "var(--photo-bg, #fff)",
      }}
    >
      {imageUrl && imageUrl !== failedImage ? (
        <Image
          src={imageUrl}
          alt=""
          width={72}
          height={72}
          unoptimized
          loading="lazy"
          onError={() => setFailedImage(imageUrl)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <span style={{ color: "#71717a", fontSize: "0.6875rem", textAlign: "center" }}>
          Sem foto
        </span>
      )}
    </div>
  );
}

export default function WorkbenchInteractiveTable({ initialPage }: Props) {
  const [items, setItems] = useState<WorkbenchItem[]>([...initialPage.items]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedMarketplace !== "all" && item.marketplace !== selectedMarketplace) return false;
      if (selectedCategory !== "all" && (item.category ?? "Sem categoria") !== selectedCategory) return false;
      return true;
    });
  }, [items, selectedMarketplace, selectedCategory]);

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
          setItems((prev) => prev.filter((it) => it.productId !== productId));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(productId);
            return next;
          });
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

  const handleBulkDecision = (decision: "approve" | "hold" | "reject") => {
    if (selectedIds.size === 0) return;
    const targetIds = Array.from(selectedIds);
    setResolvingId("bulk");

    startTransition(async () => {
      try {
        const reasonCode =
          decision === "reject"
            ? "low_utility"
            : decision === "hold"
              ? "insufficient_evidence"
              : undefined;

        const successIds: string[] = [];
        for (const productId of targetIds) {
          const res = await submitCurationDecision({
            productId,
            decision,
            reasonCode,
          });
          if (res.ok) successIds.push(productId);
        }

        const successSet = new Set(successIds);
        setItems((prev) => prev.filter((it) => !successSet.has(it.productId)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of successIds) next.delete(id);
          return next;
        });
      } finally {
        setResolvingId(null);
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.productId)));
    }
  };

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
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
            Decida com 1 clique diretamente na linha ou selecione vários para aprovar/descartar em lote.
          </p>
        </div>

        {/* Filtros da bancada */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedMarketplace}
            onChange={(e) => setSelectedMarketplace(e.target.value)}
            style={{ fontSize: "0.8125rem", padding: "4px 8px", borderRadius: "6px" }}
          >
            <option value="all">Todas as lojas</option>
            <option value="shopee">Shopee</option>
            <option value="aliexpress">AliExpress</option>
            <option value="mercadolivre">Mercado Livre</option>
          </select>

          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ fontSize: "0.8125rem", padding: "4px 8px", borderRadius: "6px" }}
            >
              <option value="all">Todos os departamentos</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Barra de Ações em Lote */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-elevated, #f4f4f5)",
            padding: "8px 12px",
            borderRadius: "8px",
            marginBottom: "12px",
            border: "1px solid var(--line, #e4e4e7)",
          }}
        >
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            {selectedIds.size} {selectedIds.size === 1 ? "item selecionado" : "itens selecionados"}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={resolvingId === "bulk" || isPending}
              onClick={() => handleBulkDecision("approve")}
              style={{
                padding: "4px 12px",
                background: "#16a34a",
                color: "#fff",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.8125rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✓ Aprovar selecionados ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={resolvingId === "bulk" || isPending}
              onClick={() => handleBulkDecision("hold")}
              style={{
                padding: "4px 12px",
                background: "#d97706",
                color: "#fff",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.8125rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              ⏸ Reter selecionados ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={resolvingId === "bulk" || isPending}
              onClick={() => handleBulkDecision("reject")}
              style={{
                padding: "4px 12px",
                background: "#dc2626",
                color: "#fff",
                borderRadius: "6px",
                fontWeight: 600,
                fontSize: "0.8125rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              ✕ Descartar selecionados ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

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
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: "1.5rem",
            textAlign: "center",
            background: "var(--surface-elevated, #fafafa)",
            borderRadius: "8px",
            color: "var(--ink-muted, #71717a)",
          }}
        >
          Nenhum produto corresponde aos filtros selecionados.
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
                <th style={{ padding: "10px 12px", width: "36px" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos os itens da bancada"
                  />
                </th>
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
              {filteredItems.map((item) => {
                const isResolving = resolvingId === item.productId || resolvingId === "bulk" || isPending;
                const suggested = item.primaryAction.suggestedDecision ?? "approved";
                const isKitDraft = item.primaryAction.actionType === "create_kit_draft";
                const isSelected = selectedIds.has(item.productId);

                const hasRange =
                  typeof item.priceMinCents === "number" &&
                  typeof item.priceMaxCents === "number" &&
                  item.priceMaxCents > item.priceMinCents;

                return (
                  <tr
                    key={item.productId}
                    style={{
                      borderBottom: "1px solid var(--line, #e4e4e7)",
                      opacity: isResolving ? 0.6 : 1,
                      background: isSelected ? "var(--surface-elevated, #f0fdf4)" : "transparent",
                      transition: "opacity 0.2s ease, background 0.2s ease",
                    }}
                  >
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.productId)}
                        aria-label={`Selecionar ${item.title}`}
                      />
                    </td>
                    <td style={{ padding: "12px", minWidth: "260px", maxWidth: "340px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <ProductThumbnail imageUrl={item.imageUrl} />
                        <div style={{ minWidth: 0 }}>
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
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--ink-muted, #71717a)" }}>
                              ID: {item.externalId}
                            </span>
                            {item.category && (
                              <span
                                style={{
                                  fontSize: "0.6875rem",
                                  background: "var(--surface-elevated, #f4f4f5)",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  color: "var(--ink, #18181b)",
                                }}
                              >
                                {item.category}
                              </span>
                            )}
                            {item.ratingStar !== null && item.ratingStar !== undefined && (
                              <span style={{ fontSize: "0.6875rem", color: "#d97706", fontWeight: 600 }}>
                                ★ {item.ratingStar} {item.salesCount ? `(${item.salesCount} vendas)` : ""}
                              </span>
                            )}
                          </div>
                          {errorMap[item.productId] && (
                            <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "2px" }}>
                              ⚠️ {errorMap[item.productId]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px", textTransform: "capitalize" }}>
                      {item.marketplace}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {hasRange ? (
                        <div>
                          <span style={{ fontWeight: 600 }}>
                            {brl.format(item.priceMinCents! / 100)} a {brl.format(item.priceMaxCents! / 100)}
                          </span>
                          <div style={{ fontSize: "0.6875rem", color: "var(--ink-muted, #71717a)", marginTop: "2px" }}>
                            faixa de opções
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 600 }}>
                          {brl.format(item.currentPriceCents / 100)}
                        </span>
                      )}
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
                        {item.aiScore ? `Nota ${item.aiScore}/5 ★` : item.primaryAction.label}
                      </div>
                      {item.aiJustification ? (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--ink-muted, #71717a)",
                            marginTop: "2px",
                            maxWidth: "280px",
                          }}
                        >
                          {item.aiJustification}
                        </div>
                      ) : item.primaryAction.reason ? (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--ink-muted, #71717a)",
                            marginTop: "2px",
                          }}
                        >
                          {item.primaryAction.reason}
                        </div>
                      ) : null}
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
