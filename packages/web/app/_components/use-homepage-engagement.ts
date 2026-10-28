"use client";
import { useEffect, useRef } from "react";
import { isKnownAutomation, type HomepageEvent } from "../../lib/homepage-engagement.ts";
import type { HomepageEngagementTicket } from "../../lib/homepage-engagement-token.ts";

/** One-second, half-visible impressions; desktop/mobile and carousel share deduplication. */
export function useHomepageEngagement(editionId: string | null, ticket: HomepageEngagementTicket | null, gridIds: string[], heroIds: string[], enabled: boolean) {
  const recorded = useRef(new Set<string>());
  const pending = useRef(new Map<string, HomepageEvent>());
  const gridKey = gridIds.join("|"), heroKey = heroIds.join("|");
  useEffect(() => {
    if (!enabled || !editionId || !ticket || !window.IntersectionObserver || isKnownAutomation(navigator.userAgent)) return;
    const grid = gridKey.split("|"), hero = heroKey.split("|");
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const visible = new Set<Element>();
    const eventFor = (element: Element, event: HomepageEvent["event"]): HomepageEvent | null => {
      const productId = element.getAttribute("data-home-product");
      const surface = element.getAttribute("data-home-surface") === "hero" ? "hero" : "grid";
      const position = productId ? (surface === "hero" ? hero : grid).indexOf(productId) : -1;
      return productId && position >= 0 ? { productId, surface, position, event } : null;
    };
    const add = (element: Element, type: HomepageEvent["event"]) => {
      const event = eventFor(element, type); if (!event) return;
      const key = `${ticket.viewId}:${editionId}:${event.productId}:${event.surface}:${event.position}:${type}`;
      if (!recorded.current.has(key)) { recorded.current.add(key); pending.current.set(key, event); }
    };
    const flush = () => {
      const entries = [...pending.current.entries()].slice(0, 50); if (!entries.length) return;
      const payload = JSON.stringify({ editionId, token: ticket.token, viewId: ticket.viewId, events: entries.map(([, event]) => event) });
      for (const [key] of entries) pending.current.delete(key);
      void fetch("/api/homepage-engagement", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };
    const stopTimer = (element: Element) => { clearTimeout(timers.get(element)); timers.delete(element); };
    const startTimer = (element: Element) => {
      stopTimer(element);
      if (document.visibilityState !== "visible" || element.closest('[aria-hidden="true"]')) return;
      timers.set(element, setTimeout(() => {
        timers.delete(element);
        if (visible.has(element) && document.visibilityState === "visible" && !element.closest('[aria-hidden="true"]')) add(element, "impression");
      }, 1_000));
    };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) { visible.add(entry.target); startTimer(entry.target); }
      else { visible.delete(entry.target); stopTimer(entry.target); }
    }), { threshold: [0, 0.5] });
    document.querySelectorAll("[data-home-product]").forEach(element => observer.observe(element));
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const element = event.target.closest("[data-home-product]"); if (!element) return;
      const anchor = event.target.closest("a"), favorite = event.target.closest('button[aria-pressed="false"]');
      const href = anchor?.getAttribute("href") ?? "";
      const action = href.startsWith("/bizu/") ? "detail" : href.startsWith("/go/") ? "outbound" : favorite ? "favorite" : null;
      if (action) { add(element, action); flush(); }
    };
    const visibility = () => {
      timers.forEach((_, element) => stopTimer(element));
      if (document.visibilityState === "hidden") flush(); else visible.forEach(startTimer);
    };
    const interval = setInterval(flush, 10_000);
    document.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => { observer.disconnect(); timers.forEach(clearTimeout); clearInterval(interval); while (pending.current.size) flush();
      document.removeEventListener("click", click, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", flush); };
  }, [editionId, ticket, gridKey, heroKey, enabled]);
}
