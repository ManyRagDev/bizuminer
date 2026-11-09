import { createHash } from "node:crypto";
import type postgres from "postgres";
import { authorizeAccountTransaction, releaseAccountTransaction } from "./account-scope.ts";
import { HOLD_REASONS, REJECTION_REASONS } from "./curation-contract.ts";
import { db } from "./db.ts";
import { candidateRows, latestAssessments, toCandidate, validateSuperiorityClaimsInBatch } from "./editorial-selection-db.ts";
import { hasSuperiorityClaim } from "./editorial-selection.ts";
import { getProductPresentations } from "./product-presentation-db.ts";
import { sourceProductPresentation } from "./product-presentation.ts";
import { buildPautaMlTarget, httpsShopUrl, issuePautaLink, type MlPautaConfig } from "./pauta-link.ts";
import { composeLivePauta, PAUTA_PRICE_WINDOW_MS, type PautaCandidate, type PautaChannel } from "./pauta-policy.ts";
import { RECOMMENDATION_POLICY_VERSION, validateChannelPolicy, type ConfirmedExposure } from "./recommendation-policy.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { PRODUCT_EVIDENCE_TTL_DAYS } from "./catalog-policy.ts";

type Tx = postgres.TransactionSql;
type ChannelConfig = {
  enabled: boolean;
  policy: unknown;
  policy_version: string;
  version: number;
  manual_order: string[] | null;
  valid_until: Date | null;
};
type LinkFacts = {
  id: string;
  external_id: string;
  slug: string | null;
  publication_status: string | null;
  affiliate_url: string | null;
  triage_score: number | null;
};
function shareTarget(tenantId: string, candidate: PautaCandidate, facts: LinkFacts, ml: MlPautaConfig | undefined): PautaCandidate["shareTarget"] {
  if (facts.publication_status && facts.publication_status !== "active") return null;
  if (candidate.marketplace !== "mercadolivre") {
    const hosts = candidate.marketplace === "shopee" ? ["shopee.com.br", "shopee.ee"] : ["aliexpress.com"];
    return facts.slug && httpsShopUrl(facts.affiliate_url, hosts) ? { kind: "site", slug: facts.slug } : null;
  }
  if (!ml || !httpsShopUrl(candidate.productUrl, ["mercadolivre.com.br"])) return null;
  if (facts.slug) return { kind: "site", slug: facts.slug };
  // Keep the option page and the existing publication rules for confirmed options.
  if (candidate.offerOptionKey || !buildPautaMlTarget(candidate.productUrl, facts.external_id, ml)) return null;
  const token = issuePautaLink(tenantId, candidate.id);
  return token ? { kind: "pauta", token } : null;
}

async function selectOffers(tx: Tx, context: AccountContext, channel: PautaChannel, now: Date) {
  const { tenantId, affiliateId } = context;
  const [config] = await tx<ChannelConfig[]>`select * from garimpa.recommendation_channel
    where tenant_id=${tenantId} and channel=${channel}`;
  if (!config?.enabled || config.valid_until && +config.valid_until <= +now) {
    return { config: null, selected: [], reasonsById: new Map<string, string[]>() };
  }
  const policy = validateChannelPolicy(config.policy);
  if (!policy || config.policy_version !== RECOMMENDATION_POLICY_VERSION) throw new Error("invalid_pauta_policy");

  const rows = await candidateRows(tx, tenantId, undefined, false, new Date(+now - PAUTA_PRICE_WINDOW_MS));
  const ids = rows.map(row => row.id);
  if (!ids.length) return { config, selected: [], reasonsById: new Map<string, string[]>() };
  const assessments = await latestAssessments(tx, tenantId);
  const [ml] = await tx<MlPautaConfig[]>`select c.tracking_id,c.tool_id
    from garimpa.affiliate_marketplace_config c
    join garimpa.affiliate_account a on a.id=c.affiliate_id and a.status='active'
    where a.tenant_id=${tenantId} and c.affiliate_id=${affiliateId}
      and c.marketplace='mercadolivre' and c.status='active'
      and nullif(c.tracking_id,'') is not null and nullif(c.tool_id,'') is not null`;
  const links = await tx<LinkFacts[]>`select p.id,p.external_id,pub.slug,pub.status as publication_status,pub.affiliate_url,
      case when jsonb_typeof(event.score)='number' then (event.score #>> '{}')::float8 end as triage_score
    from garimpa.product p
    left join garimpa.publication pub on pub.product_id=p.id and pub.tenant_id=p.tenant_id
      and pub.affiliate_id=${affiliateId} and pub.channel='web'
    left join lateral (
      select e.metadata->'automation'->'aiScore' as score from garimpa.curation_event e
      where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1
    ) event on true
    where p.tenant_id=${tenantId} and p.id=any(${ids})`;
  const linkFacts = new Map(links.map(facts => [facts.id, facts]));
  const candidates: PautaCandidate[] = rows.map(row => {
    const facts = linkFacts.get(row.id);
    const score = facts?.triage_score;
    const candidate: PautaCandidate = {
      ...toCandidate(row, assessments.get(row.id) ?? null, now),
      triageScore: typeof score === "number" && score >= 1 && score <= 5 ? score : null,
      shareTarget: null,
    };
    candidate.shareTarget = facts ? shareTarget(tenantId, candidate, facts, ml) : null;
    return candidate;
  });
  const claimAssessments = candidates.flatMap(c =>
    c.assessment && hasSuperiorityClaim(c.assessment.publicRationale) ? [c.assessment] : []);
  const claims = await validateSuperiorityClaimsInBatch(tx, tenantId, claimAssessments, now);
  const invalidClaims = new Set(claimAssessments.filter(a => claims.get(a.id) !== true).map(a => a.productId));
  const exposureRows = await tx<(Omit<ConfirmedExposure, "confirmedAt"> & { confirmedAt: Date })[]>`
    select distinct on (product_id) product_id as "productId",option_key as "optionKey",
      price_cents as "priceCents",confirmed_at as "confirmedAt"
    from garimpa.recommendation_exposure where tenant_id=${tenantId} and channel=${channel}
      and confirmed_at>=${new Date(+now - policy.repeatHours * 3_600_000)} and product_id=any(${ids})
    order by product_id,confirmed_at desc,id desc`;
  const exposures = new Map(exposureRows.map(row => [row.productId, { ...row, confirmedAt: row.confirmedAt.toISOString() }]));
  return { config, ...composeLivePauta(candidates, policy, exposures, now, config.manual_order, invalidClaims) };
}

