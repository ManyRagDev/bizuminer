"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MARKETPLACES } from "../../../lib/marketplaces.ts";
import { submitMarketplacePerformance } from "./actions.ts";

export default function MarketplaceReportForm({ tenantId, currencies }: {
  tenantId: string;
  currencies: readonly string[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitMarketplacePerformance>> | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await submitMarketplacePerformance(tenantId, data);
        if (response.ok) form.reset();
        setResult(response);
      } catch {
        setResult({ ok: false, message: "Não foi possível enviar o formulário. Tente novamente." });
      }
    });
  }

  return (
    <details className="bm-results-detail">
      <summary>Registrar totais do painel da loja</summary>
      <p className="bm-muted">
        Copie os totais do período no painel de afiliados. Para corrigir um registro, preencha novamente os
        campos disponíveis para a mesma loja e as mesmas datas.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <div className="bm-marketplace-report-fields">
            <label>
              Loja
              <select name="marketplace" defaultValue="shopee" required>
                {MARKETPLACES.map(({ slug, label }) => <option key={slug} value={slug}>{label}</option>)}
              </select>
            </label>
            <label>Data inicial<input name="periodStart" type="date" required /></label>
            <label>Data final<input name="periodEnd" type="date" required /></label>
            <label>
              Moeda
              <select name="currency" defaultValue="BRL" required>
                {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <label>Cliques<input name="clicks" type="number" min="0" max="2147483647" step="1" /></label>
            <label>Pedidos<input name="orders" type="number" min="0" max="2147483647" step="1" /></label>
            <label>Valor de vendas<input name="sales" inputMode="decimal" placeholder="0,00" maxLength={15} /></label>
            <label>Comissão informada<input name="commission" inputMode="decimal" placeholder="0,00" maxLength={15} /></label>
          </div>
          <button className="bm-button" type="submit">{pending ? "Salvando…" : "Salvar totais"}</button>
        </fieldset>
        {result && <p role={result.ok ? "status" : "alert"}>{result.message}</p>}
      </form>
    </details>
  );
}
