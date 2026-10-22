/**
 * Contrato de Projeção da Bancada de Trabalho Unificada (EP-05 / C-03 / C-04).
 *
 * Agrupa o trabalho diário pendente por produto âncora:
 * - Curadoria humana pendente ou retida
 * - Evidência comparativa que exige revisão
 * - Oportunidade comercial qualificada
 * - Kit comercial aguardando validação, aprovação ou exportação
 *
 * Semântica temporal:
 * Cada ação possui seu `actionableSince` (UTC), indicando quando ela se tornou executável.
 * A ordenação padrão é estável: `actionableSince ASC, productId ASC` (pendência mais antiga primeiro).
 */

export type WorkbenchActionType =
  | "review_curation"
  | "review_evidence"
  | "monitor_radar"
  | "create_kit_draft"
  | "revise_kit"
  | "approve_kit"
  | "export_kit"
  | "confirm_publication"
  | "reconcile_publication"
  | "none";

export interface WorkbenchAction {
  readonly id: string;
  readonly actionType: WorkbenchActionType;
  readonly label: string;
  readonly href: string;
  readonly reason?: string;
  readonly actionableSince: string; // ISO 8601 UTC
  readonly opportunityId?: string;
  readonly audienceKey?: string;
  readonly channel?: string;
  readonly kitId?: string;
  readonly publicationId?: string;
  readonly suggestedDecision?: "approved" | "held" | "rejected";
}

export interface WorkbenchItem {
  readonly productId: string;
  readonly title: string;
  readonly marketplace: string;
  readonly externalId: string;
  readonly currentPriceCents: number;
  readonly imageUrl: string | null;
  readonly category: string | null;
  readonly familyKey: string | null;
  readonly primaryAction: WorkbenchAction;
  readonly subordinateActions: readonly WorkbenchAction[];
  readonly actionableSince: string; // Timestamp da pendência mais antiga executável
  readonly freshestObservedAt?: string;
}

export interface WorkbenchQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly filterActionType?: WorkbenchActionType;
  readonly filterMarketplace?: string;
}

export interface WorkbenchPage {
  readonly items: readonly WorkbenchItem[];
  readonly nextCursor: string | null;
  readonly totalProductsCount: number;
  readonly totalActionsCount: number;
}

/**
 * Prioridade determinística para eleger a ação primária quando um produto possui múltiplas pendências.
 * Menor valor numérico indica maior urgência de execução.
 */
export const ACTION_PRIORITY_RANK: Record<WorkbenchActionType, number> = {
  review_curation: 10,
  review_evidence: 20,
  approve_kit: 30,
  export_kit: 40,
  confirm_publication: 50,
  create_kit_draft: 60,
  revise_kit: 70,
  reconcile_publication: 80,
  monitor_radar: 90,
  none: 100,
};

/**
 * Compara duas ações: prioriza por urgência no funil de negócio,
 * e em caso de empate, pela pendência mais antiga executável (`actionableSince ASC`).
 */
export function compareWorkbenchActions(a: WorkbenchAction, b: WorkbenchAction): number {
  const prioA = ACTION_PRIORITY_RANK[a.actionType] ?? 999;
  const prioB = ACTION_PRIORITY_RANK[b.actionType] ?? 999;
  if (prioA !== prioB) return prioA - prioB;

  const timeA = new Date(a.actionableSince).getTime();
  const timeB = new Date(b.actionableSince).getTime();
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
    return timeA - timeB;
  }

  return a.id.localeCompare(b.id);
}

/**
 * Codifica cursor composto estável (actionableSince + productId) em base64url.
 */
export function encodeWorkbenchCursor(actionableSince: string, productId: string): string {
  return Buffer.from(`${actionableSince}|${productId}`, "utf-8").toString("base64url");
}

/**
 * Decodifica cursor composto. Retorna null se inválido.
 */
export function decodeWorkbenchCursor(cursor: string): { actionableSince: string; productId: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parts = raw.split("|");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { actionableSince: parts[0], productId: parts[1] };
  } catch {
    return null;
  }
}