type CaptureRow = {
  id: string;
  title: string;
  marketplace: string;
  price_cents: number;
  price_type: string | null;
  currency: string | null;
  observed_at: Date;
  stage: Exclude<PautaCapture["status"], "ready" | "blocked"> | "approved";
  reason_code: string | null;
  reason_detail: string | null;
  ai_justification: string | null;
  total: number;
  review_total: number;
  triage_total: number;
  retry_total: number;
};

export type PautaCaptureActions = { review: number; triage: number; retry: number };

export type PautaCapture = {
  id: string;
  title: string;
  marketplace: string;
  priceCents: number;
  priceType: string | null;
  currency: string | null;
  capturedAt: string;
  status: "ready" | "pending" | "review" | "retry" | "processing" | "deferred" | "rejected" | "held" | "blocked" | "failed";
  reasons: string[];
};

const curationReasons = new Map<string, string>([...REJECTION_REASONS, ...HOLD_REASONS]);

function captureStatus(row: CaptureRow, selection: Awaited<ReturnType<typeof selectOffers>>): Pick<PautaCapture, "status" | "reasons"> {
  if (selection.selected.some(p => p.id === row.id)) return { status: "ready", reasons: ["Pronta neste canal."] };
  const reviewReason = row.reason_detail || curationReasons.get(row.reason_code ?? "");
  switch (row.stage) {
    case "approved": return { status: "blocked", reasons: selection.reasonsById.get(row.id) ??
      [selection.config ? "Falta uma observação válida para divulgação." : "Este canal está desativado ou venceu."] };
    case "review": return { status: "review", reasons: [row.ai_justification || "A Curadoria precisa decidir se a oferta entra no catálogo."] };
    case "retry": return { status: "retry", reasons: ["Retida pelo antigo piso de R$ 20. A triagem geral pode reavaliar a oferta."] };
    case "processing": return { status: "processing", reasons: ["O lote de captura ainda está em andamento."] };
    case "deferred": return { status: "deferred", reasons: ["A revisão foi adiada na Curadoria."] };
    case "rejected": return { status: "rejected", reasons: [reviewReason || "A oferta foi rejeitada na curadoria."] };
    case "held": return { status: "held", reasons: [reviewReason || "Em espera na curadoria."] };
    case "failed": return { status: "failed", reasons: ["A captura foi salva. Execute a triagem geral para avaliar a oferta."] };
    case "pending": return { status: "pending", reasons: ["A captura foi salva e pode ser avaliada na triagem geral."] };
  }
}

