"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import type { ApprovedVitrineProduct } from "../../../lib/curation-db.ts";
import { submitCurationDecision } from "./actions.ts";
import { copyToClipboard } from "../../../lib/clipboard.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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

export default function SelecaoView({
  initialProducts,
  shortCodes = {},
  shareHost = "",
}: {
  initialProducts: ApprovedVitrineProduct[];
  shortCodes?: Record<string, string>;
  shareHost?: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFeedback, setActionFeedback] = useState<{ id: string; msg: string; isError?: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCopyLink = async (productId: string, url: string) => {
    const ok = await copyToClipboard(url);
    if (!ok && typeof window !== "undefined") {
      window.prompt("Copie o link abaixo:", url);
    }
    setCopiedId(productId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchMp = selectedMarketplace === "all" || p.marketplace === selectedMarketplace;
      const matchSearch = !searchQuery.trim() || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchMp && matchSearch;
    });
  }, [products, selectedMarketplace, searchQuery]);

  const handleDemote = (productId: string, toStatus: "hold" | "reject") => {
    startTransition(async () => {
      try {
        const res = await submitCurationDecision({
          productId,
          decision: toStatus,
          reasonCode: "other",
          reasonDetail: toStatus === "hold" ? "Rebaixado da vitrine para espera" : "Descartado da vitrine pelo curador",
        });

        if (res.ok) {
          setProducts((prev) => prev.filter((p) => p.id !== productId));
          setActionFeedback({
            id: productId,
            msg: toStatus === "hold" ? "Produto movido para fila de espera." : "Produto removido e rejeitado da vitrine.",
          });
        } else {
          setActionFeedback({ id: productId, msg: `Erro ao atualizar: ${res.error}`, isError: true });
        }
      } catch (err) {
        setActionFeedback({
          id: productId,
          msg: `Falha na comunicação: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        });
      }
    });
  };

  return (
    <section className="selecao-dia-view" aria-labelledby="selecao-dia-title">
      <div className="selecao-dia-header">
        <div>
          <h2 id="selecao-dia-title" className="selecao-dia-heading">
            Seleção do Dia ({products.length} {products.length === 1 ? "produto ativo" : "produtos ativos"})
          </h2>
          <p className="selecao-dia-sub">
            Produtos aprovados que compõem a vitrine pública agora. A curadoria humana tem a palavra final.
          </p>
        </div>

        <div className="selecao-dia-controls">
          <input
            type="search"
            placeholder="Buscar por título..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="selecao-search-input"
          />

          <div className="selecao-filter-pills" role="radiogroup" aria-label="Filtrar por loja">
            {["all", "mercadolivre", "shopee", "aliexpress"].map((mp) => (
              <button
                key={mp}
                type="button"
                className={`filter-pill ${selectedMarketplace === mp ? "active" : ""}`}
                onClick={() => setSelectedMarketplace(mp)}
              >
                {mp === "all" ? "Todos" : marketplaceLabel(mp)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div className={`action-feedback-toast ${actionFeedback.isError ? "error" : "success"}`} role="alert">
          {actionFeedback.msg}
          <button type="button" onClick={() => setActionFeedback(null)} className="toast-close-btn">
            ✕
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-selecao-box">
          <p>Nenhum produto encontrado com os filtros atuais.</p>
        </div>
      ) : (
        <div className="selecao-grid">
          {filtered.map((item) => (
            <article key={item.id} className="selecao-card">
              <div className="selecao-card-thumb">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 300px"
                    className="selecao-img"
                  />
                ) : (
                  <div className="selecao-card-no-img">Sem foto</div>
                )}
                <span className={`mp-badge-tag ${item.marketplace}`}>
                  {marketplaceLabel(item.marketplace)}
                </span>
              </div>

              <div className="selecao-card-body">
                <div className="selecao-card-origin">
                  <span className={`origin-badge ${item.actorType === "llm" ? "ai" : "human"}`}>
                    {item.actorType === "llm" ? "✨ Piloto IA" : "👤 Curadoria Manual"}
                  </span>
                  {item.ratingStar !== null && item.ratingStar > 0 && (
                    <span className="rating-badge">★ {item.ratingStar.toFixed(1)}</span>
                  )}
                </div>

                <h3 className="selecao-card-title" title={item.title}>
                  <a
                    href={shortCodes[item.slug] ? `${shareHost}/p/${shortCodes[item.slug]}` : `/bizu/${item.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                  </a>
                </h3>

                <div className="selecao-card-price">
                  <strong className="current-price">{brl.format(item.priceCents / 100)}</strong>
                  {item.originalPriceCents && item.originalPriceCents > item.priceCents && (
                    <span className="original-price">{brl.format(item.originalPriceCents / 100)}</span>
                  )}
                </div>

                <div className="selecao-card-meta">
                  {item.salesCount !== null && item.salesCount > 0 && (
                    <span>{item.salesCount} vendas</span>
                  )}
                  {item.category && <span>• {item.category}</span>}
                </div>

                <div className="selecao-card-actions">
                  {shortCodes[item.slug] && (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(item.id, `${shareHost}/p/${shortCodes[item.slug]}`)}
                      className="btn-card-copy"
                      title="Copiar link reduzido (/p/xxxx) para compartilhar"
                    >
                      {copiedId === item.id ? "✓ Copiado!" : "📋 Copiar Link"}
                    </button>
                  )}
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn-card-link"
                    title="Abrir no marketplace"
                  >
                    ↗ Loja
                  </a>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDemote(item.id, "hold")}
                    className="btn-card-hold"
                    title="Mover para fila de espera (aguarda melhor preço ou desaturação)"
                  >
                    ⏸ Em Espera
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDemote(item.id, "reject")}
                    className="btn-card-reject"
                    title="Remover e rejeitar da vitrine"
                  >
                    ✕ Remover
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
