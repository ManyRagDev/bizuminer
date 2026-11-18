"use server";

import { revalidatePath } from "next/cache";
import { isKnownMarketplace } from "../../../lib/marketplaces.ts";
import { REPORT_CURRENCIES, saveMarketplacePerformance } from "../../../lib/marketplace-performance-db.ts";
import { pageAccount } from "../../../lib/page-account.ts";

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function count(value: string): number | null {
  if (!value) return null;
  if (!/^\d{1,10}$/.test(value) || Number(value) > 2147483647) {
    throw new Error("Informe cliques e pedidos como números inteiros entre 0 e 2.147.483.647.");
  }
  return Number(value);
}

function cents(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{1,12})(?:[,.](\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("Informe valores sem separador de milhar e com até duas casas decimais.");
  return String(BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")));
}

export async function submitMarketplacePerformance(tenantId: string, form: FormData) {
  const context = await pageAccount();
  if (!context || context.tenantId !== tenantId || context.membershipRole !== "owner") {
    return { ok: false, message: "Selecione a conta correta. Somente o titular pode salvar os totais." };
  }

  const marketplace = field(form, "marketplace");
  const currency = REPORT_CURRENCIES.find((code) => code === field(form, "currency"));
  if (!isKnownMarketplace(marketplace) || !currency) {
    return { ok: false, message: "Selecione uma loja e uma moeda válidas." };
  }

  const periodStart = field(form, "periodStart");
  const periodEnd = field(form, "periodEnd");
  if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
    return { ok: false, message: "Informe um período válido. A data final deve ser igual ou posterior à inicial." };
  }

  let metrics;
  try {
    metrics = {
      clicks: count(field(form, "clicks")),
      orders: count(field(form, "orders")),
      salesCents: cents(field(form, "sales")),
      commissionCents: cents(field(form, "commission")),
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  if (Object.values(metrics).every((value) => value === null)) {
    return { ok: false, message: "Preencha pelo menos uma métrica. Use zero quando o relatório informar zero." };
  }

  try {
    await saveMarketplacePerformance(context, { marketplace, periodStart, periodEnd, currency, ...metrics });
  } catch {
    return { ok: false, message: "Não foi possível salvar o relatório agora. Tente novamente." };
  }

  revalidatePath("/admin/resultados");
  return { ok: true, message: "Totais da loja salvos." };
}
