/**
 * Camada de acesso a dados para o Ledger Financeiro Comercial (EP-08 / C-07).
 */

import { db } from "./db.ts";
import { calculateContentDigest } from "./commerce-contract.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import type {
  Conversion,
  ConversionSource,
  VerificationLevel,
  ConversionStatus,
  CommissionState,
  CostKind,
  SaaSRevenueState,
} from "./commercial-financial-contract.ts";
import {
  parseCanonicalCommissionCsv, isSafeOrderId,
  type ImportPreview,
  type CanonicalImportRow,
} from "./commission-import-contract.ts";

export function encodeKeyPart(part: string): string {
  return encodeURIComponent(part.trim());
}

export function buildCommissionSourceKey(
  marketplace: string,
  orderId: string,
  itemId?: string | null,
): string {
  return "obligation-v2:"+calculateContentDigest([marketplace.trim().toLowerCase(),orderId.trim(),itemId===undefined||itemId===null?null:itemId.trim()]);
}

export interface RecordManualConversionInput {
  readonly tenantId?: string;
  readonly marketplace: string;
  readonly externalOrderId?: string | null;
  readonly externalItemId?: string | null;
  readonly occurredAt: string;
  readonly orderValueCents?: number | null;
  readonly currency?: string;
  readonly source?: ConversionSource;
  readonly evidenceRef?: string | null;
  readonly verification?: VerificationLevel;
  readonly status?: ConversionStatus;
  readonly requestId: string;
  readonly campaignPublicationId?: string | null;
}

export async function recordManualConversion(
  context: AccountContext,
  input: RecordManualConversionInput,
  sqlFactory: typeof db = db,
): Promise<{ conversionId: string; alreadyExisted: boolean }> {
  if (input.tenantId && input.tenantId !== context.tenantId) {
    throw new Error(`Tenant mismatch: context=${context.tenantId}, input=${input.tenantId}`);
  }
  validateFinancialInput(input);
  if(!input.requestId?.trim() || !input.marketplace?.trim()) throw new Error('invalid_input');
  const tenantId = context.tenantId;

  return withAccountDb(context, async (sql) => {
    const digest = calculateContentDigest({ ...input, tenantId, currency: input.currency });
    if (input.source && input.source !== 'manual') throw new Error('manual_source_required');
    if (input.verification === 'provider_confirmed') throw new Error('provider_evidence_required');
    if (input.verification === 'documented' && !input.evidenceRef) throw new Error('evidence_required');
    if (input.campaignPublicationId && !input.evidenceRef) throw new Error('attribution_evidence_required');
    const currency = input.currency!;
    const source = input.source || "manual";
    const verification = input.verification || (input.evidenceRef ? "documented" : "declared");
    const status = input.status || "reported";

    const [row] = await sql<{ id: string }[]>`
      insert into garimpa.conversion (
        tenant_id,
        marketplace,
        external_order_id,
        external_item_id,
        occurred_at,
        order_value_cents,
        currency,
        source,
        evidence_ref,
        verification,
        status,
        request_id, input_digest
      ) values (
        ${tenantId},
        ${input.marketplace},
        ${input.externalOrderId ?? null},
        ${input.externalItemId ?? null},
        ${input.occurredAt},
        ${input.orderValueCents ?? null},
        ${currency},
        ${source},
        ${input.evidenceRef ?? null},
        ${verification},
        ${status},
        ${input.requestId}, ${digest}
      )
      on conflict (tenant_id,request_id) do nothing
      returning id
    `;

    if (!row) {
      const [existing] = await sql<{ id: string; input_digest: string }[]>`select id,input_digest from garimpa.conversion where tenant_id=${tenantId} and request_id=${input.requestId}`;
      if (!existing || existing.input_digest !== digest) throw new Error('idempotency_conflict');
      return { conversionId: existing.id, alreadyExisted: true };
    }

    // 2. Registrar atribuição (unknown se não houver publicação ou comprovante)
    const attributionMethod = input.campaignPublicationId ? "manual_evidence" : "unknown";
    const attributionConfidence = input.campaignPublicationId ? "supported" : "unknown";

    await sql`
      insert into garimpa.conversion_attribution (
        conversion_id,
        tenant_id,
        campaign_publication_id,
        method,
        confidence,
        evidence_ref
      ) values (
        ${row.id},
        ${tenantId},
        ${input.campaignPublicationId ?? null},
        ${attributionMethod},
        ${attributionConfidence},
        ${input.evidenceRef ?? null}
      )
      on conflict (conversion_id, tenant_id) do nothing
    `;

    // 3. Registrar domain_event
    await sql`
      insert into garimpa.domain_event (
        tenant_id,
        aggregate_type,
        aggregate_id,
        aggregate_version,
        event_type,
        actor_ref,
        request_id,
        idempotency_key,
        payload
      ) values (
        ${tenantId},
        'conversion',
        ${row.id},
        1,
        'ConversionRecorded',
        ${context.actorAppUserId ?? context.actor ?? "operator"},
        ${context.requestId || input.requestId},
        ${input.requestId},
        ${JSON.stringify({
          marketplace: input.marketplace,
          orderValueCents: input.orderValueCents,
          verification,
          hasCampaign: Boolean(input.campaignPublicationId),
        })}::jsonb
      )
      on conflict (tenant_id, aggregate_type, aggregate_id, idempotency_key) do nothing
    `;

    return { conversionId: row.id, alreadyExisted: false };
  }, sqlFactory);
}