async function recentCaptures(tx: Tx, tenantId: string, now: Date, marketplace: string | null) {
  return tx<CaptureRow[]>`with latest as materialized (
      select distinct on (o.product_id) o.product_id,o.price_cents,o.observed_at,o.capture_run_id,
        o.offer_evidence->>'priceType' as price_type,o.offer_evidence->>'currency' as currency
      from garimpa.price_observation o where o.tenant_id=${tenantId}
        and o.observed_at>=${new Date(+now - PAUTA_PRICE_WINDOW_MS)}
        and o.observed_at<=${new Date(+now + 60_000)}
      order by o.product_id,o.observed_at desc,o.id desc
    ), classified as (
      select p.id,p.title,p.marketplace,o.price_cents,o.price_type,o.currency,o.observed_at,
        c.reason_code,c.reason_detail,
        case when event.actor_type='llm' and event.to_status='pending'
          then nullif(event.metadata#>>'{automation,aiJustification}','') end as ai_justification,
        case
          when c.status in ('approved','rejected') then c.status
          when c.deferred_until>${now} then 'deferred'
          when c.status='held' and event.actor_type='rule' and event.to_status='held'
            and c.reason_code=event.reason_code and c.reason_code in ('insufficient_evidence','weak_offer')
            and event.metadata#>>'{automation,pricePolicy,version}'='triage-value-v1'
            and event.metadata#>>'{automation,pricePolicy,outcome}' in ('unverified_value','low_value')
            and o.price_cents>0 and p.last_seen_at>=${new Date(+now - PRODUCT_EVIDENCE_TTL_DAYS * 86_400_000)} then 'retry'
          when c.status='held' then 'held'
          when c.status is distinct from 'pending' or exists (
            select 1 from garimpa.curation_event decision where decision.tenant_id=p.tenant_id and decision.product_id=p.id
              and (decision.actor_type='llm' or (decision.actor_type='rule' and decision.to_status in ('rejected','held')))
          ) then 'review'
          when b.status='running' and (b.metadata#>>'{execution,deadline}')::timestamptz>${now} then 'processing'
          when (b.status in ('error','partial') and b.metadata#>'{execution,triage}' is null)
            or (b.status='running' and (b.metadata#>>'{execution,deadline}')::timestamptz<=${now}) then 'failed'
          else 'pending'
        end as stage
      from latest o join garimpa.product p on p.tenant_id=${tenantId} and p.id=o.product_id
      left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      left join lateral (
        select e.actor_type,e.to_status,e.reason_code,e.metadata
        from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id
        order by e.id desc limit 1
      ) event on true
      left join garimpa.capture_run r on r.tenant_id=p.tenant_id and r.id=o.capture_run_id
      left join garimpa.capture_batch b on b.tenant_id=r.tenant_id
        and b.id::text=r.parameters->>'operationBatchId'
      where (${marketplace}::text is null or p.marketplace=${marketplace})
    )
    select classified.*,count(*) over ()::int as total,
      count(*) filter (where stage='review') over ()::int as review_total,
      count(*) filter (where stage in ('pending','failed')) over ()::int as triage_total,
      count(*) filter (where stage='retry') over ()::int as retry_total
    from classified order by observed_at desc,id limit 200`;
}

