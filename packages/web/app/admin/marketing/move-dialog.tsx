"use client";

import { useEffect, useRef, useState } from "react";
import {
  contentStage,
  STAGES,
  STAGE_LABELS,
  type MarketingContent,
} from "../../../lib/marketing-contract";
import type {
  MarketingDragItem,
  MarketingDropTarget,
} from "../../../lib/marketing-moves";
import { Icon } from "./ui";
import s from "./marketing.module.css";

export function MarketingMoveDialog({
  item,
  content,
  saving,
  error,
  onMove,
  onClose,
}: {
  item: MarketingDragItem;
  content: MarketingContent;
  saving: boolean;
  error: string;
  onMove: (
    item: MarketingDragItem,
    target: MarketingDropTarget,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState(contentStage(content));
  const [date, setDate] = useState(
    item.kind === "publication"
      ? content.publications.find((p) => p.id === item.publicationId)
          ?.plannedDate || ""
      : "",
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`${s.dialog} ${s.moveDialog}`}
      aria-labelledby="move-title"
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else onClose();
      }}
    >
      <div className={s.dialogHeader}>
        <div>
          <span className={s.eyebrow}>ESCOLHA O DESTINO</span>
          <h2 id="move-title">
            Mover {item.kind === "content" ? "conteúdo" : "publicação"}
          </h2>
        </div>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Fechar movimentação"
          onClick={onClose}
          disabled={saving}
        >
          <Icon name="close" />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onMove(
            item,
            item.kind === "content"
              ? { kind: "stage", stage }
              : { kind: "date", date },
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <fieldset disabled={saving} className={s.moveFields}>
          <p>{item.label}</p>
          {item.kind === "content" ? (
            <label className={s.field}>
              <span>Etapa de destino</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as typeof stage)}
              >
                {STAGES.filter(
                  (v) =>
                    contentStage(content) !== "published" || v === "published",
                ).map((v) => (
                  <option key={v} value={v}>
                    {STAGE_LABELS[v]}
                  </option>
                ))}
              </select>
              <small>
                Ao escolher Publicado, você confirma canal e data real no
                editor.
              </small>
            </label>
          ) : (
            <label className={s.field}>
              <span>Data planejada</span>
              <input
                type="date"
                value={date}
                onInput={(e) => setDate(e.currentTarget.value)}
                onChange={(e) => setDate(e.target.value)}
              />
              <small>
                Deixe em branco para devolver à lista “Ainda sem data”.
              </small>
            </label>
          )}
        </fieldset>
        <div className={s.dialogFooter}>
          {error && (
            <p className={s.modalError} role="alert">
              {error}
            </p>
          )}
          <span>O movimento será salvo no seu espaço.</span>
          <div>
            <button type="submit" className={s.primary} disabled={saving}>
              {saving
                ? "Salvando…"
                : stage === "published" && item.kind === "content"
                  ? "Conferir publicação"
                  : "Confirmar movimento"}
              <Icon name="check" size={17} />
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
