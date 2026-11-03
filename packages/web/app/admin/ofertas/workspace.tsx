"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminLink from "../../_components/admin-link.tsx";
import type { WorkspaceOffer } from "../../../lib/affiliate-workspace-contract.ts";
import OfertaCard from "../oferta-card.tsx";

export default function Offers({ offers }: { offers: WorkspaceOffer[] }) {
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "demand" | "lowest" | "ml" | "shopee">("all");
  const [limit, setLimit] = useState(24);

  // Filter logic
  let filtered = offers.filter((o) => {
    const c = o.candidate;
    const textMatch =
      !query ||
      (c.title || "").toLowerCase().includes(query.toLowerCase()) ||
      (c.displayTitle || "").toLowerCase().includes(query.toLowerCase()) ||
      (c.benefit || "").toLowerCase().includes(query.toLowerCase());

    if (!textMatch) return false;

    if (filterMode === "demand") return (o.watchersCount ?? 0) > 0;
    if (filterMode === "lowest") return Boolean(c.lowestVerified);
    if (filterMode === "ml") return c.marketplace === "mercadolivre";
    if (filterMode === "shopee") return c.marketplace === "shopee";

    return true;
  });

  return (
    <div className="bm-workspace">
      <header className="bm-page-heading bm-heading-row">
        <div>
          <p className="bm-eyebrow">Catálogo e busca</p>
          <h1>Ofertas auditadas para seu público</h1>
          <p>
            Copie textos persuasivos e links encurtados em 1 clique, sem preencher formulários.
          </p>
        </div>
        <div className="bm-actions">
          <AdminLink href="/pauta" className="bm-button secondary">
            📱 Pauta de Disparo
          </AdminLink>
          <AdminLink href="/admin/ofertas/adicionar" className="bm-button">
            + Adicionar link de produto
          </AdminLink>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="bm-filters" style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
        <label className="bm-search" style={{ width: "100%" }}>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            placeholder="Buscar por produto, categoria (ex: fone, airfryer, luminária)…"
            style={{ width: "100%", padding: "12px 16px", fontSize: "15px", borderRadius: "8px", border: "1px solid var(--line)" }}
          />
        </label>

        {/* Quick Filter Chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)" }}>Filtrar:</span>
          <button
            type="button"
            className={`bm-tone-pill ${filterMode === "all" ? "active" : ""}`}
            onClick={() => setFilterMode("all")}
          >
            Todas ({offers.length})
          </button>
          <button
            type="button"
            className={`bm-tone-pill ${filterMode === "demand" ? "active" : ""}`}
            onClick={() => setFilterMode("demand")}
          >
            🎯 Mais Procuradas pelos Compradores
          </button>
          <button
            type="button"
            className={`bm-tone-pill ${filterMode === "lowest" ? "active" : ""}`}
            onClick={() => setFilterMode("lowest")}
          >
            📉 Menor Preço Histórico
          </button>
          <button
            type="button"
            className={`bm-tone-pill ${filterMode === "ml" ? "active" : ""}`}
            onClick={() => setFilterMode("ml")}
          >
            💛 Mercado Livre
          </button>
          <button
            type="button"
            className={`bm-tone-pill ${filterMode === "shopee" ? "active" : ""}`}
            onClick={() => setFilterMode("shopee")}
          >
            🧡 Shopee
          </button>
        </div>
      </div>

      <p className="bm-muted" role="status" style={{ fontSize: "13px", marginBottom: "16px" }}>
        {filtered.length}{" "}
        {filtered.length === 1 ? "oferta pronta encontrada" : "ofertas prontas encontradas"} ·
        Mostrando {Math.min(limit, filtered.length)}
      </p>

      {/* Grid of Interactive 1-Click Cards */}
      <div className="bm-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "20px" }}>
        {filtered.slice(0, limit).map((offer) => (
          <OfertaCard key={offer.candidate.id} offer={offer} />
        ))}
      </div>

      {filtered.length > limit && (
        <p style={{ textAlign: "center", marginTop: "24px" }}>
          <button
            type="button"
            className="bm-button secondary"
            onClick={() => setLimit((v) => v + 24)}
          >
            Mostrar mais ofertas (+24)
          </button>
        </p>
      )}

      {!filtered.length && (
        <div className="bm-empty">
          <h2>
            {offers.length
              ? "Nenhuma oferta com esses critérios de busca."
              : "Nenhuma oferta pronta encontrada no momento."}
          </h2>
          <p>
            {offers.length
              ? "Tente outro termo de busca ou selecione outro filtro."
              : "Cole o link de um produto ou use a Curadoria Geral para aprovar novos itens do catálogo."}
          </p>
          <AdminLink
            href="/admin/ofertas/adicionar"
            className="bm-button secondary"
          >
            Adicionar oferta via link
          </AdminLink>
        </div>
      )}
    </div>
  );
}
