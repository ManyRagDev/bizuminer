/**
 * View-Model e Read-Model do Cockpit (EP-05: Pauta, Radar e Resultados).
 *
 * Consolida as três áreas operacionais fundamentais da plataforma:
 * 1. Pauta (oportunidades priorizadas para criação de kit e publicação).
 * 2. Radar (candidatos, monitorados, expirados e retidos com razões explícitas).
 * 3. Campanhas & Resultados (kits, revisões e métricas reais, com desconhecidos honestos).
 *
 * Contratos: C-03, C-04, C-07.
 */

export type CockpitNextAction =
  | "review_evidence"
  | "monitor"
  | "create_draft"
  | "revise_kit"
  | "approve"
  | "export"
  | "confirm"
  | "reconcile"
  | "none";

export interface CockpitActionDescriptor {
  readonly action: CockpitNextAction;
  readonly label: string;
  readonly href?: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export interface RadarItem {
  readonly id: string;
  readonly productId: string;
  readonly title: string;
  readonly priceCents: number;
  readonly state: "candidate" | "monitored" | "prioritized" | "held" | "archived";
  readonly opportunityClass: "recommendable" | "good_buy" | "special" | "gold" | "unclassified";
  readonly reasons: readonly string[];
  readonly unknowns: readonly string[];
  readonly evidenceLevel: "E0" | "E1" | "E2" | "E3";
  readonly nextAction: CockpitActionDescriptor;
  readonly validUntil?: string;
}

export interface PautaItem {
  readonly opportunityId: string;
  readonly productId: string;
  readonly title: string;
  readonly priceCents: number;
  readonly audienceKey: string;
  readonly channel: string;
  readonly opportunityClass: string;
  readonly kitStatus?: string;
  readonly currentRevision?: number;
  readonly nextAction: CockpitActionDescriptor;
}

export interface CampaignSummaryCard {
  readonly campaignId: string;
  readonly name: string;
  readonly objective: string;
  readonly status: "draft" | "active" | "archived";
  readonly kitsCount: number;
  readonly publicationsCount: number;
  readonly observedClicksCount: number;
  readonly salesMetricStatus: "unmonitored" | "declared_manual" | "integrated_reconciled";
  readonly declaredRevenueCents: number | null;
  readonly nextAction: CockpitActionDescriptor;
}

export interface CockpitSummary {
  readonly tenantId: string;
  readonly radar: {
    readonly candidatesCount: number;
    readonly monitoredCount: number;
    readonly heldCount: number;
    readonly missingEvidenceCount: number;
  };
  readonly pauta: {
    readonly prioritizedCount: number;
    readonly readyForKitDraftCount: number;
    readonly readyForApprovalCount: number;
    readonly readyForExportCount: number;
  };
  readonly campaigns: {
    readonly activeCampaignsCount: number;
    readonly draftCampaignsCount: number;
    readonly publicationsConfirmedCount: number;
  };
}

/**
 * Determina deterministicamente a próxima ação recomendada para uma oportunidade e seu kit.
 */
export function determineCockpitNextAction(params: {
  opportunityState: "candidate" | "monitored" | "prioritized" | "held" | "archived";
  opportunityClass?: string;
  evidenceLevel?: "E0" | "E1" | "E2" | "E3";
  hasKitDraft?: boolean;
  kitStatus?: "draft" | "validating" | "needs_revision" | "approved" | "invalidated" | "archived";
  publicationStatus?: "planned" | "ready" | "exported" | "published_confirmed" | "cancelled" | "expired" | "failed";
  hasValidMonetization?: boolean;
}): CockpitActionDescriptor {
  const {
    opportunityState,
    evidenceLevel,
    hasKitDraft,
    kitStatus,
    publicationStatus,
    hasValidMonetization,
  } = params;

  if (opportunityState === "archived") {
    return {
      action: "none",
      label: "Oportunidade arquivada",
      enabled: false,
      disabledReason: "Oportunidade encerrada ou descartada.",
    };
  }

  if (opportunityState === "candidate" || evidenceLevel === "E0") {
    return {
      action: "review_evidence",
      label: "Revisar evidências",
      enabled: true,
    };
  }

  if (opportunityState === "held" || opportunityState === "monitored") {
    return {
      action: "monitor",
      label: "Acompanhar radar",
      enabled: true,
    };
  }

  if (opportunityState === "prioritized" && !hasKitDraft) {
    return {
      action: "create_draft",
      label: "Criar rascunho de kit",
      enabled: true,
    };
  }

  if (kitStatus === "draft" || kitStatus === "needs_revision") {
    return {
      action: "revise_kit",
      label: "Revisar kit comercial",
      enabled: true,
    };
  }

  if (kitStatus === "validating") {
    return {
      action: "approve",
      label: "Aprovar kit",
      enabled: true,
    };
  }

  if (kitStatus === "approved") {
    if (publicationStatus === "planned" || publicationStatus === "ready") {
      if (hasValidMonetization === false) {
        return {
          action: "export",
          label: "Aguardando validação de link",
          enabled: false,
          disabledReason: "Link de monetização reservado sem credencial de canal validada.",
        };
      }
      return {
        action: "export",
        label: "Exportar material",
        enabled: true,
      };
    }

    if (publicationStatus === "exported") {
      return {
        action: "confirm",
        label: "Confirmar publicação",
        enabled: true,
      };
    }

    if (publicationStatus === "failed") {
      return {
        action: "reconcile",
        label: "Reconciliar falha de postagem",
        enabled: true,
      };
    }

    if (publicationStatus === "published_confirmed") {
      return {
        action: "none",
        label: "Publicado e confirmado",
        enabled: false,
      };
    }
  }

  return {
    action: "none",
    label: "Sem pendência imediata",
    enabled: false,
  };
}
