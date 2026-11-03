import type { EditorialCandidate } from "./editorial-selection.ts";
import {
  recommendationBlockers,
  type RecommendationChannel,
} from "./recommendation-policy.ts";

export type WorkChannel = "whatsapp" | "stories" | "instagram_feed";
export type DraftState =
  | "editing"
  | "review"
  | "prepared"
  | "published"
  | "archived";
export interface DraftInput {
  id: string;
  expectedVersion: number;
  kind: "offer" | "content";
  channel: WorkChannel;
  title: string;
  productId: string | null;
  optionKey: string | null;
  sourceUrl: string;
  content: {
    text: string;
    notes: string;
    observationId: string;
    evidenceFingerprint: string;
    assetIds: string[];
  };
  legacyRef?: string;
}
export interface WorkDraft extends Omit<DraftInput, "expectedVersion"> {
  version: number;
  state: DraftState;
  authorId: string;
  publicationId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface OfferReference {
  productId: string;
  optionKey: string | null;
  observationId: string;
  evidenceFingerprint: string;
}
export interface WorkspaceOffer {
  candidate: EditorialCandidate;
  reference: OfferReference;
  blockers: Record<"whatsapp" | "stories", string[]>;
  shareUrl?: string;
  storyUrl?: string;
  shortCode?: string;
  bioCode?: string;
  watchersCount?: number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const id = /^[a-zA-Z0-9_-]{1,120}$/;
export function friendlyWorkspaceBlocker(reason: string): string {
  const dimensions: Record<string, string> = {
    audience: "adequação ao público",
    utility: "utilidade",
    value: "valor da oferta",
    confidence: "confiança",
    clarity: "clareza da compra",
  };
  const match = reason.match(
    /^Indicação direta exige avaliação forte: (\w+)\.$/,
  );
  return match
    ? `Reforce a avaliação de ${dimensions[match[1]!] ?? "esta indicação"} antes de divulgar.`
    : reason;
}
export const validDraftId = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
const bounded = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
export function validateDraft(raw: unknown): DraftInput | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as DraftInput;
  if (
    !validDraftId(p.id) ||
    !Number.isSafeInteger(p.expectedVersion) ||
    p.expectedVersion < 0 ||
    !["offer", "content"].includes(p.kind) ||
    !["whatsapp", "stories", "instagram_feed"].includes(p.channel) ||
    !bounded(p.title, 250) ||
    !bounded(p.sourceUrl, 2000) ||
    (p.productId !== null &&
      (typeof p.productId !== "string" || !id.test(p.productId))) ||
    (p.optionKey !== null &&
      (typeof p.optionKey !== "string" || !/^[a-f0-9]{32}$/.test(p.optionKey)))
  )
    return null;
  const c = p.content;
  if (
    !c ||
    !bounded(c.text, 10000) ||
    !bounded(c.notes, 6000) ||
    !bounded(c.observationId, 120) ||
    !bounded(c.evidenceFingerprint, 20000) ||
    !Array.isArray(c.assetIds) ||
    c.assetIds.length > 12 ||
    c.assetIds.some((v) => typeof v !== "string" || !id.test(v))
  )
    return null;
  if (p.sourceUrl) {
    try {
      const u = new URL(p.sourceUrl);
      if (u.protocol !== "https:" || u.username || u.password) return null;
    } catch {
      return null;
    }
  }
  if (
    p.legacyRef !== undefined &&
    (!bounded(p.legacyRef, 150) || !p.legacyRef.trim())
  )
    return null;
  // Whitelist persisted fields: credentials and server-owned states never enter a draft.
  return {
    id: p.id,
    expectedVersion: p.expectedVersion,
    kind: p.kind,
    channel: p.channel,
    title: p.title,
    productId: p.productId,
    optionKey: p.optionKey,
    sourceUrl: p.sourceUrl,
    content: {
      text: c.text,
      notes: c.notes,
      observationId: c.observationId,
      evidenceFingerprint: c.evidenceFingerprint,
      assetIds: [...c.assetIds],
    },
    ...(p.legacyRef ? { legacyRef: p.legacyRef } : {}),
  };
}
export function workspaceOffer(candidate: EditorialCandidate): WorkspaceOffer {
  const evidence = candidate.offerEvidence as any;
  if (
    candidate.offerOptionKey &&
    evidence?.packageQuantity &&
    Array.isArray(evidence.packageContents)
  )
    candidate = {
      ...candidate,
      purchaseContents: `${evidence.packageQuantity} un. · ${evidence.packageContents.join("; ")}`,
    };
  const blockers = (channel: RecommendationChannel) =>
    recommendationBlockers(candidate, channel).map(friendlyWorkspaceBlocker);
  return {
    candidate,
    reference: {
      productId: candidate.id,
      optionKey: candidate.offerOptionKey ?? null,
      observationId:
        candidate.evidenceObservationId ?? candidate.latestObservationId ?? "",
      evidenceFingerprint: candidate.evidenceFingerprint,
    },
    blockers: { whatsapp: blockers("whatsapp"), stories: blockers("stories") },
  };
}
export function contextualOffers(
  offers: WorkspaceOffer[],
  query: string,
  state = "all",
  channel: "whatsapp" | "stories" = "whatsapp",
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\borganiz[a-z]*/g, "organiz")
      .replace(
        /\b(?:iluminacao|iluminar|luminaria|luminarias|luz|luzes)\b/g,
        "ilumin",
      );
  const terms = normalize(query)
    .split(/\s+/)
    .filter(
      (t) =>
        t &&
        ![
          "a",
          "o",
          "as",
          "os",
          "de",
          "da",
          "do",
          "das",
          "dos",
          "para",
          "com",
          "e",
        ].includes(t),
    );
  return offers.filter((o) => {
    if (
      (state === "ready" && o.blockers[channel].length) ||
      (state === "review" && !o.blockers[channel].length)
    )
      return false;
    const c = o.candidate;
    const haystack = normalize(
      [
        c.title,
        c.displayTitle,
        c.category,
        c.benefit,
        c.purchaseContents,
        c.assessment?.benefit,
        c.assessment?.audience,
        c.assessment?.purchaseContents,
        c.assessment?.publicRationale,
        c.offerOptionLabel,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
}
export function sourceProduct(value: string): {
  marketplace: "mercadolivre" | "shopee" | "aliexpress";
  externalId: string;
  url: string;
} | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    if (/(^|\.)mercadolivre\.com\.br$/.test(u.hostname)) {
      const match = u.pathname.match(/\b(MLB)-?(\d{6,})/i);
      return match
        ? {
            marketplace: "mercadolivre",
            externalId: `MLB${match[2]}`,
            url: u.toString(),
          }
        : null;
    }
    if (/(^|\.)shopee\.com\.br$/.test(u.hostname)) {
      const match = u.pathname.match(/(?:-i\.|\/product\/)(\d+)[./](\d+)/);
      return match
        ? { marketplace: "shopee", externalId: match[2]!, url: u.toString() }
        : null;
    }
    if (/(^|\.)aliexpress\.(com|com\.br)$/.test(u.hostname)) {
      const match = u.pathname.match(/\/item\/(\d+)\.html/);
      return match
        ? {
            marketplace: "aliexpress",
            externalId: match[1]!,
            url: u.toString(),
          }
        : null;
    }
  } catch {
    /* An incomplete/shortened URL needs its canonical source. */
  }
  return null;
}
export function workspaceError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (/UNSUPPORTED_URGENCY_CLAIM/.test(code))
    return "Revise o texto: promessas como “só hoje” e “últimas unidades” precisam de comprovação. Seu rascunho está preservado.";
  if (/UNSUPPORTED_PRICE_CLAIM|CLAIM_NOT_CURRENT/.test(code))
    return "Confira o preço escrito e as comparações no texto. Eles precisam corresponder à oferta e às evidências atuais.";
  if (/MISSING_RIGHTS_FOR_ASSET|asset_rights_required/.test(code))
    return "Confira a origem e a permissão de uso comercial da imagem neste canal.";
  if (/EDITORIAL_REVIEW_REQUIRED/.test(code))
    return "A indicação ou as regras do canal mudaram. Confira a oferta antes de aprovar ou exportar novamente.";
  if (/account_credentials_missing|link_unavailable/.test(code))
    return "O link desta oferta ainda não está pronto. Confira a conexão da loja e prepare o link na página da oferta.";
  if (/marketplace_disabled/.test(code))
    return "A integração desta loja ainda não está habilitada para gerar links neste ambiente.";
  if (/conflict|evidence_changed|FACTS_CHANGED|option_changed/.test(code))
    return "Há novos dados ou outra revisão. Seu texto foi preservado; confira a versão atual antes de continuar.";
  if (/forbidden|owner_required|unauthorized/.test(code))
    return "Esta ação exige acesso à conta e a permissão do responsável.";
  if (
    /schema_required|migration_required|commercial_rollout_not_ready/.test(code)
  )
    return "Esta capacidade ainda não está disponível para sua conta. O restante do trabalho continua acessível.";
  if (/stale|EVIDENCE_STALE|offer_unavailable/.test(code))
    return "A oferta precisa de nova conferência antes de preparar este material.";
  if (/policy_required/.test(code))
    return "Defina o público da sua conta para preparar a divulgação.";
  if (/invalid_input|invalid_draft|input_too_large/.test(code))
    return "Confira os campos e os limites de texto antes de salvar.";
  if (/product_rejected/.test(code))
    return "Esta oferta já foi rejeitada na revisão da conta. Consulte a fila de revisão antes de reconsiderá-la.";
  if (/quota|entitlement|plan/.test(code))
    return "Esta operação depende dos limites e da habilitação da conta. Consulte suas configurações.";
  if (/private|not_found/.test(code))
    return "O material não está disponível nesta conta ou para este usuário.";
  return "Não foi possível concluir agora. Seu rascunho foi preservado; tente novamente.";
}
