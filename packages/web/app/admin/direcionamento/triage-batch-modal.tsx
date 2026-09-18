"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { TriageBatchItem } from "../../../lib/editorial-compass.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function marketplaceLabel(slug: string): string {
  switch (slug) {
    case "mercadolivre":
      return "Mercado Livre";
    case "shopee":
      return "Shopee";
    case "aliexpress":
      return "AliExpress";
    default:
      return slug;
  }
}

function translateReason(reason: string | null): string {
  if (!reason) return "Sem código de motivo";
  switch (reason) {
    case "weak_offer":
      return "Ticket baixo (< R$ 20)";
    case "family_saturation":
      return "Saturação de família (produtos repetidos)";
    case "adult_sexual":
      return "Conteúdo adulto/inseguro";
    case "low_utility":
      return "Peça industrial ou baixa utilidade";
    case "low_quality_listing":
      return "Baixa reputação (< 4.0)";
    case "misleading_claim":
      return "Promessa exagerada/milagrosa";
    case "other":
      return "Descarte em auditoria";
    default:
      return reason;
  }
}

export default function TriageBatchModal({
  isOpen,
  onClose,
  batchTime,
  items,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  batchTime: string | null;
  items: TriageBatchItem[];
  isLoading: boolean;
}) {
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "held" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Fechar com tecla Escape e travar o scroll da página
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // Resetar filtros ao trocar de lote
  useEffect(() => {
    if (isOpen) {
      setFilterStatus("all");
      setSearchQuery("");
    }
  }, [isOpen, batchTime]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      approved: items.filter((i) => i.status === "approved").length,
      held: items.filter((i) => i.status === "held").length,
      rejected: items.filter((i) => i.status === "rejected").length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterStatus !== "all" && item.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchMarketplace = item.marketplace.toLowerCase().includes(q);
        const matchRationale = item.rationale.toLowerCase().includes(q);
        const matchReason = (item.reasonDetail || "").toLowerCase().includes(q);
        return matchTitle || matchMarketplace || matchRationale || matchReason;
      }
      return true;
    });
  }, [items, filterStatus, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="triage-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-modal-title"
    >
      <div
        className="triage-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <header className="triage-modal-header">
          <div>
            <span className="triage-modal-eyebrow">Transparência & Auditoria Algorítmica</span>
            <h2 id="triage-modal-title">
              🔍 Produtos Avaliados no Lote
            </h2>
            {batchTime && (
              <p className="triage-modal-time">
                Executado em <strong>{dateFmt.format(new Date(batchTime))}</strong> · Total de{" "}
                <strong>{items.length} produto(s)</strong>
              </p>
            )}
          </div>
          <button
            type="button"
            className="triage-modal-close"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </header>

        {/* Barra de Filtros e Busca */}
        <div className="triage-modal-controls">
          <div className="triage-filter-tabs" role="tablist" aria-label="Filtrar por decisão">
            <button
              type="button"
              className={`triage-filter-btn ${filterStatus === "all" ? "active" : ""}`}
              onClick={() => setFilterStatus("all")}
            >
              Todos ({counts.all})
            </button>
            <button
              type="button"
              className={`triage-filter-btn approved ${filterStatus === "approved" ? "active" : ""}`}
              onClick={() => setFilterStatus("approved")}
            >
              ✓ Aprovados ({counts.approved})
            </button>
            <button
              type="button"
              className={`triage-filter-btn held ${filterStatus === "held" ? "active" : ""}`}
              onClick={() => setFilterStatus("held")}
            >
              ⏳ Em Espera ({counts.held})
            </button>
            <button
              type="button"
              className={`triage-filter-btn rejected ${filterStatus === "rejected" ? "active" : ""}`}
              onClick={() => setFilterStatus("rejected")}
            >
              ✕ Rejeitados ({counts.rejected})
            </button>
          </div>

          <div className="triage-modal-search">
            <input
              type="search"
              placeholder="Buscar por título, loja ou motivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filtrar produtos neste lote"
            />
          </div>
        </div>

        {/* Corpo do Modal: Listagem de Itens */}
        <div className="triage-modal-body">
          {isLoading ? (
            <div className="triage-modal-loading">
              <span className="triage-spinner" aria-hidden="true" />
              <p>Carregando os produtos avaliados e justificativas da IA...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="triage-modal-empty">
              <p>Nenhum produto corresponde aos filtros selecionados.</p>
            </div>
          ) : (
            <div className="triage-items-list">
              {filteredItems.map((item) => (
                <article key={item.id} className={`triage-item-card status-${item.status}`}>
                  {/* Foto / Thumbnail */}
                  <div className="triage-item-media">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        width={90}
                        height={90}
                        unoptimized
                        className="triage-item-thumb"
                      />
                    ) : (
                      <div className="triage-item-no-thumb">Sem foto</div>
                    )}
                  </div>

                  {/* Informações Principais */}
                  <div className="triage-item-content">
                    <div className="triage-item-meta-top">
                      <span className="triage-marketplace-badge">
                        {marketplaceLabel(item.marketplace)}
                      </span>
                      <span className={`triage-status-pill status-${item.status}`}>
                        {item.status === "approved"
                          ? "✓ Auto-Aprovado"
                          : item.status === "held"
                          ? "⏳ Em Espera"
                          : "✕ Rejeitado"}
                      </span>

                      {item.actorType === "llm" ? (
                        <span className="triage-actor-badge llm">🤖 Gemini 2.5 Flash</span>
                      ) : (
                        <span className="triage-actor-badge rule">⚡ Regra de Corte</span>
                      )}

                      {item.aiScore != null && (
                        <span className="triage-score-badge">
                          ⭐ {item.aiScore}/5
                        </span>
                      )}
                    </div>

                    <h3 className="triage-item-title">
                      {item.productUrl ? (
                        <a
                          href={item.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir oferta na loja"
                        >
                          {item.title} ↗
                        </a>
                      ) : (
                        item.title
                      )}
                    </h3>

                    <div className="triage-item-price">
                      <strong>{item.priceCents > 0 ? brl.format(item.priceCents / 100) : "Preço não informado"}</strong>
                      {item.reasonCode && (
                        <span className="triage-reason-code-tag">
                          Filtro: {translateReason(item.reasonCode)}
                        </span>
                      )}
                    </div>

                    {/* Caixa de Rationale / Justificativa Editorial */}
                    <div className="triage-item-rationale-box">
                      <span className="rationale-label">
                        {item.actorType === "llm" ? "Parecer da IA:" : "Motivo do Filtro:"}
                      </span>
                      <p className="rationale-text">{item.rationale}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé do Modal com Resumo */}
        <footer className="triage-modal-footer">
          <div className="triage-footer-stats">
            <span>Exibindo <b>{filteredItems.length}</b> de <b>{items.length}</b> produtos</span>
            <span className="stat-dot">·</span>
            <span className="text-approved">+{counts.approved} aprovados</span>
            <span className="stat-dot">·</span>
            <span className="text-held">{counts.held} em espera</span>
            <span className="stat-dot">·</span>
            <span className="text-rejected">{counts.rejected} rejeitados</span>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
