/**
 * DAL e Serviço de Políticas de Audiência, Oportunidades Comerciais e Radar (EP-03 / C-03).
 */

import type postgres from "postgres";
import {
  classifyOpportunity,
  rankOpportunities,
  type AudiencePolicyConfig,
  type Opportunity,
  type OpportunityClass,
  type OpportunityState,
} from "./opportunity-contract.ts";
import type { RubricAssessment } from "./rubric-contract.ts";
import type { PriceEvidence } from "./price-evidence.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

export interface AudiencePolicyRecord {
  id: string;
  tenantId: string;
  name: string;
  currentVersion: string | null;
  status: "draft" | "active" | "retired";
  createdAt: string;
}

export interface AudiencePolicyVersionRecord {
  id: string;
  policyId: string;
  tenantId: string;
  version: string;
  config: AudiencePolicyConfig;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface OpportunityWithProduct extends Opportunity {
  productTitle: string;
  marketplace: string;
  imageUrl: string | null;
  category: string | null;
  productUrl: string;
  currentPriceCents: number;
}

// 1. Políticas de Audiência -------------------------------------------------

export async function createAudiencePolicy(
  sql: Sql,
  tenantId: string,
  input: {
    name: string;
    status?: "draft" | "active";
  },
): Promise<{ id: string }> {
  const [row] = await sql<{ id: string }[]>`
    insert into garimpa.audience_policy (tenant_id, name, status)
    values (${tenantId}, ${input.name.trim()}, ${input.status ?? "draft"})
    returning id
  `;
  return row!;
}

export async function createAudiencePolicyVersion(
  sql: Sql,
  tenantId: string,
  input: {
    policyId: string;
    version: string;
    config: AudiencePolicyConfig;
    approvedBy?: string;
  },
): Promise<{ id: string }> {
  const approvedAt = input.approvedBy ? new Date().toISOString() : null;
  const [row] = await sql<{ id: string }[]>`
    insert into garimpa.audience_policy_version
      (policy_id, tenant_id, version, config, approved_by, approved_at)
    values
      (${input.policyId}, ${tenantId}, ${input.version}, ${sql.json(input.config as any)},
       ${input.approvedBy ?? null}, ${approvedAt})
    returning id
  `;

  if (input.approvedBy) {
    await sql`
      update garimpa.audience_policy
      set current_version = ${input.version}, status = 'active'
      where id = ${input.policyId} and tenant_id = ${tenantId}
    `;
  }

  return row!;
}

export async function getActiveAudiencePolicy(
  sql: Sql,
  tenantId: string,
  policyId?: string,
): Promise<{ policy: AudiencePolicyRecord; version: AudiencePolicyVersionRecord } | null> {
  const rows = await sql<{
    p_id: string;
    p_tenant_id: string;
    p_name: string;
    p_current_version: string | null;
    p_status: string;
    p_created_at: string;
    v_id: string;
    v_policy_id: string;
    v_version: string;
    v_config: unknown;
    v_approved_by: string | null;
    v_approved_at: string | null;
    v_created_at: string;
  }[]>`
    select
      p.id as p_id, p.tenant_id as p_tenant_id, p.name as p_name,
      p.current_version as p_current_version, p.status as p_status, p.created_at::text as p_created_at,
      v.id as v_id, v.policy_id as v_policy_id, v.version as v_version,
      v.config as v_config, v.approved_by as v_approved_by, v.approved_at::text as v_approved_at,
      v.created_at::text as v_created_at
    from garimpa.audience_policy p
    join garimpa.audience_policy_version v
      on v.policy_id = p.id and v.tenant_id = p.tenant_id and v.version = p.current_version
    where p.tenant_id = ${tenantId} and p.status = 'active'
      and (${policyId ?? null}::text is null or p.id = ${policyId ?? null})
    order by p.created_at desc
    limit 1
  `;

  const r = rows[0];
  if (!r) return null;

  return {
    policy: {
      id: r.p_id,
      tenantId: r.p_tenant_id,
      name: r.p_name,
      currentVersion: r.p_current_version,
      status: r.p_status as "draft" | "active" | "retired",
      createdAt: r.p_created_at,
    },
    version: {
      id: r.v_id,
      policyId: r.v_policy_id,
      tenantId: r.p_tenant_id,
      version: r.v_version,
      config: r.v_config as AudiencePolicyConfig,
      approvedBy: r.v_approved_by,
      approvedAt: r.v_approved_at,
      createdAt: r.v_created_at,
    },
  };
}

// 2. Cooldown de Canais e Publicações Confirmadas ---------------------------

export async function checkChannelCooldown(
  sql: Sql,
  tenantId: string,
  productId: string,
  channel: string,
  cooldownHours?: number,
  audienceKey?: string,
): Promise<{ onCooldown: boolean; remainingHours: number; lastPublishedAt: string | null }> {
  if(!audienceKey || !Number.isFinite(cooldownHours) || cooldownHours!<0)throw new Error("audience_cooldown_policy_required");
  // Cooldown usa publicação social confirmada (confirmed_at / published_at), não visualização web ou clique
  const rows = await sql<{ last_published: string }[]>`
    select p.published_at::text as last_published
    from garimpa.campaign_publication p
    join garimpa.commercial_kit k on k.id = p.kit_id and k.tenant_id = p.tenant_id
    join garimpa.opportunity o on o.id = k.opportunity_id and o.tenant_id = p.tenant_id
    where p.tenant_id = ${tenantId}
      and o.product_id = ${productId}
      and p.channel = ${channel}
      and p.status='published_confirmed' and o.audience_key=${audienceKey}
      and p.published_at is not null
      and p.published_at > now() - (${cooldownHours!} * interval '1 hour')
    order by p.published_at desc
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return { onCooldown: false, remainingHours: 0, lastPublishedAt: null };
  }

  const lastDate = new Date(row.last_published);
  const diffHours = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);
  const remaining = Math.max(0, Number((cooldownHours! - diffHours).toFixed(1)));

  return {
    onCooldown: true,
    remainingHours: remaining,
    lastPublishedAt: row.last_published,
  };
}

// 3. Oportunidades e Radar --------------------------------------------------

export async function createOrUpdateOpportunity(
  sql: Sql,
  tenantId: string,
  input: {
    productId: string;
    policyVersionId: string;
    audienceKey: string;
    channel: string;
    assessment: RubricAssessment;
    priceEvidence: PriceEvidence;
    humanPriority?: { state?: OpportunityState; reason?: string };
    validUntil?: string;
    requestId?: string;
    actorRef?: string;
  },
): Promise<{
  id: string;
  state: OpportunityState;
  opportunityClass: OpportunityClass;
  revision: number;
}> {
  // 1. Classificação canônica via contrato (C-03)
  const classification = classifyOpportunity(input.assessment, input.priceEvidence);

  let finalState: OpportunityState = classification.state;
  let finalReasons: string[] = [...classification.reasons];

  // 2. Prioridade humana motivada (se indicada pelo curador)
  if (input.humanPriority?.state) {
    finalState = input.humanPriority.state;
    if (input.humanPriority.reason) {
      finalReasons.push(`Decisão humana motivada: ${input.humanPriority.reason}`);
    }
  }

  // 3. Verificação de cooldown no canal (não veta outros canais nem públicos)
  const [version]=await sql<{config:any}[]>`select config from garimpa.audience_policy_version where id=${input.policyVersionId} and tenant_id=${tenantId}`;
  const hours=version?.config?.cooldownHours;
  const cooldown = typeof hours==='number' ? await checkChannelCooldown(sql, tenantId, input.productId, input.channel,hours,input.audienceKey) : {onCooldown:false,remainingHours:0};
  if(finalState==='prioritized' && typeof hours!=='number'){finalState='monitored';finalReasons.push('Política de cooldown do público/canal ainda não configurada.');}
  if (cooldown.onCooldown && finalState === "prioritized") {
    finalState = "monitored";
    finalReasons.push(
      `Canal ${input.channel} em cooldown (publicado na janela configurada). Restam ${cooldown.remainingHours}h.`,
    );
  }

  const validUntil =
    input.validUntil ??
    input.priceEvidence.validUntil ??
    new Date(Date.now() + 48 * 3600000).toISOString();

  // 4. Gravação idempotente com unicidade ativa
  const [row] = await sql<{ id: string; state: string; class: string; revision: number }[]>`
    insert into garimpa.opportunity (
      tenant_id, product_id, policy_version_id, audience_key, channel,
      state, class, assessment_ref, price_evidence_snapshot,
      reasons, unknowns, next_action, valid_until
    ) values (
      ${tenantId}, ${input.productId}, ${input.policyVersionId}, ${input.audienceKey}, ${input.channel},
      ${finalState}, ${classification.opportunityClass}, ${input.assessment.evidenceDigest || null},
      ${sql.json(input.priceEvidence as any)}, ${finalReasons}, ${classification.unknowns},
      ${classification.nextAction}, ${validUntil}
    )
    on conflict (tenant_id, product_id, policy_version_id, audience_key, channel)
    where state <> 'archived'
    do update set
      revision = garimpa.opportunity.revision + 1,
      state = excluded.state,
      class = excluded.class,
      assessment_ref = excluded.assessment_ref,
      price_evidence_snapshot = excluded.price_evidence_snapshot,
      reasons = excluded.reasons,
      unknowns = excluded.unknowns,
      next_action = excluded.next_action,
      valid_until = excluded.valid_until,
      updated_at = clock_timestamp()
    returning id, state, class, revision
  `;

  // 5. Emite evento de domínio append-only para auditoria e rastreabilidade
  const requestId = input.requestId ?? `req-opp-${Date.now()}`;
  const actorRef = input.actorRef ?? "system";
  const idempotencyKey = `${row!.id}:rev${row!.revision}`;

  await sql`
    insert into garimpa.domain_event (
      tenant_id, aggregate_type, aggregate_id, aggregate_version,
      event_type, actor_ref, request_id, idempotency_key, payload
    ) values (
      ${tenantId}, 'opportunity', ${row!.id}, ${row!.revision},
      ${finalState === 'prioritized' ? 'OpportunityPrioritized' : 'OpportunityClassified'},
      ${actorRef}, ${requestId}, ${idempotencyKey},
      ${sql.json({
        productId: input.productId,
        audienceKey: input.audienceKey,
        channel: input.channel,
        opportunityClass: row!.class,
        state: row!.state,
        reasons: finalReasons,
      })}
    )
    on conflict (tenant_id, aggregate_type, aggregate_id, idempotency_key) do nothing
  `;

  return {
    id: row!.id,
    state: row!.state as OpportunityState,
    opportunityClass: row!.class as OpportunityClass,
    revision: row!.revision,
  };
}

export async function archiveOpportunity(
  sql: Sql,
  tenantId: string,
  opportunityId: string,
  input?: { reason?: string; requestId?: string; actorRef?: string },
): Promise<{ ok: boolean; revision: number }> {
  const rows = await sql<{ id: string; revision: number }[]>`
    update garimpa.opportunity
    set state = 'archived',
        reasons = array_append(reasons, ${input?.reason ? `Arquivado: ${input.reason}` : "Arquivado manualmente"}),
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = ${opportunityId} and tenant_id = ${tenantId} and state <> 'archived'
    returning id, revision
  `;

  const r = rows[0];
  if (!r) return { ok: false, revision: 0 };

  const requestId = input?.requestId ?? `req-arch-${Date.now()}`;
  const actorRef = input?.actorRef ?? "operator";
  await sql`
    insert into garimpa.domain_event (
      tenant_id, aggregate_type, aggregate_id, aggregate_version,
      event_type, actor_ref, request_id, idempotency_key, payload
    ) values (
      ${tenantId}, 'opportunity', ${r.id}, ${r.revision},
      'OpportunityArchived', ${actorRef}, ${requestId},
      ${`${r.id}:archived:${r.revision}`},
      ${sql.json({ reason: input?.reason ?? "Manual archive" })}
    )
    on conflict (tenant_id, aggregate_type, aggregate_id, idempotency_key) do nothing
  `;

  return { ok: true, revision: r.revision };
}

export async function reactivateOpportunity(
  sql: Sql,
  tenantId: string,
  opportunityId: string,
  input?: { reason?: string; requestId?: string; actorRef?: string },
): Promise<{ ok: boolean; revision: number; error?: string }> {
  // 1. Verifica se a oportunidade existe e está arquivada
  const [target] = await sql<{
    id: string;
    product_id: string;
    policy_version_id: string;
    audience_key: string;
    channel: string;
  }[]>`
    select id, product_id, policy_version_id, audience_key, channel
    from garimpa.opportunity
    where id = ${opportunityId} and tenant_id = ${tenantId}
  `;
  if (!target) return { ok: false, revision: 0, error: "not_found" };

  // 2. Verifica se já existe outra oportunidade ativa no mesmo escopo
  const [activeConflict] = await sql<{ id: string }[]>`
    select id from garimpa.opportunity
    where tenant_id = ${tenantId}
      and product_id = ${target.product_id}
      and policy_version_id = ${target.policy_version_id}
      and audience_key = ${target.audience_key}
      and channel = ${target.channel}
      and state <> 'archived'
      and id <> ${opportunityId}
  `;
  if (activeConflict) {
    return { ok: false, revision: 0, error: "active_opportunity_exists" };
  }

  // 3. Reativa
  const rows = await sql<{ id: string; revision: number }[]>`
    update garimpa.opportunity
    set state = 'candidate',
        reasons = array_append(reasons, ${input?.reason ? `Reativado: ${input.reason}` : "Reativado manualmente"}),
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = ${opportunityId} and tenant_id = ${tenantId}
    returning id, revision
  `;

  const r = rows[0]!;
  const requestId = input?.requestId ?? `req-react-${Date.now()}`;
  const actorRef = input?.actorRef ?? "operator";
  await sql`
    insert into garimpa.domain_event (
      tenant_id, aggregate_type, aggregate_id, aggregate_version,
      event_type, actor_ref, request_id, idempotency_key, payload
    ) values (
      ${tenantId}, 'opportunity', ${r.id}, ${r.revision},
      'OpportunityReactivated', ${actorRef}, ${requestId},
      ${`${r.id}:reactivated:${r.revision}`},
      ${sql.json({ reason: input?.reason ?? "Manual reactivation" })}
    )
    on conflict (tenant_id, aggregate_type, aggregate_id, idempotency_key) do nothing
  `;

  return { ok: true, revision: r.revision };
}

export async function getOpportunityById(
  sql: Sql,
  tenantId: string,
  opportunityId: string,
): Promise<OpportunityWithProduct | null> {
  const rows = await sql<{
    id: string;
    tenant_id: string;
    product_id: string;
    policy_version_id: string;
    audience_key: string;
    channel: string;
    revision: number;
    state: string;
    class: string;
    assessment_ref: string | null;
    price_evidence_snapshot: unknown;
    reasons: string[];
    unknowns: string[];
    next_action: string;
    valid_until: string;
    created_at: string;
    updated_at: string;
    predecessor_id: string | null;
    title: string;
    marketplace: string;
    image_url: string | null;
    category: string | null;
    product_url: string;
    last_price_cents: number;
  }[]>`
    select
      o.id, o.tenant_id, o.product_id, o.policy_version_id, o.audience_key, o.channel,
      o.revision, o.state, o.class, o.assessment_ref, o.price_evidence_snapshot,
      o.reasons, o.unknowns, o.next_action, o.valid_until::text, o.created_at::text, o.updated_at::text,
      o.predecessor_id,
      p.title, p.marketplace, p.image_url, p.category, p.product_url, p.last_price_cents
    from garimpa.opportunity o
    join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
    where o.id = ${opportunityId} and o.tenant_id = ${tenantId}
  `;

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    tenantId: r.tenant_id,
    productId: r.product_id,
    policyVersionId: r.policy_version_id,
    audienceKey: r.audience_key,
    channel: r.channel,
    revision: r.revision,
    state: r.state as OpportunityState,
    class: r.class as OpportunityClass,
    assessmentRef: r.assessment_ref ?? undefined,
    priceEvidenceSnapshot: r.price_evidence_snapshot as PriceEvidence,
    reasons: r.reasons,
    unknowns: r.unknowns,
    nextAction: r.next_action,
    validUntil: r.valid_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    predecessorId: r.predecessor_id ?? undefined,
    productTitle: r.title,
    marketplace: r.marketplace,
    imageUrl: r.image_url,
    category: r.category,
    productUrl: r.product_url,
    currentPriceCents: r.last_price_cents,
  };
}

export async function getRadarOpportunities(
  sql: Sql,
  tenantId: string,
  options?: {
    audienceKey?: string;
    channel?: string;
    state?: OpportunityState;
    limit?: number;
  },
): Promise<OpportunityWithProduct[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

  const rows = await sql<{
    id: string;
    tenant_id: string;
    product_id: string;
    policy_version_id: string;
    audience_key: string;
    channel: string;
    revision: number;
    state: string;
    class: string;
    assessment_ref: string | null;
    price_evidence_snapshot: unknown;
    reasons: string[];
    unknowns: string[];
    next_action: string;
    valid_until: string;
    created_at: string;
    updated_at: string;
    predecessor_id: string | null;
    title: string;
    marketplace: string;
    image_url: string | null;
    category: string | null;
    product_url: string;
    last_price_cents: number;
  }[]>`
    select
      o.id, o.tenant_id, o.product_id, o.policy_version_id, o.audience_key, o.channel,
      o.revision, o.state, o.class, o.assessment_ref, o.price_evidence_snapshot,
      o.reasons, o.unknowns, o.next_action, o.valid_until::text, o.created_at::text, o.updated_at::text,
      o.predecessor_id,
      p.title, p.marketplace, p.image_url, p.category, p.product_url, p.last_price_cents
    from garimpa.opportunity o
    join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
    where o.tenant_id = ${tenantId}
      and (${options?.audienceKey ?? null}::text is null or o.audience_key = ${options?.audienceKey ?? null})
      and (${options?.channel ?? null}::text is null or o.channel = ${options?.channel ?? null})
      and (
        case
          when ${options?.state ?? null}::text is not null then o.state = ${options?.state ?? null}
          else o.state <> 'archived'
        end
      )
    order by o.updated_at desc
    limit ${limit}
  `;

  const mapped: OpportunityWithProduct[] = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    productId: r.product_id,
    policyVersionId: r.policy_version_id,
    audienceKey: r.audience_key,
    channel: r.channel,
    revision: r.revision,
    state: r.state as OpportunityState,
    class: r.class as OpportunityClass,
    assessmentRef: r.assessment_ref ?? undefined,
    priceEvidenceSnapshot: r.price_evidence_snapshot as PriceEvidence,
    reasons: r.reasons,
    unknowns: r.unknowns,
    nextAction: r.next_action,
    validUntil: r.valid_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    predecessorId: r.predecessor_id ?? undefined,
    productTitle: r.title,
    marketplace: r.marketplace,
    imageUrl: r.image_url,
    category: r.category,
    productUrl: r.product_url,
    currentPriceCents: r.last_price_cents,
  }));

  // Ordenação lexicográfica canônica (C-03)
  return rankOpportunities(mapped) as OpportunityWithProduct[];
}

/**
 * Prevenção de Starvation: reparte o orçamento de monitoramento
 * garantindo vaga para novos candidatos sem histórico prévio.
 */
export { prioritizeMonitoringQueue } from "../../persistence/src/monitoring-priority.ts";
