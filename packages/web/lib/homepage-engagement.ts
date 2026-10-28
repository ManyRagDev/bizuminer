export type HomepageEvent = { productId: string; surface: "grid" | "hero"; position: number; event: "impression" | "detail" | "favorite" | "outbound" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseHomepageEngagement(value: unknown): { editionId: string; viewId: string; events: HomepageEvent[] } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.editionId !== "string" || !uuid.test(body.editionId) || typeof body.viewId !== "string" || !uuid.test(body.viewId)
    || !Array.isArray(body.events) || !body.events.length || body.events.length > 50) return null;
  const events: HomepageEvent[] = [];
  for (const event of body.events) {
    if (!event || typeof event !== "object" || typeof event.productId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(event.productId)
      || !["grid", "hero"].includes(event.surface) || !["impression", "detail", "favorite", "outbound"].includes(event.event)
      || !Number.isInteger(event.position) || event.position < 0 || event.position > (event.surface === "hero" ? 2 : 23)) return null;
    events.push({ productId: event.productId, surface: event.surface, position: event.position, event: event.event });
  }
  return { editionId: body.editionId, viewId: body.viewId, events };
}
export const isKnownAutomation = (agent: string) => /bot\b|crawler|spider|facebookexternalhit|whatsapp|headless|preview|lighthouse/i.test(agent);
export function engagementRates(row: { impressions: number; details: number; favorites: number; outbound: number }) {
  // Below this threshold report counts, not a popularity conclusion.
  return row.impressions < 50 ? null : { detail: row.details / row.impressions, favorite: row.favorites / row.impressions, outbound: row.outbound / row.impressions };
}
