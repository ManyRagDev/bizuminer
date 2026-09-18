"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import type { CurationQueueProduct } from "../../../lib/curation-db.ts";
import { clearDeferredCurationProduct } from "./actions.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HeldQueueView({
  initialProducts,
}: {
  initialProducts: CurationQueueProduct[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAnticipate(productId: string) {
    if (isPending) return;
    setMessage("");
    startTransition(async () => {
      const result = await clearDeferredCurationProduct(productId);
      if (!result.ok) {
        setMessage("Não foi possível antecipar a avaliação deste produto.");
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setMessage("Produto antecipado: retornou imediatamente para a fila de avaliação.");
    });
  }

  if (products.length === 0) {
    return (
      <section className="curation-empty">
        <span className="curation-proof">EM ESPERA<br />VAZIO</span>
        <p className="eyebrow">Curadoria</p>
        <h1>Nenhum produto em espera.</h1>
        <p>Não há produtos retidos por saturação, falta de evidência ou adiados para revisão posterior.</p>
        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
          <a className="admin-curation-start" href="/admin/curadoria?aba=hoje">Ver fila aguardando →</a>
          <a className="admin-curation-start" href="/admin">← Voltar ao painel</a>
        </div>
      </section>
    );
  }

  const deferredCount = products.filter((p) => p.deferredUntil && new Date(p.deferredUntil).getTime() > Date.now()).length;
  const heldCount = products.length - deferredCount;

  return (
    <section className="curation-held-view">
      {message && (
        <div className="curation-alert-bar" role="status">
          <span>{message}</span>
        </div>
      )}

      <header className="curation-held-head">
        <div>
          <p className="eyebrow">Produtos Retidos e Adiados</p>
          <h2>{products.length} itens aguardando momento oportuno</h2>
          <p>{heldCount} retidos com motivo formal · {deferredCount} adiados com data programada</p>
        </div>
      </header>

      <div className="curation-held-grid">
        {products.map((p) => {
          const isDeferred = p.deferredUntil && new Date(p.deferredUntil).getTime() > Date.now();
          const deferDate = p.deferredUntil ? new Date(p.deferredUntil) : null;

          return (
            <article key={p.id} className={`curation-held-card ${isDeferred ? "deferred" : "held"}`}>
              <div className="held-card-status">
                {isDeferred ? (
                  <span className="badge-defer">Rever em {deferDate ? dateFormat.format(deferDate) : "breve"}</span>
                ) : (
                  <span className="badge-held-reason">
                    {p.status === "held" ? "Retido: " : "Em espera: "}
                    {p.presentingTargetFamily ?? "Saturação / Evidência"}
                  </span>
                )}
                <span className="rep-marketplace-tag">{p.marketplace}</span>
              </div>

              <div className="held-card-body">
                <div className="held-photo-wrap">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.title}
                      fill
                      sizes="120px"
                    />
                  ) : (
                    <span>Sem foto</span>
                  )}
                </div>

                <div className="held-info">
                  <h4 title={p.title}>{p.title}</h4>
                  <p className="held-price">
                    <strong>{brl.format(p.priceCents / 100)}</strong>
                    {p.originalPriceCents && p.originalPriceCents > p.priceCents ? (
                      <del>{brl.format(p.originalPriceCents / 100)}</del>
                    ) : null}
                  </p>
                  <small className="held-meta">
                    {p.familyLabel ? `Família: ${p.familyLabel} · ` : ""}
                    ID: {p.id.slice(0, 8)}…
                  </small>
                </div>
              </div>

              <footer className="held-card-actions">
                <a href={p.productUrl} target="_blank" rel="noreferrer" className="held-link">
                  anúncio ↗
                </a>
                {isDeferred && (
                  <button
                    type="button"
                    className="anticipate-btn"
                    disabled={isPending}
                    onClick={() => handleAnticipate(p.id)}
                    title="Cancela o adiamento e faz o produto voltar para a fila de avaliação imediatamente"
                  >
                    ⚡ Antecipar avaliação
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