export interface RecordCommissionEntryInput {
  readonly tenantId?: string;
  readonly conversionId?: string | null;
  readonly sourceKey: string;
  readonly amountCents: number;
  readonly currency?: string;
  readonly state: CommissionState;
  readonly occurredAt: string;
  readonly sourceRef: string;
  readonly predecessorId?: string | null;
}

export async function recordCommissionEntry(
  context: AccountContext,
  input: RecordCommissionEntryInput,
  sqlFactory: typeof db = db,
): Promise<{ entryId: string; alreadyExisted: boolean }> {
  if (input.tenantId && input.tenantId !== context.tenantId) {
    throw new Error(`Tenant mismatch: context=${context.tenantId}, input=${input.tenantId}`);
  }
  validateFinancialInput(input);
  if(!input.sourceKey?.trim() || !input.sourceRef?.trim()) throw new Error('source_required');
  const tenantId = context.tenantId;

  return withAccountDb(context, async (sql) => {
    const currency = input.currency!;
    let conversionId = input.conversionId ?? null;
    const digest = calculateContentDigest({ ...input, tenantId });
    if (input.predecessorId) {
      const [parent] = await sql<{ currency: string; conversion_id: string | null }[]>`
        select currency, conversion_id from garimpa.commission_entry
        where id = ${input.predecessorId} and tenant_id = ${tenantId}
      `;
      if (!parent || parent.currency !== currency) throw new Error("invalid_predecessor");
      if (input.conversionId && parent.conversion_id && input.conversionId !== parent.conversion_id) {
        throw new Error("invalid_predecessor");
      }
      if (!conversionId) conversionId = parent.conversion_id;
    }
    const [row] = await sql<{ id: string }[]>`
      insert into garimpa.commission_entry (
        tenant_id,
        conversion_id,
        source_key,
        amount_cents,
        currency,
        state,
        occurred_at,
        source_ref,
        predecessor_id, input_digest
      ) values (
        ${tenantId},
        ${conversionId},
        ${input.sourceKey},
        ${input.amountCents},
        ${currency},
        ${input.state},
        ${input.occurredAt},
        ${input.sourceRef},
        ${input.predecessorId ?? null}, ${digest}
      )
      on conflict (tenant_id, source_key) do nothing
      returning id
    `;

    if (!row) {
      const existing = await sql<{ id: string; input_digest: string }[]>`
        select id,input_digest from garimpa.commission_entry
        where tenant_id = ${tenantId} and source_key = ${input.sourceKey}
        limit 1
      `;
      if (!existing[0] || existing[0].input_digest !== digest) throw new Error('idempotency_conflict');
      return { entryId: existing[0].id, alreadyExisted: true };
    }

    return { entryId: row.id, alreadyExisted: false };
  }, sqlFactory);
}

