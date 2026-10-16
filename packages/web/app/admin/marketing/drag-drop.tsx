"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type {
  MarketingDragItem,
  MarketingDropTarget,
} from "../../../lib/marketing-moves";
import { Icon } from "./ui";
import s from "./marketing.module.css";

type RegisteredTarget = { target: MarketingDropTarget; enabled: boolean };
type DragContextValue = {
  active: MarketingDragItem | null;
  over: string;
  disabled: boolean;
  targets: Map<string, RegisteredTarget>;
  start: (item: MarketingDragItem) => void;
  hover: (key: string) => void;
  finish: (key?: string) => void;
  suppressClick: () => boolean;
  choose: (item: MarketingDragItem) => void;
};
const DragContext = createContext<DragContextValue | null>(null);
function useMarketingDrag() {
  const value = useContext(DragContext);
  if (!value) throw new Error("Drag provider missing");
  return value;
}

export function MarketingDragProvider({
  children,
  disabled,
  onDrop,
  onChoose,
}: {
  children: ReactNode;
  disabled: boolean;
  onDrop: (item: MarketingDragItem, target: MarketingDropTarget) => void;
  onChoose: (item: MarketingDragItem) => void;
}) {
  const [active, setActive] = useState<MarketingDragItem | null>(null);
  const [over, setOver] = useState("");
  const itemRef = useRef<MarketingDragItem | null>(null);
  const overRef = useRef("");
  const suppressUntil = useRef(0);
  const targets = useRef(new Map<string, RegisteredTarget>());
  function start(item: MarketingDragItem) {
    if (disabled) return;
    itemRef.current = item;
    setActive(item);
  }
  function hover(key: string) {
    if (!itemRef.current || key === overRef.current) return;
    overRef.current = key;
    setOver(key);
  }
  function finish(key?: string) {
    const item = itemRef.current;
    const target = key ? targets.current.get(key) : undefined;
    itemRef.current = null;
    overRef.current = "";
    setActive(null);
    setOver("");
    if (item) suppressUntil.current = Date.now() + 350;
    if (
      !disabled &&
      item &&
      target?.enabled &&
      item.kind === (target.target.kind === "stage" ? "content" : "publication")
    )
      onDrop(item, target.target);
  }
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      itemRef.current = null;
      overRef.current = "";
      setActive(null);
      setOver("");
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <DragContext.Provider
      value={{
        active,
        over,
        disabled,
        targets: targets.current,
        start,
        hover,
        finish,
        suppressClick: () => Date.now() < suppressUntil.current,
        choose: onChoose,
      }}
    >
      {children}
      {active && (
        <div className={s.dragStatus} role="status">
          <Icon name="grip" size={17} />
          <span>{active.label}</span>
          <small>Solte no destino · Esc cancela</small>
        </div>
      )}
    </DragContext.Provider>
  );
}

/** Pointer capture works across scroll containers; touch starts only on the handle. */
export function DraggableMarketingItem({
  item,
  children,
  className = "",
  disabled = false,
  compact = false,
}: {
  item: MarketingDragItem;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const drag = useMarketingDrag();
  const blocked = disabled || drag.disabled;
  const touching = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
    over: string;
  } | null>(null);
  const endSuppressed = useRef(0);
  const selected =
    drag.active?.contentId === item.contentId &&
    (drag.active.kind === "content" ||
      item.kind === "content" ||
      drag.active.publicationId === item.publicationId);
  return (
    <div
      className={`${s.draggableItem} ${selected ? s.draggingItem : ""} ${compact ? s.compactDrag : ""} ${className}`}
      draggable={false}
      data-marketing-draggable={!blocked}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (blocked || !event.isPrimary || event.button !== 0) return;
        if (
          event.pointerType !== "mouse" &&
          !(
            event.target instanceof Element &&
            event.target.closest("[data-marketing-drag-handle]")
          )
        )
          return;
        endSuppressed.current = 0;
        touching.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          over: "",
        };
        // Capture on the original control so a short click still opens that control.
        // Waiting for movement can miss the first move outside a small calendar card.
        if (event.target instanceof Element)
          event.target.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const touch = touching.current;
        if (!touch || event.pointerId !== touch.pointerId) return;
        if (
          !touch.moved &&
          Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 7
        )
          return;
        if (!touch.moved) {
          touch.moved = true;
          drag.start(item);
        }
        event.preventDefault();
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-marketing-drop]");
        touch.over = target?.dataset.marketingDrop || "";
        drag.hover(touch.over);
        if (event.clientY < 65) window.scrollBy(0, -15);
        if (event.clientY > window.innerHeight - 65) window.scrollBy(0, 15);
      }}
      onPointerUp={(event) => {
        const touch = touching.current;
        if (!touch || event.pointerId !== touch.pointerId) return;
        touching.current = null;
        if (touch.moved) {
          event.preventDefault();
          endSuppressed.current = Date.now() + 350;
          drag.finish(touch.over);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        touching.current = null;
        drag.finish();
      }}
      onLostPointerCapture={() => {
        if (touching.current) {
          touching.current = null;
          drag.finish();
        }
      }}
      onClickCapture={(event) => {
        if (
          drag.disabled ||
          drag.suppressClick() ||
          Date.now() < endSuppressed.current
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {children}
      {!disabled && (
        <button
          type="button"
          className={s.dragHandle}
          data-marketing-drag-handle
          aria-label={`Mover ${item.label}`}
          title="Arraste para mover, ou clique para escolher o destino"
          disabled={drag.disabled}
          onClick={() => drag.choose(item)}
        >
          <Icon name="grip" size={compact ? 13 : 16} />
        </button>
      )}
    </div>
  );
}

export function MarketingDropZone({
  target,
  enabled = true,
  children,
  className = "",
  label,
  insertion = false,
  ...props
}: {
  target: MarketingDropTarget;
  enabled?: boolean;
  children: ReactNode;
  className?: string;
  label: string;
  insertion?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const drag = useMarketingDrag();
  const key =
    target.kind === "date"
      ? `date:${target.date}`
      : `stage:${target.stage}:${target.beforeId || "end"}`;
  useEffect(() => {
    drag.targets.set(key, { target, enabled });
    return () => {
      drag.targets.delete(key);
    };
  }, [
    key,
    target.kind,
    target.kind === "date" ? target.date : target.stage,
    target.kind === "stage" ? target.beforeId : undefined,
    enabled,
    drag.targets,
  ]);
  const compatible =
    drag.active?.kind === (target.kind === "stage" ? "content" : "publication");
  const hovered = compatible && drag.over === key;
  return (
    <div
      {...props}
      data-marketing-drop={key}
      aria-label={label}
      className={`${className} ${hovered && enabled ? (insertion ? s.dropInsert : s.dropActive) : ""} ${hovered && !enabled ? s.dropBlocked : ""}`}
      onDragOver={(event) => {
        if (!compatible) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect =
          enabled && !drag.disabled ? "move" : "none";
        drag.hover(key);
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        if (drag.over === key) drag.hover("");
      }}
      onDrop={(event) => {
        if (!compatible) return;
        event.preventDefault();
        event.stopPropagation();
        drag.finish(key);
      }}
    >
      {children}
    </div>
  );
}
