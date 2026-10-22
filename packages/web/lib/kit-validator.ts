/**
 * Validador e Guardião de Revisões de Kit Comercial (EP-06 / C-02 / C-04 / T11 / T12).
 *
 * Bloqueia afirmações de urgência sem fonte, claims de recorde sem evidência E3 e alegação autorizada,
 * ausência de disclosure de afiliado e uso comercial de assets sem direitos autorizados.
 */

import { calculateKitContentDigest, type CommercialKitRevision, type KitMaterial, type KitSnapshot } from "./commerce-contract.ts";

export const VALIDATOR_VERSION = "kit-validator-v2";

export interface ValidationIssue {
  readonly code:
    | "MISSING_AFFILIATE_DISCLOSURE"
    | "UNSUPPORTED_URGENCY_CLAIM"
    | "UNSUPPORTED_PRICE_CLAIM"
    | "MISSING_PRICE_SOURCE"
    | "MISSING_RIGHTS_FOR_ASSET"
    | "INVALID_OR_MISSING_LINK";
  readonly message: string;
  readonly channel?: string;
}

export interface KitValidationResult {
  readonly valid: boolean;
  readonly result: "valid" | "invalid" | "unknown";
  readonly blockers: readonly ValidationIssue[];
  readonly inputDigest: string;
  readonly checkedAt: string;
  readonly validUntil: string;
  readonly validatorVersion: string;
}

const FORBIDDEN_URGENCY_PATTERNS = [
  /\bsó hoje\b/i,
  /\bso hoje\b/i,
  /\búltimas unidades\b/i,
  /\bultimas unidades\b/i,
  /\besgotando\b/i,
  /\bacabando\b/i,
  /\bqueima de estoque\b/i,
  /\bcorre\b/i,
  /\burgente\b/i,
];

const LOWEST_PRICE_PATTERNS = [
  /\bmenor pre[çc]o\b/i,
  /\bhistoric[ao]\b/i,
  /\bmetade do pre[çc]o\b/i,
  /\bmínimo histórico\b/i,
  /\bminimo historico\b/i,
];

/**
 * Valida integralmente uma revisão de kit comercial contra as regras de conformidade e integridade.
 */
export function validateCommercialKitRevision(params: {
  snapshot: KitSnapshot;
  claims: readonly unknown[];
  materials: readonly KitMaterial[];
  evidenceLevel: "E0" | "E1" | "E2" | "E3";
  imageRights?: "allowed" | "house_owned" | "house_created" | "merchant_provided" | "authorized_stock" | "unknown" | "forbidden";
  now?: Date;
}): KitValidationResult {
  const {
    snapshot,
    claims,
    materials,
    evidenceLevel,
    imageRights = "unknown",
    now = new Date(),
  } = params;

  const blockers: ValidationIssue[] = [];
  const inputDigest = calculateKitContentDigest(snapshot, claims, materials);

  // 1. Validar fonte e integridade básica de preço
  if (!snapshot.priceCents || snapshot.priceCents <= 0 || !snapshot.productUrl) {
    blockers.push({
      code: "MISSING_PRICE_SOURCE",
      message: "Preço observado ou URL de origem da oferta ausente no snapshot.",
    });
  }

  // 2. Validar cada material de canal
  for (const material of materials) {
    const textToScan = `${material.shortCopy} ${material.longCopy || ""} ${material.cta}`;

    // 2.1 Disclosure de afiliado obrigatório
    const hasDisclosure =
      material.disclosure &&
      /afiliad|comiss|parceir/i.test(material.disclosure);

    if (!hasDisclosure) {
      blockers.push({
        code: "MISSING_AFFILIATE_DISCLOSURE",
        message: `Material do canal ${material.channel} não possui disclosure explícito de afiliado.`,
        channel: material.channel,
      });
    }

    // 2.2 Bloqueio de urgência sem suporte (T11)
    for (const pattern of FORBIDDEN_URGENCY_PATTERNS) {
      if (pattern.test(textToScan)) {
        blockers.push({
          code: "UNSUPPORTED_URGENCY_CLAIM",
          message: `Texto do canal ${material.channel} contém alegação de urgência sem fonte comprovada: "${pattern.source}".`,
          channel: material.channel,
        });
        break;
      }
    }

    // 2.3 Bloqueio de claim de menor preço sem E3 e alegação homologada (C-02 / T12)
    for (const pattern of LOWEST_PRICE_PATTERNS) {
      if (pattern.test(textToScan)) {
        if (evidenceLevel !== "E3" || !claims.some(claim=> {
          const c=claim as {type?:string;textParameters?:{currentPriceCents?:number;priorMinCents?:number}};
          return c?.type==="historical_observed_minimum" && c.textParameters?.currentPriceCents===snapshot.priceCents
            && (c.textParameters?.priorMinCents??0)>=snapshot.priceCents;
        })) {
          blockers.push({
            code: "UNSUPPORTED_PRICE_CLAIM",
            message: `Alegação de menor preço no canal ${material.channel} requer evidência E3 homologada (atual: ${evidenceLevel}).`,
            channel: material.channel,
          });
          break;
        }
      }
    }

    // Price literals in editable copy must agree with the stored factual price.
    for(const match of textToScan.matchAll(/(?:R\$\s*(\d[\d.,]*)|(\d[\d.,]*)\s+BRL)/gi)) {
      const raw=match[1]??match[2]!;
      const parsed=Number(raw.includes(",") ? raw.replaceAll(".","").replace(",",".") : raw);
      if(snapshot.currency!=="BRL" || !Number.isFinite(parsed) || Math.round(parsed*100)!==snapshot.priceCents)
        blockers.push({code:"UNSUPPORTED_PRICE_CLAIM",message:"Preço escrito diverge da oferta observada.",channel:material.channel});
    }

    // 2.4 Direitos de imagem para canais com artes visuais (G-RIGHTS)
    if (material.assetRefs && material.assetRefs.length > 0) {
      const authorizedRights = new Set([
        "allowed",
        "house_owned",
        "house_created",
        "merchant_provided",
        "authorized_stock",
      ]);
      if (!authorizedRights.has(imageRights)) {
        blockers.push({
          code: "MISSING_RIGHTS_FOR_ASSET",
          message: `Uso de asset visual no canal ${material.channel} bloqueado por ausência de autorização de direitos de imagem (status: ${imageRights}).`,
          channel: material.channel,
        });
      }
    }
  }

  const valid = blockers.length === 0;
  const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24h TTL de validação

  return {
    valid,
    result: valid ? "valid" : "invalid",
    blockers,
    inputDigest,
    checkedAt: now.toISOString(),
    validUntil,
    validatorVersion: VALIDATOR_VERSION,
  };
}

