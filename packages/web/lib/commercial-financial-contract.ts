/**
 * Contratos e projeções financeiras comerciais (EP-08 / C-07).
 *
 * Regras normativas:
 * 1. Moeda explícita (padrão BRL).
 * 2. Ausência de valor não vira 0 (permanece null).
 * 3. Ledger append-only de comissões por obrigação/fonte; estorno referencia predecessor.
 * 4. Não somar pendente + confirmada + recebida como três receitas separadas.
 * 5. Receita SaaS (plataforma) é separada de comissões e custos e pertence à conta operadora.
 * 6. Custos de tempo humano em segundos sem tarifa não viram custo monetário zero.
 */

export const VALID_CONVERSION_SOURCES = ["manual", "report", "api"] as const;
export type ConversionSource = typeof VALID_CONVERSION_SOURCES[number];

export const VALID_VERIFICATION_LEVELS = ["declared", "documented", "provider_confirmed"] as const;
export type VerificationLevel = typeof VALID_VERIFICATION_LEVELS[number];

export const VALID_CONVERSION_STATUSES = ["reported", "pending", "confirmed", "cancelled", "refunded"] as const;
export type ConversionStatus = typeof VALID_CONVERSION_STATUSES[number];

export const VALID_COMMISSION_STATES = ["estimated", "pending", "confirmed", "reversed", "received"] as const;
export type CommissionState = typeof VALID_COMMISSION_STATES[number];

export const VALID_COST_KINDS = ["infrastructure", "ai", "messaging", "creative", "human_time"] as const;
export type CostKind = typeof VALID_COST_KINDS[number];

export const VALID_SAAS_REVENUE_STATES = ["billed", "received", "reversed"] as const;
export type SaaSRevenueState = typeof VALID_SAAS_REVENUE_STATES[number];

export interface Conversion {
  readonly id: string;
  readonly tenantId: string;
  readonly marketplace: string;
  readonly externalOrderId?: string | null;
  readonly externalItemId?: string | null;
  readonly occurredAt: string;
  readonly orderValueCents?: number | null;
  readonly currency: string;
  readonly source: ConversionSource;
  readonly evidenceRef?: string | null;
  readonly verification: VerificationLevel;
  readonly status: ConversionStatus;
  readonly version: number;
  readonly requestId?: string | null;
  readonly createdAt: string;
}

export interface ConversionAttribution {
  readonly conversionId: string;
  readonly tenantId: string;
  readonly campaignPublicationId?: string | null;
  readonly method: "unknown" | "manual_evidence" | "provider_subid";
  readonly confidence: "unknown" | "supported" | "confirmed";
  readonly evidenceRef?: string | null;
  readonly version: number;
}

export interface CommissionEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly conversionId?: string | null;
  readonly sourceKey: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly state: CommissionState;
  readonly occurredAt: string;
  readonly sourceRef: string;
  readonly predecessorId?: string | null;
  readonly createdAt: string;
}

export interface OperationalCost {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: CostKind;
  readonly amountCents?: number | null;
  readonly currency?: string | null;
  readonly durationSeconds?: number | null;
  readonly source: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly verification: string;
  readonly createdAt: string;
}

export interface SaaSRevenueEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly obligationKey: string;
  readonly eventKey: string;
  readonly contractRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly state: SaaSRevenueState;
  readonly occurredAt: string;
  readonly sourceRef: string;
  readonly predecessorId?: string | null;
  readonly createdAt: string;
}

export interface CommissionLedgerSummary {
  readonly currency: string;
  readonly estimatedCents: number;
  readonly pendingCents: number;
  readonly confirmedCents: number;
  readonly reversedCents: number;
  readonly receivedCashCents: number;
  readonly totalEntriesCount: number;
}

export interface SaaSRevenueSummary {
  readonly currency: string;
  readonly billedNetCents: number;
  readonly receivedCashCents: number;
  readonly reversedCents: number;
  readonly entriesCount: number;
}

export interface OperationalCostsSummary {
  readonly monetaryCostsByKindCents: Record<CostKind, number>;
  readonly totalMonetaryCostCents: number;
  readonly unallocatedHumanSeconds: number;
  readonly currency: string;
}

/**
 * Consolida o ledger de comissões sem somar múltiplos estados da mesma obrigação.
 */