export interface RecordSaaSRevenueInput {
  readonly tenantId?: string;
  readonly obligationKey: string;
  readonly eventKey: string;
  readonly contractRef: string;
  readonly amountCents: number;
  readonly currency?: string;
  readonly state: SaaSRevenueState;
  readonly occurredAt: string;
  readonly sourceRef: string;
  readonly predecessorId?: string | null;
}

export async function recordSaaSRevenueEntry(
  context: AccountContext,
  input: RecordSaaSRevenueInput,
  sqlFactory: typeof db = db,
): Promise<{ entryId: string; alreadyExisted: boolean }> {
  if (input.tenantId && input.tenantId !== context.tenantId) {
    throw new Error(`Tenant mismatch: context=${context.tenantId}, input=${input.tenantId}`);
  }
  validateFinancialInput(input);
  if(!input.obligationKey?.trim() || !input.eventKey?.trim() || !input.contractRef?.trim() || !input.sourceRef?.trim()) throw new Error('source_required');
  const tenantId = context.tenantId;

  return withAccountDb(context, async (sql) => {
    const currency = input.currency!;
    if (context.membershipRole !== 'owner' || context.tenantId !== 'local') throw new Error('platform_owner_required');
    const digest = calculateContentDigest({ ...input, tenantId });
    if (input.predecessorId) {
      const [parent] = await sql<{ currency: string; obligation_key: string }[]>`select currency,obligation_key from garimpa.saas_revenue_entry where id=${input.predecessorId} and tenant_id=${tenantId}`;
      if (!parent || parent.currency !== currency || parent.obligation_key !== input.obligationKey) throw new Error('invalid_predecessor');
    }
    const [row] = await sql<{ id: string }[]>`
      insert into garimpa.saas_revenue_entry (
        tenant_id,
        obligation_key,
        event_key,
        contract_ref,
        amount_cents,
        currency,
        state,
        occurred_at,
        source_ref,
        predecessor_id, input_digest
      ) values (
        ${tenantId},
        ${input.obligationKey},
        ${input.eventKey},
        ${input.contractRef},
        ${input.amountCents},
        ${currency},
        ${input.state},
        ${input.occurredAt},
        ${input.sourceRef},
        ${input.predecessorId ?? null}, ${digest}
      )
      on conflict (tenant_id, event_key) do nothing
      returning id
    `;

    if (!row) {
      const existing = await sql<{ id: string; input_digest: string }[]>`
        select id,input_digest from garimpa.saas_revenue_entry
        where tenant_id = ${tenantId} and event_key = ${input.eventKey}
        limit 1
      `;
      if (!existing[0] || existing[0].input_digest !== digest) throw new Error('idempotency_conflict');
      return { entryId: existing[0].id, alreadyExisted: true };
    }

    return { entryId: row.id, alreadyExisted: false };
  }, sqlFactory);
}