/**
 * Revalida o snapshot antes da exportação ou confirmação, detectando deriva factual de preço.
 */
export function revalidateKitBeforeExport(params: {
  snapshot: KitSnapshot;
  currentObservedPriceCents: number;
  validationValidUntil: string;
  now?: Date;
}): { canExport: boolean; driftReasons: string[] } {
  const {
    snapshot,
    currentObservedPriceCents,
    validationValidUntil,
    now = new Date(),
  } = params;

  const driftReasons: string[] = [];

  // Checar deriva factual de preço
  if (snapshot.priceCents !== currentObservedPriceCents) {
    driftReasons.push(
      `Preço variou entre a criação do kit (R$ ${(snapshot.priceCents / 100).toFixed(2)}) e a exportação (R$ ${(currentObservedPriceCents / 100).toFixed(2)}). Necessário criar nova revisão.`,
    );
  }

  // Checar expiração do TTL de validação
  if (!Number.isFinite(new Date(validationValidUntil).getTime()) || now.getTime() >= new Date(validationValidUntil).getTime()) {
    driftReasons.push("Validação do kit expirou. É necessária uma nova validação formal.");
  }

  return {
    canExport: driftReasons.length === 0,
    driftReasons,
  };
}

export interface KitArtifactImageSpec {
  readonly assetRef: string;
  readonly rightsStatus?:
    | "house_created"
    | "merchant_provided"
    | "authorized_stock"
    | "house_owned"
    | "allowed"
    | "unknown"
    | "forbidden"
    | string;
  readonly sourceRef?: string;
  readonly format?: "story" | "feed" | "banner" | string;
  readonly dimensions?: { readonly width: number; readonly height: number };
}

export interface KitArtifactLayoutSpec {
  readonly format: "story" | "feed" | "banner";
  readonly hasDisclosure: boolean;
  readonly disclosureText?: string;
  readonly images: readonly KitArtifactImageSpec[];
  readonly contrastRatio?: number;
}

/**
 * Validador estrito de layout e direitos de artefato de kit (AC-17.3).
 *
 * Exige:
 * 1. Aviso de divulgação/afiliado presente no layout;
 * 2. Direitos de imagem declarados com proveniência autorizada (house_created, merchant_provided, authorized_stock);
 * 3. Contraste mínimo legível para conformidade editorial.
 */
export function validateKitArtifacts(layout: KitArtifactLayoutSpec): {
  readonly valid: boolean;
  readonly blockers: readonly string[];
} {
  const blockers: string[] = [];

  // 1. Disclosure de afiliado obrigatório no layout
  if (
    !layout.hasDisclosure ||
    !layout.disclosureText?.trim() ||
    !/afiliad|comiss|parceir/i.test(layout.disclosureText)
  ) {
    blockers.push(
      "MISSING_AFFILIATE_DISCLOSURE: O aviso de divulgação/afiliado é obrigatório no layout.",
    );
  }

  // 2. Direitos de imagens declarados
  const authorizedLicenses = new Set([
    "house_created",
    "merchant_provided",
    "authorized_stock",
    "house_owned",
    "allowed",
  ]);

  for (const img of layout.images) {
    if (!img.rightsStatus || !authorizedLicenses.has(img.rightsStatus)) {
      blockers.push(
        `MISSING_RIGHTS_FOR_ASSET: Imagem ${img.assetRef} não possui licença/direitos válidos declarados (status: ${img.rightsStatus ?? "ausente"}). Exige-se: house_created, merchant_provided ou authorized_stock.`,
      );
    }
  }

  // 3. Contraste mínimo
  if (layout.contrastRatio !== undefined && layout.contrastRatio < 3.0) {
    blockers.push(
      `INSUFFICIENT_CONTRAST: Contraste do layout (${layout.contrastRatio.toFixed(1)}:1) abaixo do mínimo exigido de 3.0:1.`,
    );
  }

  return {
    valid: blockers.length === 0,
    blockers,
  };
}