export function calculateCommissionSummary(
  entries: readonly CommissionEntry[],
  targetCurrency = "BRL",
): CommissionLedgerSummary {
  const filtered = entries.filter((e) => e.currency === targetCurrency);

  let estimatedCents = 0;
  let pendingCents = 0;
  let confirmedCents = 0;
  let reversedCents = 0;
  let receivedCashCents = 0;

  const byId = new Map(filtered.map(e => [e.id,e]));
  const superseded = new Set(filtered.map(e => e.predecessorId).filter(Boolean));
  const root = (entry: CommissionEntry) => {
    const seen = new Set<string>(); let current = entry;
    while (current.predecessorId && byId.has(current.predecessorId) && !seen.has(current.id)) {
      seen.add(current.id); current = byId.get(current.predecessorId)!;
    }
    return current.id;
  };
  const groups = new Map<string, CommissionEntry[]>();
  for (const entry of filtered) { const key=root(entry); groups.set(key,[...(groups.get(key)??[]),entry]); }
  for (const group of groups.values()) {
    const current = group.filter(e=>!superseded.has(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).at(-1)!;
    if(current.state==='estimated') estimatedCents+=current.amountCents;
    if(current.state==='pending') pendingCents+=current.amountCents;
    if(current.state==='confirmed') confirmedCents+=current.amountCents;
    const receipt=group.filter(e=>e.state==='received').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).at(-1);
    if(receipt) receivedCashCents+=receipt.amountCents;
    for(const entry of group.filter(e=>e.state==='reversed')) {
      reversedCents+=entry.amountCents;
      let parent=entry.predecessorId ? byId.get(entry.predecessorId) : undefined;
      const seen=new Set<string>();
      while(parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        if(parent.state==='received') { receivedCashCents-=entry.amountCents; break; }
        parent=parent.predecessorId ? byId.get(parent.predecessorId) : undefined;
      }
    }
  }

  return {
    currency: targetCurrency,
    estimatedCents,
    pendingCents,
    confirmedCents,
    reversedCents,
    receivedCashCents,
    totalEntriesCount: filtered.length,
  };
}

/**
 * Consolida a receita SaaS (faturamento e caixa de assinaturas da plataforma).
 */
export function calculateSaaSRevenueSummary(
  entries: readonly SaaSRevenueEntry[],
  targetCurrency = "BRL",
): SaaSRevenueSummary {
  const filtered = entries.filter((e) => e.currency === targetCurrency);

  let billed = 0;
  let received = 0;
  let reversed = 0;

  const obligations = new Map<string,SaaSRevenueEntry[]>();
  for (const entry of filtered) obligations.set(entry.obligationKey,[...(obligations.get(entry.obligationKey)??[]),entry]);
  for(const group of obligations.values()) {
    const ordered=[...group].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    billed+=ordered.filter(e=>e.state==='billed').at(-1)?.amountCents??0;
    received+=ordered.filter(e=>e.state==='received').at(-1)?.amountCents??0;
    const byId=new Map(ordered.map(e=>[e.id,e]));
    for(const entry of ordered.filter(e=>e.state==='reversed')) {
      reversed+=entry.amountCents;
      let parent=entry.predecessorId ? byId.get(entry.predecessorId) : undefined;
      const seen=new Set<string>();
      while(parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        if(parent.state==='received') { received-=entry.amountCents; break; }
        parent=parent.predecessorId ? byId.get(parent.predecessorId) : undefined;
      }
    }
  }

  return {
    currency: targetCurrency,
    billedNetCents: billed - reversed,
    receivedCashCents: received,
    reversedCents: reversed,
    entriesCount: filtered.length,
  };
}

/**
 * Consolida custos operacionais distinguindo monetário de tempo sem tarifa.
 */
export function calculateOperationalCostsSummary(
  costs: readonly OperationalCost[],
  targetCurrency = "BRL",
): OperationalCostsSummary {
  const monetaryByKind: Record<CostKind, number> = {
    infrastructure: 0,
    ai: 0,
    messaging: 0,
    creative: 0,
    human_time: 0,
  };
  let totalMonetary = 0;
  let humanSecondsWithoutTariff = 0;

  for (const cost of costs) {
    if (cost.amountCents !== null && cost.amountCents !== undefined && cost.currency === targetCurrency) {
      monetaryByKind[cost.kind] += cost.amountCents;
      totalMonetary += cost.amountCents;
    } else if (cost.kind === "human_time" && cost.durationSeconds) {
      humanSecondsWithoutTariff += cost.durationSeconds;
    }
  }

  return {
    monetaryCostsByKindCents: monetaryByKind,
    totalMonetaryCostCents: totalMonetary,
    unallocatedHumanSeconds: humanSecondsWithoutTariff,
    currency: targetCurrency,
  };
}