function validateFinancialInput(input: { currency?: string; occurredAt: string; amountCents?: number; orderValueCents?: number | null }) {
  if (!input.currency || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('currency_required');
  if (!Number.isFinite(new Date(input.occurredAt).getTime())) throw new Error('invalid_date');
  for (const amount of [input.amountCents, input.orderValueCents]) if (amount != null && (!Number.isSafeInteger(amount) || amount < 0)) throw new Error('invalid_amount');
}

export async function getCommercialResults(context: AccountContext, sqlFactory: typeof db = db) {
  return withAccountDb(context, async tx => {
    const conversions = await tx`select id::text,marketplace,occurred_at::text,order_value_cents::text,currency,verification,status from garimpa.conversion where tenant_id=${context.tenantId} order by occurred_at desc,id desc limit 100`;
    const commissions = await tx`select id::text,conversion_id::text,source_key,amount_cents::text,currency,state,occurred_at::text,source_ref,predecessor_id::text,created_at::text from garimpa.commission_entry where tenant_id=${context.tenantId} order by occurred_at,id`;
    const costs = await tx`select id::text,kind,amount_cents::text,currency,duration_seconds::text,source,period_start::text,period_end::text,verification,created_at::text from garimpa.operational_cost where tenant_id=${context.tenantId} order by period_start,id`;
    const revenues = context.tenantId==='local' && context.membershipRole==='owner'
      ? await tx`select id::text,obligation_key,event_key,contract_ref,amount_cents::text,currency,state,occurred_at::text,source_ref,predecessor_id::text,created_at::text from garimpa.saas_revenue_entry where tenant_id=${context.tenantId} order by occurred_at,id` : [];
    return { conversions,commissions,costs,revenues };
  }, sqlFactory);
}

export interface RecordOperationalCostInput {
  tenantId?: string; requestId: string; kind: CostKind; amountCents?: number | null;
  currency?: string | null; durationSeconds?: number | null; source: string;
  periodStart: string; periodEnd: string;
}
/** Manual cost evidence; unpriced time remains time, never monetary zero. */
export async function recordOperationalCost(context: AccountContext,input: RecordOperationalCostInput,sqlFactory: typeof db=db) {
  if(input.tenantId && input.tenantId!==context.tenantId) throw new Error('tenant_mismatch');
  if(!input.requestId?.trim() || !input.source?.trim()) throw new Error('source_required');
  if(input.amountCents!=null) validateFinancialInput({amountCents:input.amountCents,currency:input.currency??undefined,occurredAt:input.periodStart});
  if(input.durationSeconds!=null && (!Number.isSafeInteger(input.durationSeconds)||input.durationSeconds<0||input.durationSeconds>2147483647)) throw new Error('invalid_duration');
  const start=new Date(input.periodStart).getTime(),end=new Date(input.periodEnd).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start) throw new Error('invalid_period');
  if(input.amountCents==null && input.durationSeconds==null) throw new Error('cost_measurement_required');
  const digest=calculateContentDigest({...input,tenantId:context.tenantId});
  return withAccountDb(context,async tx=>{
    const [row]=await tx<{id:string}[]>`insert into garimpa.operational_cost(tenant_id,request_id,input_digest,kind,amount_cents,currency,duration_seconds,source,period_start,period_end,verification)
      values(${context.tenantId},${input.requestId},${digest},${input.kind},${input.amountCents??null},${input.amountCents==null?null:input.currency!},${input.durationSeconds??null},${input.source},${input.periodStart},${input.periodEnd},'declared')
      on conflict(tenant_id,request_id) do nothing returning id`;
    if(row) return {costId:row.id,alreadyExisted:false};
    const [existing]=await tx<{id:string;input_digest:string}[]>`select id,input_digest from garimpa.operational_cost where tenant_id=${context.tenantId} and request_id=${input.requestId}`;
    if(!existing || existing.input_digest!==digest) throw new Error('idempotency_conflict');
    return {costId:existing.id,alreadyExisted:true};
  },sqlFactory);
}

export interface CreateImportBatchInput {
  readonly tenantId?: string;
  readonly marketplace: string;
  readonly csvContent: string;
  readonly parserVersion?: string;
  readonly artifactId?: string;
}

export interface CommitImportBatchInput {
  readonly tenantId?: string;
  readonly batchId: string;
  readonly expectedDigest: string;
  readonly selectedRowIds?: readonly string[];
  readonly reviewResolutions?: Readonly<Record<string,{sourceRevision:string;rationale:string;externalOrderId?:string}>>;
}

/**
 * Registra ou recupera um preview de importação de comissões (EP-08 / G-PREVIEW).
 * Idempotente por (tenant_id, marketplace, file_digest, parser_version).
 * Avalia duplicatas locais e contra lançamentos já existentes no ledger do tenant.
 */
