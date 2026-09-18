/**
 * Contrato de grupo editorial (M4-D) — agrupamento puro, sem banco.
 *
 * A unidade de trabalho da curadoria é o grupo de semelhantes, não o produto.
 * Este módulo deriva grupos a partir dos fatos da fila: produtos da mesma
 * família (key/método/versão do classificador) formam um grupo por tenant;
 * produtos sem família reconhecida permanecem singulares — nunca num balde
 * "outros".
 *
 * O `groupId` é determinístico (tenant + família + método/versão) para que
 * ações em lote e snapshots referenciem o mesmo grupo sem estado extra.
 * Representantes (até 5) seguem a ordenação padrão de evidência `[EVAL]`:
 * M4-E pode substituir o critério sem mudar o contrato.
 */

export const GROUP_REPRESENTATIVE_LIMIT = 5;

export interface GroupMemberProduct {
  readonly tenantId: string;
  readonly productId: string;
  readonly marketplace: string;
  readonly family: {
    readonly key: string;
    readonly label?: string;
    readonly method: string;
    readonly version: string;
  } | null;
  /** Status atual de curadoria do produto (estado de vida do grupo). */
  readonly status: string;
  readonly observedAt: string;
  readonly priceCents: number;
  readonly ratingStar: number | null;
  readonly salesLabel: string | null;
  readonly salesCount: number | null;
  readonly observationCount: number;
  readonly lowestVerified: boolean;
}

export interface EditorialGroup {
  readonly groupId: string;
  readonly tenantId: string;
  readonly familyKey: string;
  readonly familyLabel: string;
  readonly familyMethod: string;
  readonly familyVersion: string;
  readonly state: "open" | "resolved";
  readonly memberProductIds: readonly string[];
  readonly representatives: readonly string[];
  readonly memberCount: number;
  readonly confidence: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly marketplaceDistribution: Record<string, number>;
  readonly priceRange: { readonly minCents: number; readonly maxCents: number };
  readonly groupingReason: string;
}

export interface EditorialGroupOverview {
  readonly groups: readonly EditorialGroup[];
  readonly singularProductIds: readonly string[];
  readonly withoutFamilyCount: number;
}

/** Grupos de mesma família são fechados quando todos os membros saíram da fila. */
const OPEN_STATUSES = new Set(["pending", "legacy_visible", "held"]);

function fnv1a64(input: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}

/** Identidade canônica do grupo; deve ser recalculada no servidor, nunca aceita por confiança. */
export function editorialGroupIdFor(
  tenantId: string,
  familyKey: string,
  method: string,
  version: string,
): string {
  const base = `${tenantId}|${familyKey}|${method}|${version}`;
  return `grp_${fnv1a64(base).toString(16).padStart(16, "0")}`;
}

export function matchesEditorialGroup(
  groupId: string,
  tenantId: string,
  family: { readonly key: string; readonly method: string; readonly version: string } | null,
): boolean {
  return family !== null
    && groupId === editorialGroupIdFor(tenantId, family.key, family.method, family.version);
}

function compareEvidence(a: GroupMemberProduct, b: GroupMemberProduct): number {
  const rank = (p: GroupMemberProduct) =>
    [p.lowestVerified ? 1 : 0, p.ratingStar ?? 0, p.salesCount ?? 0, p.observationCount];
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return rb[i] - ra[i];
  }
  return a.productId.localeCompare(b.productId);
}

/** Ordenação padrão por evidência e variação (M4-E). */
export function selectRepresentatives(
  members: readonly GroupMemberProduct[],
  limit = GROUP_REPRESENTATIVE_LIMIT,
): readonly string[] {
  if (members.length === 0) return [];
  const max = Math.max(1, limit);
  const sorted = [...members].sort(compareEvidence);
  if (sorted.length <= max) return sorted.map((m) => m.productId);

  // Variação por marketplace: primeiro representante é o melhor absoluto por evidência.
  // Para os próximos slots, seleciona os melhores candidatos de lojas ainda não representadas.
  const selected: GroupMemberProduct[] = [sorted[0]!];
  const seenMarketplaces = new Set<string>([sorted[0]!.marketplace]);
  const remaining = sorted.slice(1);

  for (let i = 0; i < remaining.length && selected.length < max; i++) {
    const candidate = remaining[i]!;
    if (!seenMarketplaces.has(candidate.marketplace)) {
      selected.push(candidate);
      seenMarketplaces.add(candidate.marketplace);
      remaining.splice(i, 1);
      i--;
    }
  }

  while (selected.length < max && remaining.length > 0) {
    selected.push(remaining.shift()!);
  }

  return selected.map((m) => m.productId);
}

export function editorialGroupsFor(
  products: readonly GroupMemberProduct[],
): EditorialGroupOverview {
  const byGroup = new Map<string, GroupMemberProduct[]>();
  const singulars: string[] = [];

  for (const product of products) {
    if (!product.family) {
      singulars.push(product.productId);
      continue;
    }
    const family = product.family;
    const id = editorialGroupIdFor(product.tenantId, family.key, family.method, family.version);
    const bucket = byGroup.get(id) ?? [];
    bucket.push(product);
    byGroup.set(id, bucket);
  }

  const groups: EditorialGroup[] = [];
  for (const [groupId, members] of byGroup) {
    const first = members[0]!;
    const family = first.family!;
    const times = members.map((member) => member.observedAt).sort();
    const open = members.some((member) => OPEN_STATUSES.has(member.status));

    const marketplaceDistribution: Record<string, number> = {};
    for (const member of members) {
      marketplaceDistribution[member.marketplace] = (marketplaceDistribution[member.marketplace] ?? 0) + 1;
    }

    const prices = members.map((m) => m.priceCents);
    const minCents = Math.min(...prices);
    const maxCents = Math.max(...prices);

    groups.push({
      groupId,
      tenantId: first.tenantId,
      familyKey: family.key,
      familyLabel: family.label ?? family.key,
      familyMethod: family.method,
      familyVersion: family.version,
      state: open ? "open" : "resolved",
      memberProductIds: members.map((member) => member.productId).sort(),
      representatives: selectRepresentatives(members),
      memberCount: members.length,
      confidence: null,
      createdAt: times[0] ?? "",
      updatedAt: times[times.length - 1] ?? "",
      marketplaceDistribution,
      priceRange: { minCents, maxCents },
      groupingReason: `Palavras-chave do título (${family.method} ${family.version})`,
    });
  }

  return {
    groups: groups.sort((a, b) => a.groupId.localeCompare(b.groupId)),
    singularProductIds: singulars.sort(),
    withoutFamilyCount: singulars.length,
  };
}
