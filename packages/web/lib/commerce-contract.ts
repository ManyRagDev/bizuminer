/**
 * Contrato de campanhas comerciais, kits, publicações sociais e links de 12 caracteres (EP-04 / C-04 / C-05 / C-06).
 */

import { createHash, randomBytes } from "node:crypto";
import { SHORT_CODE_ALPHABET } from "./short-code.ts";

export const VALID_CAMPAIGN_STATUSES = ["draft", "active", "archived"] as const;
export type CampaignStatus = typeof VALID_CAMPAIGN_STATUSES[number];

export const VALID_KIT_STATUSES = ["draft", "validating", "needs_revision", "approved", "invalidated", "archived"] as const;
export type CommercialKitStatus = typeof VALID_KIT_STATUSES[number];

export const VALID_PUBLICATION_STATUSES = ["planned", "ready", "exported", "published_confirmed", "cancelled", "expired", "failed"] as const;
export type PublicationStatus = typeof VALID_PUBLICATION_STATUSES[number];

export const VALID_MONETIZATION_STATUSES = ["reserved", "valid", "invalid", "revoked"] as const;
export type MonetizationStatus = typeof VALID_MONETIZATION_STATUSES[number];

export const VALID_CHANNEL_TYPES = [
  "whatsapp_channel",
  "whatsapp_group",
  "telegram_channel",
  "instagram_feed",
  "instagram_stories",
  "internal_web",
] as const;

export const VALID_DESTINATION_KINDS = [
  "internal_bizu",
  "direct_affiliate",
  "marketplace_card",
] as const;

export interface KitMaterial {
  readonly channel: string;
  readonly shortCopy: string;
  readonly longCopy?: string;
  readonly cta: string;
  readonly disclosure: string;
  readonly assetRefs: readonly string[];
  readonly campaignLinkId?: string;
}

export interface KitSnapshot {
  readonly productId: string;
  readonly title: string;
  readonly priceCents: number;
  readonly originalPriceCents?: number;
  readonly currency: string;
  readonly observedAt: string;
  readonly validUntil: string;
  readonly productUrl: string;
  readonly imageUrl?: string;
  readonly reasons: readonly string[];
}

export interface Campaign {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly objective: string;
  readonly audiencePolicyVersionId?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly status: CampaignStatus;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CommercialKit {
  readonly id: string;
  readonly tenantId: string;
  readonly campaignId: string;
  readonly opportunityId: string;
  readonly currentRevision: number;
  readonly version: number;
  readonly status: CommercialKitStatus;
  readonly createdAt: string;
}

export interface CommercialKitRevision {
  readonly id: string;
  readonly tenantId: string;
  readonly kitId: string;
  readonly revision: number;
  readonly snapshot: KitSnapshot;
  readonly claims: readonly unknown[];
  readonly materials: readonly KitMaterial[];
  readonly templateVersion: string;
  readonly promptVersion?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly contentDigest: string;
}

export interface CampaignPublication {
  readonly id: string;
  readonly tenantId: string;
  readonly campaignId: string;
  readonly kitId: string;
  readonly kitRevisionId: string;
  readonly destinationId: string;
  readonly channel: string;
  readonly version: number;
  readonly status: PublicationStatus;
  readonly scheduledAt?: string;
  readonly exportedAt?: string;
  readonly publishedAt?: string;
  readonly confirmationSource?: string;
  readonly publicationUrl?: string;
  readonly failureCode?: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CampaignLink {
  readonly id: string;
  readonly tenantId: string;
  readonly publicationId: string;
  readonly webPublicationId?: string;
  readonly code: string;
  readonly targetUrl?: string;
  readonly monetizationStatus: MonetizationStatus;
  readonly capabilityVersion: string;
  readonly validatedAt?: string;
  readonly revokedAt?: string;
  readonly createdAt: string;
}

/**
 * Alfabeto canônico e tamanho de 12 caracteres para links de campanha (C-06).
 * Distingue-se deterministamente dos 4 caracteres de links antigos da casa.
 */
export const CAMPAIGN_LINK_CODE_LENGTH = 12;

export function generateCampaignLinkCode(): string {
  const bytes = randomBytes(CAMPAIGN_LINK_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CAMPAIGN_LINK_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i]! % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

export function isCampaignLinkCode(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== CAMPAIGN_LINK_CODE_LENGTH) {
    return false;
  }
  for (let i = 0; i < value.length; i++) {
    if (!SHORT_CODE_ALPHABET.includes(value[i]!)) return false;
  }
  return true;
}

/**
 * Calcula o hash determinístico SHA-256 do conteúdo da revisão de kit.
 */
export function calculateKitContentDigest(
  snapshot: KitSnapshot,
  claims: readonly unknown[],
  materials: readonly KitMaterial[],
): string {
  return calculateContentDigest({
    snapshot,
    claims,
    materials,
  });
}

/**
 * Hash determinístico de payload arbitrário (ordena chaves de objetos rasos ou recursivos).
 */
export function calculateContentDigest(payload: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]));
    }
    return value;
  };
  const json = JSON.stringify(canonical(payload));
  if (json === undefined) throw new Error("invalid_digest_payload");
  return createHash("sha256").update(json).digest("hex");
}