export async function createOrGetImportBatchPreview(
  context: AccountContext,
  input: CreateImportBatchInput,
  sqlFactory: typeof db = db,
): Promise<{ batchId: string; status: string; preview: ImportPreview; alreadyExisted: boolean }> {
  if (input.tenantId && input.tenantId !== context.tenantId) {
    throw new Error(`Tenant mismatch: context=${context.tenantId}, input=${input.tenantId}`);
  }
  if (!input.marketplace?.trim()) throw new Error("marketplace_required");
  if (!input.csvContent?.trim()) throw new Error("csv_content_required");

  const marketplace = input.marketplace.trim().toLowerCase();
  const parserVersion = input.parserVersion?.trim() || "canonical-v2";
  const preview = parseCanonicalCommissionCsv(input.csvContent);
  const fileDigest = preview.fileDigest;
  const tenantId = context.tenantId;

  return withAccountDb(context, async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${tenantId+":preview:"+fileDigest},0))`;
    if(input.artifactId){const valid=await sql`select id from garimpa.private_artifact where id::text=${input.artifactId} and tenant_id=${tenantId} and kind='commission_original' and status='ready' and sha256=${fileDigest}`;if(!valid.length)throw new Error("original_artifact_invalid");}
    // 1. Verificar se lote já existe para este tenant, marketplace, file_digest e parser_version
    const [existing] = await sql<{ id: string; status: string; counts: any }[]>`
      select id, status, counts
      from garimpa.import_batch
      where tenant_id = ${tenantId}
        and marketplace = ${marketplace}
        and file_digest = ${fileDigest}
        and parser_version = ${parserVersion}
      limit 1
    `;

    if (existing) {
      const existingRows = await sql<{ id: string; row_number: number; provider_key: string | null; decision: string; errors: any; normalized: any }[]>`
        select id, row_number, provider_key, decision, errors, normalized
        from garimpa.import_row
        where batch_id = ${existing.id} and tenant_id = ${tenantId}
        order by row_number asc
      `;
      const enrichedDecisions = existingRows.map((r) => ({
        rowId: r.id,
        rowNumber: r.row_number,
        externalOrderId: r.provider_key || "",
        externalItemId: r.normalized?.externalItemId || null,
        decision: r.decision as any,
        reason: r.errors?.[0],
        row: r.normalized,
      }));

      return {
        batchId: existing.id,
        status: existing.status,
        preview: {
          fileDigest,
          canonicalDigest: existing.counts?.canonicalDigest ?? preview.canonicalDigest,
          totalLines: existing.counts?.totalLines ?? preview.totalLines,
          validRowsCount: existing.counts?.validRowsCount ?? preview.validRowsCount,
          errorRowsCount: existing.counts?.errorRowsCount ?? preview.errorRowsCount,
          reviewRequiredCount: existing.counts?.reviewRequiredCount ?? preview.reviewRequiredCount,
          duplicateCount: existing.counts?.duplicateCount ?? preview.duplicateCount,
          totalOrderValueCents: existing.counts?.totalOrderValueCents ?? preview.totalOrderValueCents,
          totalCommissionCents: existing.counts?.totalCommissionCents ?? preview.totalCommissionCents,
          totalsByCurrency: existing.counts?.totalsByCurrency ?? preview.totalsByCurrency,
          currencies: existing.counts?.currencies ?? preview.currencies,
          marketplaces: existing.counts?.marketplaces ?? preview.marketplaces,
          validRows: preview.validRows,
          errors: preview.errors,
          rowDecisions: enrichedDecisions.length > 0 ? enrichedDecisions : preview.rowDecisions,
        },
        alreadyExisted: true,
      };
    }

    // 2. Verificar duplicatas contra commission_entry já registradas no banco para o tenant (CF-08, CF-09)
    const effectiveDecisions = [...preview.rowDecisions];
    let adjustedDuplicateCount = preview.duplicateCount;
    let adjustedValidCount = preview.validRowsCount;
    let adjustedReviewCount = preview.reviewRequiredCount;

    for (let i = 0; i < effectiveDecisions.length; i++) {
      const dec = effectiveDecisions[i]!;
      if (dec.decision === "imported" || dec.decision === "review_required") {
        const [existingEntry] = await sql<{id:string;amount_cents:string;state:string;currency:string}[]>`select e.id,e.amount_cents::text,e.state,e.currency from garimpa.commission_entry e join garimpa.conversion c on c.id=e.conversion_id and c.tenant_id=e.tenant_id where e.tenant_id=${tenantId} and c.marketplace=${marketplace} and c.external_order_id=${dec.externalOrderId} and c.external_item_id is not distinct from ${dec.externalItemId??null} order by e.created_at desc,e.id desc limit 1`;

        if (existingEntry) {
          const rowData = dec.row;
          const isIdentical =
            rowData &&
            Number(existingEntry.amount_cents) === rowData.commissionCents &&
            existingEntry.state === rowData.commissionState && existingEntry.currency === rowData.currency && !rowData.sourceRevision;

          if (isIdentical) {
            if (dec.decision === "imported") adjustedValidCount--;
            if (dec.decision === "review_required") adjustedReviewCount--;
            adjustedDuplicateCount++;
            effectiveDecisions[i] = {
              ...dec,
              decision: "duplicate",
              reason: "Comissão já registrada anteriormente no ledger desta conta",
            };
          } else {
            if(dec.decision==="imported" && !dec.row?.sourceRevision){adjustedValidCount--;adjustedReviewCount++;}
            effectiveDecisions[i] = {...dec,decision:dec.row?.sourceRevision?dec.decision:"review_required",reason:"Nova revisão financeira exige identidade de evento e confirmação documentada"};
          }
        }
      }
    }

    const countsJson = {
      canonicalDigest: preview.canonicalDigest,
      totalLines: preview.totalLines,
      validRowsCount: adjustedValidCount,
      errorRowsCount: preview.errorRowsCount,
      reviewRequiredCount: adjustedReviewCount,
      duplicateCount: adjustedDuplicateCount,
      totalOrderValueCents: preview.totalOrderValueCents,
      totalCommissionCents: preview.totalCommissionCents,
      totalsByCurrency: preview.totalsByCurrency,
      currencies: preview.currencies,
      marketplaces: preview.marketplaces,
    };

    // 3. Criar import_batch
    const [batch] = await sql<{ id: string }[]>`
      insert into garimpa.import_batch (
        tenant_id,
        marketplace,
        file_digest,
        parser_version,
        status,
        counts,
        created_by, artifact_id
      ) values (
        ${tenantId},
        ${marketplace},
        ${fileDigest},
        ${parserVersion},
        'preview',
        ${JSON.stringify(countsJson)}::jsonb,
        ${context.actorAppUserId ?? context.actor ?? "operator"}, ${input.artifactId??null}
      )
      returning id
    `;

    // 4. Inserir import_row para cada linha avaliada
    for (let i = 0; i < effectiveDecisions.length; i++) {
      const d = effectiveDecisions[i]!;
      const rowDigest = calculateContentDigest({
        batchId: batch.id,
        rowNumber: d.rowNumber,
        externalOrderId: d.externalOrderId,
        externalItemId: d.externalItemId,
        decision: d.decision,
      });
      const [insertedRow] = await sql<{ id: string }[]>`
        insert into garimpa.import_row (
          batch_id,
          tenant_id,
          row_number,
          provider_key,
          row_digest,
          normalized,
          errors,
          decision
        ) values (
          ${batch.id},
          ${tenantId},
          ${d.rowNumber},
          ${d.externalOrderId || null},
          ${rowDigest},
          ${JSON.stringify(d.row ?? {})}::jsonb,
          ${JSON.stringify(d.reason ? [d.reason] : [])}::jsonb,
          ${d.decision}
        )
        returning id
      `;
      if (insertedRow) {
        effectiveDecisions[i] = {
          ...d,
          rowId: insertedRow.id,
        } as any;
      }
    }

    const enrichedPreview: ImportPreview = {
      ...preview,
      validRowsCount: adjustedValidCount,
      reviewRequiredCount: adjustedReviewCount,
      duplicateCount: adjustedDuplicateCount,
      rowDecisions: effectiveDecisions,
    };

    return {
      batchId: batch.id,
      status: "preview",
      preview: enrichedPreview,
      alreadyExisted: false,
    };
  }, sqlFactory);
}

/**
 * Confirma e transaciona um lote de importação com controle estrito de concorrência (EP-08 / G-LEDGER).
 * Rejeita preview adulterado ou versão divergente de digest.
 * Linhas 'review_required' só são comitadas se explicitamente listadas em selectedRowIds.
 * Linhas 'rejected' ou 'duplicate' NUNCA são comitadas.
 */
export async function commitImportBatch(context:AccountContext,input:CommitImportBatchInput,sqlFactory:typeof db=db):Promise<{batchId:string;committedRowsCount:number;alreadyCommitted:boolean;adjustmentsCount?:number}> {
 if(input.tenantId && input.tenantId!==context.tenantId)throw new Error("tenant_mismatch");
 if(!input.batchId||!input.expectedDigest)throw new Error("batch_and_digest_required");
 if(!Array.isArray(input.selectedRowIds))throw new Error("explicit_selection_required");
 const selected=[...new Set(input.selectedRowIds.map(String))].sort();
 const digest=calculateContentDigest({file:input.expectedDigest,selected,resolutions:input.reviewResolutions??{}});
 return withAccountDb(context,async sql=>{
  const tenant=context.tenantId;
  await sql`select pg_advisory_xact_lock(hashtextextended(${tenant+":financial-import"},0))`;
  const [batch]=await sql<any[]>`select * from garimpa.import_batch where id=${input.batchId} and tenant_id=${tenant} for update`;
  if(!batch)throw new Error("batch_not_found");
  if(batch.file_digest!==input.expectedDigest)throw new Error("preview_digest_mismatch");
  if(batch.status==='committed'){
   if(batch.commit_digest!==digest)throw new Error("idempotency_selection_conflict");
   return {batchId:batch.id,committedRowsCount:0,alreadyCommitted:true};
  }
  if(batch.status!=='preview')throw new Error("batch_not_preview");
  if(!selected.length)return {batchId:batch.id,committedRowsCount:0,alreadyCommitted:false};
  const rows=await sql<any[]>`select * from garimpa.import_row where batch_id=${batch.id} and tenant_id=${tenant} order by row_number`;
  const chosen=rows.filter(r=>selected.includes(r.id)||selected.includes(String(r.row_number)));
  if(chosen.length!==selected.length)throw new Error("invalid_row_selection");
  let committedRowsCount=0,adjustmentsCount=0;
  for(const row of chosen){
   if(row.decision==='duplicate'||row.decision==='rejected')throw new Error("row_not_eligible");
   let data=row.normalized as CanonicalImportRow;
   const identityResolution=input.reviewResolutions?.[row.id]??input.reviewResolutions?.[String(row.row_number)];
   if(!isSafeOrderId(data.externalOrderId)){
    if(!identityResolution?.externalOrderId||!isSafeOrderId(identityResolution.externalOrderId)||!identityResolution.rationale?.trim())throw new Error("canonical_order_identity_required");
    data={...data,externalOrderId:identityResolution.externalOrderId};
   }
   if(!data?.currency||!Number.isSafeInteger(data.commissionCents)||data.commissionCents<0||data.marketplace!==batch.marketplace)throw new Error("row_invalid");
   const conversionKey="conversion-v2:"+calculateContentDigest([data.marketplace,data.externalOrderId,data.externalItemId??null]);
   const matches=await sql<any[]>`select * from garimpa.conversion where tenant_id=${tenant} and marketplace=${data.marketplace} and external_order_id=${data.externalOrderId} and external_item_id is not distinct from ${data.externalItemId??null} order by created_at,id limit 2`;
   if(matches.length>1)throw new Error("legacy_conversion_identity_ambiguous_requires_review");
   let conv=matches[0];
   if(conv && conv.currency!==data.currency)throw new Error("conversion_currency_conflict");
   if(!conv){
    [conv]=await sql<any[]>`insert into garimpa.conversion(tenant_id,marketplace,external_order_id,external_item_id,occurred_at,order_value_cents,currency,source,evidence_ref,verification,status,request_id,input_digest)
     values(${tenant},${data.marketplace},${data.externalOrderId},${data.externalItemId??null},${data.occurredAt},${data.orderValueCents??null},${data.currency},'report',${'import_batch:'+batch.id},'documented',${data.status},${conversionKey},${calculateContentDigest(data)}) returning *`;
   }
   const [previous]=await sql<any[]>`select * from garimpa.commission_entry where tenant_id=${tenant} and conversion_id=${conv.id} order by created_at desc,id desc limit 1`;
   const resolution=input.reviewResolutions?.[row.id]??input.reviewResolutions?.[String(row.row_number)];
   const changed=previous && (Number(previous.amount_cents)!==data.commissionCents || previous.state!==data.commissionState);
   const requiresReview=row.decision==='review_required'||(changed&&!data.sourceRevision);
   if(requiresReview && (!resolution?.sourceRevision?.trim()||!resolution.rationale?.trim()))throw new Error("documented_event_resolution_required");
   const revision=data.sourceRevision??resolution?.sourceRevision??"initial";
   const sourceKey="event-v2:"+calculateContentDigest([buildCommissionSourceKey(data.marketplace,data.externalOrderId,data.externalItemId),revision]);
   const [event]=await sql<any[]>`select * from garimpa.commission_entry where tenant_id=${tenant} and source_key=${sourceKey}`;
   if(event){
    if(Number(event.amount_cents)!==data.commissionCents||event.currency!==data.currency||event.state!==data.commissionState)throw new Error("source_event_conflict");
    continue;
   }
   if(previous && !changed && !data.sourceRevision && !resolution)continue;
   const [entry]=await sql<{id:string}[]>`insert into garimpa.commission_entry(tenant_id,conversion_id,source_key,amount_cents,currency,state,occurred_at,source_ref,predecessor_id,input_digest)
    values(${tenant},${conv.id},${sourceKey},${data.commissionCents},${data.currency},${data.commissionState},${data.occurredAt},${'import_batch:'+batch.id+':row:'+row.row_number},${previous?.id??null},${calculateContentDigest({data,revision,predecessor:previous?.id??null})}) returning id`;
   if(!entry)throw new Error("commission_insert_failed");
   await sql`insert into garimpa.conversion_attribution(conversion_id,tenant_id,method,confidence,evidence_ref) values(${conv.id},${tenant},'unknown','unknown',${'import_batch:'+batch.id}) on conflict(conversion_id,tenant_id) do nothing`;
   await sql`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload)
    values(${tenant},'commission_entry',${entry.id},1,'CommissionImported',${context.actorAppUserId!},${'commit:'+batch.id},${sourceKey},${sql.json({batchId:batch.id,rowId:row.id,sourceRevision:revision,resolution:resolution??null,predecessorId:previous?.id??null})})`;
   committedRowsCount++;if(previous)adjustmentsCount++;
  }
  await sql`update garimpa.import_batch set status='committed',commit_digest=${digest} where id=${batch.id} and tenant_id=${tenant}`;
  return {batchId:batch.id,committedRowsCount,adjustmentsCount,alreadyCommitted:false};
 },sqlFactory);
}

/**
 * Consulta um lote de importação e suas linhas sob isolamento estrito de conta (EP-08 / G-PREVIEW).
 */
export async function getImportBatch(
  context: AccountContext,
  batchId: string,
  sqlFactory: typeof db = db,
): Promise<{ batch: any; rows: any[] } | null> {
  return withAccountDb(context, async (sql) => {
    const [batch] = await sql<{
      id: string;
      tenant_id: string;
      marketplace: string;
      file_digest: string;
      parser_version: string;
      status: string;
      counts: any;
      created_by: string;
      created_at: string;
    }[]>`
      select id, tenant_id, marketplace, file_digest, parser_version, status, counts, created_by, created_at::text
      from garimpa.import_batch
      where id = ${batchId} and tenant_id = ${context.tenantId}
      limit 1
    `;
    if (!batch) return null;

    const rows = await sql<{
      id: string;
      row_number: number;
      provider_key: string | null;
      row_digest: string;
      normalized: any;
      errors: any;
      decision: string;
      created_at: string;
    }[]>`
      select id, row_number, provider_key, row_digest, normalized, errors, decision, created_at::text
      from garimpa.import_row
      where batch_id = ${batchId} and tenant_id = ${context.tenantId}
      order by row_number asc
    `;

    return { batch, rows };
  }, sqlFactory);
}

/**
 * Lista lotes de importação do tenant.
 */
export async function listImportBatches(
  context: AccountContext,
  sqlFactory: typeof db = db,
): Promise<any[]> {
  return withAccountDb(context, async (sql) => {
    return sql`
      select id, marketplace, file_digest, parser_version, status, counts, created_by, created_at::text
      from garimpa.import_batch
      where tenant_id = ${context.tenantId}
      order by created_at desc
      limit 50
    `;
  }, sqlFactory);
}
