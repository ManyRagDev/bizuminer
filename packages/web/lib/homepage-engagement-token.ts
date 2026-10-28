import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export interface HomepageEngagementTicket { token: string; viewId: string }
const sign = (payload: string, key: string) => createHmac("sha256", key).update(`homepage-engagement-v1\0${payload}`).digest("base64url");
/** Only non-admin SSR visits receive a ticket. No extra DB lookup per batch. */
export function issueHomepageEngagementTicket(editionId: string | null | undefined, enabled: boolean, now = Date.now(), key = process.env.DATABASE_URL): HomepageEngagementTicket | null {
  if (!editionId || !enabled || !key) return null;
  const viewId = randomUUID();
  const payload = Buffer.from(JSON.stringify({ editionId, viewId, expiresAt: now + 2 * 3_600_000 })).toString("base64url");
  return { viewId, token: `${payload}.${sign(payload, key)}` };
}
export function verifyHomepageEngagementTicket(token: unknown, editionId: string, viewId: string, now = Date.now(), key = process.env.DATABASE_URL): boolean {
  if (!key || typeof token !== "string" || token.length > 1000) return false;
  const parts = token.split("."); if (parts.length !== 2) return false;
  const expected = Buffer.from(sign(parts[0], key)); const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const body = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return body.editionId === editionId && body.viewId === viewId && Number.isSafeInteger(body.expiresAt) && now < body.expiresAt;
  } catch { return false; }
}
