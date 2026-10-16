"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  HOLD_REASONS,
  REJECTION_REASONS,
  type CurationDecision,
  type CurationReason,
} from "../../../lib/curation-contract.ts";
import type { CurationQueueProduct } from "../../../lib/curation-db.ts";
import {
  clearDeferredCurationProduct,
  deferCurationProduct,
  submitCurationDecision,
  undoCurationDecision,
} from "./actions.ts";

type Product = Omit<CurationQueueProduct, "observedAt" | "queuedAt"> & {
  observedAt: string;
  queuedAt: string;
};
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const reasonLabel = (code?: CurationReason | null) =>
  [...HOLD_REASONS, ...REJECTION_REASONS].find(
    ([value]) => value === code,
  )?.[1] ?? "Revisão necessária";

export default function CurationReviewer({
  initialProducts,
  initialAwaiting,
  queueKind,
}: {
  initialProducts: Product[];
  initialAwaiting: number;
  queueKind: "awaiting" | "held" | "deferred";
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"reject" | "hold" | null>(null);
  const [reason, setReason] = useState<CurationReason | null>(null);
  const [detail, setDetail] = useState("");
  const [last, setLast] = useState<{
    product: Product;
    eventId: string;
  } | null>(null);
  const current = products[0];
  const labels = {
    awaiting: "Aguardando decisão",
    held: "Retidos para revisão",
    deferred: "Revisão adiada",
  };

  function decide(decision: CurationDecision) {
    if (!current || pending) return;
    startTransition(async () => {
      const result = await submitCurationDecision({
        productId: current.id,
        decision,
        reasonCode: decision === "approve" ? null : reason,
        reasonDetail: decision === "approve" ? null : detail.trim() || null,
      });
      if (!result.ok) {
        setMessage(
          "Não foi possível salvar. Confira o motivo e tente novamente.",
        );
        return;
      }
      setLast({ product: current, eventId: result.eventId });
      setProducts((items) => items.filter((item) => item.id !== current.id));
      setMode(null);
      setReason(null);
      setDetail("");
      setMessage(
        decision === "approve"
          ? "Aprovado no catálogo. Consulte a seleção para ver os destaques."
          : decision === "reject"
            ? "Produto rejeitado."
            : "Retenção registrada.",
      );
      router.refresh();
    });
  }
  function defer() {
    if (!current || pending) return;
    startTransition(async () => {
      const result = await deferCurationProduct(current.id, 7);
      if (!result.ok) {
        setMessage("Não foi possível adiar.");
        return;
      }
      setProducts((items) => items.filter((item) => item.id !== current.id));
      setLast(null);
      setMode(null);
      setMessage(
        "Revisão adiada por sete dias. O produto fica na fila Adiados.",
      );
      router.refresh();
    });
  }
  function resume() {
    if (!current || pending) return;
    startTransition(async () => {
      const result = await clearDeferredCurationProduct(current.id);
      if (!result.ok) {
        setMessage("Não foi possível antecipar a revisão.");
        return;
      }
      setProducts((items) => items.filter((item) => item.id !== current.id));
      setMode(null);
      setLast(null);
      setMessage(
        current.status === "held"
          ? "Adiamento removido. Produto disponível em Retidos."
          : "Produto disponível em Aguardando decisão.",
      );
      router.refresh();
    });
  }
  function undo() {
    if (!last || pending) return;
    startTransition(async () => {
      const result = await undoCurationDecision(last.product.id, last.eventId);
      if (!result.ok) {
        setMessage(
          "O produto mudou depois da decisão. Atualize a fila antes de continuar.",
        );
        return;
      }
      setProducts((items) => [
        last.product,
        ...items.filter((item) => item.id !== last.product.id),
      ]);
      setLast(null);
      setMessage("Última decisão desfeita.");
      router.refresh();
    });
  }

  return (
    <section className="curation-review-flow" aria-label={labels[queueKind]}>
      <div className="curation-review-heading">
        <div>
          <h2>{labels[queueKind]}</h2>
          <p>
            {initialAwaiting} produtos recentes nesta fila · até{" "}
            {initialProducts.length} carregados por vez.
          </p>
        </div>
        {last && (
          <button type="button" disabled={pending} onClick={undo}>
            Desfazer última decisão
          </button>
        )}
      </div>
      {message && (
        <p className="curation-feedback" role="status">
          {message}
        </p>
      )}
      {!current ? (
        <div className="curation-empty">
          <h3>
            {initialProducts.length
              ? "Lote de revisão concluído."
              : "Nenhum produto nesta fila."}
          </h3>
          <p>
            As filas mostram ofertas vistas nos últimos sete dias. O histórico é
            preservado.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Atualizar fila
          </button>
          <a href="/admin/curadoria?aba=selecao">Ver seleção →</a>
        </div>
      ) : (
        <>
          <article className="curation-review-card">
            <div className="curation-review-photo">
              {current.imageUrl ? (
                <Image
                  src={current.imageUrl}
                  alt={current.title}
                  fill
                  sizes="(max-width: 760px) 90vw, 280px"
                />
              ) : (
                <span>Sem foto</span>
              )}
            </div>
            <div>
              <p className="eyebrow">
                {current.marketplace} · {current.category ?? "Sem categoria"}
              </p>
              <h3>{current.title}</h3>
              <p className="curation-review-price">
                {brl.format(current.priceCents / 100)}
              </p>
              {current.status === "held" && (
                <p className="curation-feedback">
                  <strong>{reasonLabel(current.reasonCode)}</strong>
                  {current.reasonDetail && (
                    <>
                      <br />
                      {current.reasonDetail}
                    </>
                  )}
                </p>
              )}
              {current.deferredUntil && (
                <p>
                  Revisão programada:{" "}
                  {date.format(new Date(current.deferredUntil))}.
                </p>
              )}
              {current.aiInsight && (
                <p>
                  <strong>Avaliação da IA: {current.aiInsight.score}/5.</strong>{" "}
                  {current.aiInsight.justification}
                </p>
              )}
              <p>
                Última observação: {date.format(new Date(current.observedAt))}.
              </p>
              <a
                href={current.productUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Conferir anúncio ↗
              </a>
              <details>
                <summary>Evidências disponíveis</summary>
                <p>
                  Avaliação do anúncio: {current.ratingStar ?? "desconhecida"} ·
                  vendas:{" "}
                  {current.salesLabel ?? current.salesCount ?? "desconhecidas"}.
                </p>
                <p>
                  {current.observationCount} observações · {current.historyDays}{" "}
                  dias de histórico. A quantidade de observações, sozinha, não
                  comprova que sejam da mesma variante.
                </p>
                {current.originalPriceCents && (
                  <p>
                    Preço original declarado pelo vendedor:{" "}
                    {brl.format(current.originalPriceCents / 100)}.
                  </p>
                )}
              </details>
            </div>
          </article>
          {mode && (
            <div className="curation-decision-form">
              <label>
                Motivo da {mode === "reject" ? "rejeição" : "retenção"}
                <select
                  value={reason ?? ""}
                  onChange={(event) =>
                    setReason(event.target.value as CurationReason)
                  }
                >
                  <option value="">Selecione</option>
                  {(mode === "reject" ? REJECTION_REASONS : HOLD_REASONS).map(
                    ([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Detalhes{reason === "other" ? " (obrigatório)" : " (opcional)"}
                <textarea
                  value={detail}
                  maxLength={1000}
                  onChange={(event) => setDetail(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={
                  pending ||
                  !reason ||
                  (reason === "other" && detail.trim().length < 3)
                }
                onClick={() => decide(mode)}
              >
                Confirmar decisão
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode(null)}
              >
                Cancelar
              </button>
            </div>
          )}
          <div className="curation-review-actions">
            <button
              type="button"
              disabled={pending || !!mode}
              onClick={() => decide("approve")}
            >
              {pending ? "Salvando…" : "Aprovar no catálogo"}
            </button>
            <button
              type="button"
              disabled={pending || !!mode}
              onClick={() => {
                setMode("reject");
                setReason(null);
                setDetail("");
              }}
            >
              Rejeitar
            </button>
            <button
              type="button"
              disabled={pending || !!mode}
              onClick={() => {
                setMode("hold");
                setReason(null);
                setDetail("");
              }}
            >
              Reter com motivo
            </button>
            {queueKind === "deferred" ? (
              <button
                type="button"
                disabled={pending || !!mode}
                onClick={resume}
              >
                Retomar revisão agora
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || !!mode}
                onClick={defer}
              >
                Adiar sete dias
              </button>
            )}
          </div>
          <p className="curation-muted">
            {products.length - 1} outros produtos neste lote. Aprovação vale
            para todo o catálogo, inclusive na visualização por grupos.
          </p>
        </>
      )}
    </section>
  );
}
