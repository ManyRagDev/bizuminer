import { createHmac, timingSafeEqual } from "node:crypto";
import { buildAffiliateLink } from "../../capture/src/adapters/mercadolivre/affiliate-link.ts";
import { validTenantId } from "./tenant-db.ts";

export type MlPautaConfig = { tracking_id: string; tool_id: string };

export function httpsShopUrl(value: string | null, hosts: string[]): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url : null;
  } catch { return null; }
}

/** The click resolves the captured listing, preserving the actual item on catalog URLs. */
export function buildPautaMlTarget(productUrl: string, externalId: string, config: MlPautaConfig): string | null {
  const url = httpsShopUrl(productUrl, ["mercadolivre.com.br"]);
  if (!url || !config.tracking_id || !config.tool_id) return null;
  const wid = url.searchParams.get("wid");
  const listing = wid ?? (!url.pathname.includes("/p/") ? url.pathname.match(/MLB-?(\d{6,})/i)?.[1] : undefined);
  const listingId = listing?.replace(/^MLB-?/i, "");
  if (!listingId || listingId !== externalId.replace(/^MLB-?/i, "")) return null;
  url.search = "";
  url.hash = "";
  if (wid) url.searchParams.set("wid", wid);
  const link = buildAffiliateLink({
    productUrl: url.href, itemId: externalId, trackingId: config.tracking_id,
    toolId: config.tool_id, subId: `pauta-${externalId}`,
  });
  return link?.attributionVerified ? link.url : null;
}

const validProductId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
// Use the same server-only key source as homepage engagement, with a distinct HMAC context.
const sign = (payload: string, key: string) =>
  createHmac("sha256", key).update(`pauta-link-v1\0${payload}`).digest("base64url");

export function issuePautaLink(tenantId: string, productId: string, key = process.env.DATABASE_URL): string | null {
  if (!key || !validTenantId(tenantId) || !validProductId(productId)) return null;
  const payload = Buffer.from(JSON.stringify([tenantId, productId])).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyPautaLink(token: string, key = process.env.DATABASE_URL) {
  if (!key || !/^[a-zA-Z0-9_-]{1,260}\.[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split(".");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload, key)))) return null;
  try {
    const body: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Array.isArray(body) && body.length === 2 && validTenantId(body[0]) && validProductId(body[1])) {
      return { tenantId: body[0], productId: body[1] };
    }
  } catch { /* Malformed payloads are invalid links. */ }
  return null;
}