function offerConfirmationId(tenantId: string, channel: PautaChannel, version: number, candidate: PautaCandidate) {
  const key = createHash("sha256").update(JSON.stringify([
    tenantId, channel, version, candidate.id, candidate.evidenceObservationId, candidate.evidenceFingerprint,
    candidate.assessment?.id, candidate.offerOptionKey, candidate.priceCents, candidate.shareTarget,
  ])).digest("hex");
  return `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
}

async function readSnapshot<T>(context: AccountContext, read: (tx: Tx, now: Date) => Promise<T>, sqlFactory: typeof db) {
  const sql = sqlFactory();
  try {
    return await sql.begin("isolation level repeatable read read only", async tx => {
      try {
        await authorizeAccountTransaction(tx, context);
        const [{ now }] = await tx<{ now: Date }[]>`select now()`;
        return await read(tx, now);
      } finally { releaseAccountTransaction(tx); }
    }) as T;
  } finally { await sql.end(); }
}

export async function previewLivePauta(context: AccountContext, channel: PautaChannel, sqlFactory: typeof db = db) {
  return readSnapshot(context, async (tx, now) => {
    const { selected, reasonsById } = await selectOffers(tx, context, channel, now);
    return {
      channel, count: selected.length,
      products: selected.map(({ id, title }) => ({ id, title })),
      excluded: Array.from(reasonsById, ([productId, reasons]) => ({ productId, reasons })),
    };
  }, sqlFactory);
}

export async function readLivePauta(context: AccountContext, channel: PautaChannel, marketplace: string | null,
  sqlFactory: typeof db = db) {
  return readSnapshot(context, async (tx, now) => {
    const selection = await selectOffers(tx, context, channel, now);
    const captures = await recentCaptures(tx, context.tenantId, now, marketplace);
    const slugs = selection.selected.flatMap(p => p.shareTarget?.kind === "site" ? [p.shareTarget.slug] : []);
    const codes = slugs.length ? await tx<{ code: string; slug: string }[]>`select code,slug from garimpa.short_link
      where tenant_id=${context.tenantId} and slug=any(${slugs})` : [];
    const codesBySlug = new Map(codes.map(row => [row.slug, row.code]));
    const presentationFactory = (() => Object.assign((...args: unknown[]) =>
      (tx as unknown as (...values: unknown[]) => unknown)(...args), { end: async () => {} })) as typeof db;
    const presentations = await getProductPresentations(selection.selected.map(p => p.id), context.tenantId, presentationFactory);
    const products = selection.selected.map(candidate => {
      const { productUrl: _url, lastSeenAt: _seen, curationStatus: _status, evidenceFingerprint: _fingerprint,
        offerEvidence: _evidence, tenantId: _tenant, assessment, selectionBlockers: _blockers, offerMaterialInvalid: _invalid,
        latestObservationId: _latest, evidenceObservationId: _observation, triageScore: _score, shareTarget, ...product } = candidate;
      const presentation = presentations.get(product.id) ?? sourceProductPresentation(product.title);
      const comparisonAt = assessment && hasSuperiorityClaim(assessment.publicRationale)
        ? Date.parse(assessment.comparativeBasis?.checkedAt ?? "") : NaN;
      return {
        ...presentation, ...product,
        benefit: presentation.benefit || (assessment?.benefit && !hasSuperiorityClaim(assessment.benefit) ? assessment.benefit : undefined),
        purchaseContents: presentation.purchaseContents ?? assessment?.purchaseContents,
        editorialRationale: assessment?.publicRationale ?? "",
        offerValidUntil: new Date(Math.min(
          +new Date(product.evidenceObservedAt!) + PAUTA_PRICE_WINDOW_MS,
          Date.parse(candidate.lastSeenAt) + 7 * 86_400_000,
          selection.config?.valid_until ? +selection.config.valid_until : Infinity,
          Number.isFinite(comparisonAt) ? comparisonAt + PAUTA_PRICE_WINDOW_MS : Infinity,
        )).toISOString(),
        shareTarget: shareTarget!,
        shortCode: shareTarget?.kind === "site" ? codesBySlug.get(shareTarget.slug) : undefined,
        confirmationId: offerConfirmationId(context.tenantId, channel, selection.config!.version, candidate),
      };
    });
    const recent: PautaCapture[] = captures.map(row => ({
      id: row.id, title: row.title, marketplace: row.marketplace, priceCents: row.price_cents,
      priceType: row.price_type, currency: row.currency,
      capturedAt: row.observed_at.toISOString(), ...captureStatus(row, selection),
    }));
    const first = captures[0];
    const captureActions: PautaCaptureActions = { review: first?.review_total ?? 0, triage: first?.triage_total ?? 0, retry: first?.retry_total ?? 0 };
    return { products, recent, recentTotal: first?.total ?? 0, captureActions, active: selection.config !== null, updatedAt: now.toISOString() };
  }, sqlFactory);
}

export async function confirmPautaExposure(context: AccountContext, channel: PautaChannel, confirmationId: string,
  productId: string, sqlFactory: typeof db = db) {
  if (context.actor !== "human" || !context.actorAppUserId) return false;
  const { tenantId, actorAppUserId } = context;
  return withAccountDb(context, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${tenantId}`},0))`;
    const [existing] = await tx`select id from garimpa.recommendation_exposure where tenant_id=${tenantId}
      and channel=${channel} and edition_id=${confirmationId}::uuid and product_id=${productId}`;
    if (existing) return true;
    // Unlike the read, confirmation must use the latest facts after taking the lock.
    const [{ now }] = await tx<{ now: Date }[]>`select statement_timestamp() as now`;
    const selection = await selectOffers(tx, context, channel, now);
    const candidate = selection.selected.find(p => p.id === productId);
    if (!candidate || !selection.config || confirmationId !== offerConfirmationId(tenantId, channel, selection.config.version, candidate)) return false;
    const version = selection.config.version;
    const offer = { id: productId, offerOptionKey: candidate.offerOptionKey ?? null, priceCents: candidate.priceCents };
    await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
      values(${confirmationId},${tenantId},${channel},${version},${version},${now},
        ${tx.json({ products: [offer] })},${tx.json([{ productId, observationId: candidate.evidenceObservationId ?? null }])})
      on conflict(id) do nothing`;
    await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by)
      values(${tenantId},${channel},${confirmationId},${productId},${offer.offerOptionKey},${offer.priceCents},${actorAppUserId})
      on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    return true;
  }, sqlFactory);
}
