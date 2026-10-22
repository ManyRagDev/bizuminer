"use server";
import { savePrivateArtifact } from "../../../lib/private-artifact-db.ts";

import { commercialActionError } from "../../../lib/commercial-messages.ts";
import { revalidatePath } from "next/cache";
import { getPageAuth, isAffiliate } from "../../../lib/auth.ts";
import { resolveAccountContext } from "../../../lib/account-context.ts";
import {
  recordManualConversion,
  recordOperationalCost,
  type RecordOperationalCostInput,
  recordCommissionEntry,
  recordSaaSRevenueEntry,
  type RecordManualConversionInput,
  type RecordCommissionEntryInput,
  type RecordSaaSRevenueInput,
  createOrGetImportBatchPreview,
  commitImportBatch,
  getCommercialResults,
  type CreateImportBatchInput,
  type CommitImportBatchInput,
} from "../../../lib/commercial-financial-db.ts";
import { exportFinancialLedgerCsv } from "../../../lib/commission-import-contract.ts";

export type FinancialActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Registra uma conversão manual com autorização estrita de conta no servidor (C-01 / C-07).
 */
export async function submitManualConversion(
  input: RecordManualConversionInput,
): Promise<FinancialActionResult<{ conversionId: string; alreadyExisted: boolean }>> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const result = await recordManualConversion(context, input);
    revalidatePath("/admin");
    revalidatePath("/admin/financeiro");
    return { ok: true, data: result };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}

/**
 * Registra lançamento de comissão com contexto de conta autorizado pelo servidor (C-07).
 */
export async function submitCommissionEntry(
  input: RecordCommissionEntryInput,
): Promise<FinancialActionResult<{ entryId: string; alreadyExisted: boolean }>> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const result = await recordCommissionEntry(context, input);
    revalidatePath("/admin");
    revalidatePath("/admin/financeiro");
    return { ok: true, data: result };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}

/**
 * Registra lançamento de receita SaaS com contexto de conta autorizado pelo servidor (C-07).
 */
export async function submitSaaSRevenueEntry(
  input: RecordSaaSRevenueInput,
): Promise<FinancialActionResult<{ entryId: string; alreadyExisted: boolean }>> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const result = await recordSaaSRevenueEntry(context, input);
    revalidatePath("/admin");
    revalidatePath("/admin/financeiro");
    return { ok: true, data: result };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}

export async function submitOperationalCost(input: RecordOperationalCostInput): Promise<FinancialActionResult> {
 const user=await getPageAuth();
 if(!user || !(await isAffiliate(user))) return {ok:false,error:"Acesso não autorizado."};
 const context=await resolveAccountContext({authUserId:user.id,requestedAccount:input.tenantId??null});
 if(!context) return {ok:false,error:"Conta não autorizada."};
 try {const data=await recordOperationalCost(context,input);revalidatePath("/admin/financeiro");return {ok:true,data};}
 catch(error) {return {ok:false,error:commercialActionError(error)};}
}

/**
 * Envia um arquivo CSV de comissão e gera/recupera o preview com validação e detecção de duplicatas (EP-08 / G-PREVIEW).
 */
export async function submitImportBatchPreview(
  input: CreateImportBatchInput,
): Promise<FinancialActionResult> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const bytes=new TextEncoder().encode(input.csvContent);
    if(bytes.length>750000)throw new Error("Arquivo excede o limite de 750 kB desta interface.");
    const original=await savePrivateArtifact(context,{kind:"commission_original",name:"commission-original.csv",bytes,mime:"text/csv"});
    const data = await createOrGetImportBatchPreview(context, {...input,artifactId:original.id});
    revalidatePath("/admin/financeiro");
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}

/**
 * Confirma a importação de um lote previamente validado (EP-08 / G-LEDGER).
 */
export async function submitCommitImportBatch(
  input: CommitImportBatchInput,
): Promise<FinancialActionResult> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const data = await commitImportBatch(context, input);
    revalidatePath("/admin");
    revalidatePath("/admin/financeiro");
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}

/**
 * Exporta o extrato financeiro comercial da conta em CSV com sanitização estrita de fórmulas.
 */
export async function exportFinancialCsvAction(input: {
  tenantId?: string;
}): Promise<FinancialActionResult<{ csv: string; filename: string }>> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    return { ok: false, error: "Acesso não autorizado." };
  }

  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: input.tenantId ?? null,
  });

  if (!context) {
    return { ok: false, error: "Conta não autorizada para o operador." };
  }

  try {
    const results = await getCommercialResults(context);
    const csv = exportFinancialLedgerCsv(
      results.conversions.map((c) => ({
        marketplace: c.marketplace,
        occurredAt: c.occurred_at,
        orderValueCents: c.order_value_cents ? Number(c.order_value_cents) : null,
        currency: c.currency,
        verification: c.verification,
        status: c.status,
      })),
      results.commissions.map((e) => ({
        sourceKey: e.source_key,
        amountCents: Number(e.amount_cents),
        currency: e.currency,
        state: e.state,
        occurredAt: e.occurred_at,
        sourceRef: e.source_ref,
        predecessorId: e.predecessor_id,
      })),
    );
    const filename = `extrato-financeiro-${context.tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;
    return { ok: true, data: { csv, filename } };
  } catch (err: any) {
    return { ok: false, error: commercialActionError(err) };
  }
}
