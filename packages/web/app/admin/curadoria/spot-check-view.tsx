"use client";

import Image from "next/image";
import { useState } from "react";
import type { SpotCheckProduct } from "../../../lib/editorial-compass.ts";
import { confirmSpotCheckAction, rejectSpotCheckAction } from "../direcionamento/actions.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function SpotCheckView({
  initialProducts,
  initialReviewed,
  dailyTarget,
}: {
  initialProducts: SpotCheckProduct[];
  initialReviewed: number;
  dailyTarget: number;
}) {
  const [items, setItems] = useState<SpotCheckProduct[]>(initialProducts);
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleDismiss = async (productId: string) => {
    setIsConfirming(true);
    try {
      const res = await confirmSpotCheckAction({ productId });
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== productId));
        setReviewed((value) => value + 1);
      }
      else alert(`Erro ao confirmar produto: ${res.error}`);
    } catch (err) {
      alert(`Falha na comunicação: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmReject = async (productId: string) => {
    if (!rejectFeedback.trim()) return;
    setIsRejecting(true);
    try {
      const res = await rejectSpotCheckAction({
        productId,
        feedback: rejectFeedback.trim(),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== productId));
        setReviewed((value) => value + 1);
        setRejectingId(null);
        setRejectFeedback("");
      } else {
        alert(`Erro ao rejeitar produto: ${res.error}`);
      }
    } catch (err) {
      alert(`Falha na comunicação: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="spotcheck-view-container">
      <div className="spotcheck-intro">
        <div className="daily-audit-title-row">
          <div>
            <p className="eyebrow">Controle de qualidade de hoje</p>
            <h3>Auditoria rápida</h3>
          </div>
          <strong className={reviewed >= dailyTarget ? "daily-audit-count complete" : "daily-audit-count"}>
            {Math.min(reviewed, dailyTarget)}/{dailyTarget}
          </strong>
        </div>
        <p>
          Amostragem dos últimos produtos aprovados no piloto automático pela IA.
          Revise visualmente: se encontrar algo fora do padrão, descarte e informe o motivo para calibrar a IA.
        </p>
        <div className="daily-audit-progress" role="progressbar" aria-label="Progresso da auditoria de hoje" aria-valuemin={0} aria-valuemax={dailyTarget} aria-valuenow={Math.min(reviewed, dailyTarget)}>
          <span style={{ width: `${Math.min(100, (reviewed / dailyTarget) * 100)}%` }} />
        </div>
      </div>

      {reviewed >= dailyTarget ? (
        <div className="empty-state-box daily-audit-complete">
          <p className="eyebrow">Rotina concluída</p>
          <h3>Auditoria de hoje finalizada ✓</h3>
          <p>Você revisou {dailyTarget} produtos. Aprovações antigas continuam preservadas, mas não são uma obrigação para hoje.</p>
          <a className="admin-curation-start" href="/pauta">Preparar pauta de Stories →</a>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state-box">
          <p>Não há aprovações automáticas disponíveis para completar a amostra de hoje.</p>
        </div>
      ) : (
        <div className="spotcheck-grid">
          {items.map((item) => (
            <article key={item.id} className="spotcheck-item">
              <div className="item-photo">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 240px"
                  />
                ) : (
                  <div className="photo-placeholder">Sem foto</div>
                )}
                <span className="marketplace-tag">{item.marketplace}</span>
                <span className="score-badge">⭐ {item.aiScore}/5</span>
              </div>

              <div className="item-body">
                <h4 title={item.title}>
                  <a href={item.productUrl} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h4>

                <div className="item-meta">
                  <span className="item-price">{brl.format(item.priceCents / 100)}</span>
                  {item.editorialCategory && (
                    <span className="editorial-cat-pill">{item.editorialCategory}</span>
                  )}
                </div>

                <p className="ai-justification" title={item.aiJustification}>
                  <em>&quot;{item.aiJustification}&quot;</em>
                </p>

                {rejectingId === item.id ? (
                  <div className="reject-form">
                    <label htmlFor={"reject-input-" + item.id}>Por que descartar este item?</label>
                    <input
                      id={"reject-input-" + item.id}
                      type="text"
                      placeholder="Ex: Peça avulsa / muito nichado / preço alto..."
                      value={rejectFeedback}
                      onChange={(e) => setRejectFeedback(e.target.value)}
                      autoFocus
                    />
                    <div className="reject-actions">
                      <button
                        type="button"
                        className="btn-confirm-reject"
                        disabled={isRejecting || !rejectFeedback.trim()}
                        onClick={() => handleConfirmReject(item.id)}
                      >
                        {isRejecting ? "Rejeitando..." : "Confirmar Rejeição"}
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectFeedback("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="item-actions">
                    <button
                      type="button"
                      className="btn-spot-ok"
                      disabled={isConfirming || isRejecting}
                      onClick={() => void handleDismiss(item.id)}
                      title="Confirmar aprovação deste produto na amostragem"
                    >
                      {isConfirming ? "Salvando..." : "✓ Manter"}
                    </button>
                    <button
                      type="button"
                      className="btn-spot-reject"
                      disabled={isConfirming || isRejecting}
                      onClick={() => {
                        setRejectingId(item.id);
                        setRejectFeedback("");
                      }}
                      title="Descartar produto e ensinar a IA"
                    >
                      ✕ Descartar & Ensinar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
