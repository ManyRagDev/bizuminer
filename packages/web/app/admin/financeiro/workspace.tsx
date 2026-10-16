"use client";
import { selectAccountAction } from "../account-actions.ts";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserAccountMembership } from "../../../lib/account-context";
import {
  calculateCommissionSummary,
  calculateSaaSRevenueSummary,
  type CostKind,
  type CommissionEntry,
  type SaaSRevenueEntry,
} from "../../../lib/commercial-financial-contract";
import {
  submitOperationalCost,
  submitManualConversion,
  submitCommissionEntry,
  submitSaaSRevenueEntry,
  submitImportBatchPreview,
  submitCommitImportBatch,
  exportFinancialCsvAction,
} from "./actions";

type ConversionRow = {
  id: string;
  marketplace: string;
  occurred_at: string;
  order_value_cents: string | null;
  currency: string;
  verification: string;
  status: string;
};
type LedgerRow = {
  id: string;
  conversion_id?: string | null;
  obligation_key?: string;
  event_key?: string;
  contract_ref?: string;
  source_key?: string;
  amount_cents: string;
  currency: string;
  state: string;
  occurred_at: string;
  source_ref: string;
  predecessor_id: string | null;
  created_at: string;
};
type Data = {
  conversions: ConversionRow[];
  commissions: LedgerRow[];
  revenues: LedgerRow[];
  costs: {
    id: string;
    kind: string;
    amount_cents: string | null;
    currency: string | null;
    duration_seconds: string | null;
  }[];
};
const amount = (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Valor fora do intervalo suportado.");
  return n;
};
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    cents / 100,
  );
export default function FinancialWorkspace({
  accounts,
  tenantId,
  platformOwner,
  data,
}: {
  accounts: UserAccountMembership[];
  tenantId: string;
  platformOwner: boolean;
  data: Data;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [importPreview, setImportPreview] = useState<{
    batchId: string;
    preview: any;
  } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importMarketplace, setImportMarketplace] = useState("shopee");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<
    Record<
      string,
      { sourceRevision: string; rationale: string; externalOrderId?: string }
    >
  >({});
  const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
  const cents = (value: string) => {
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(value))
      throw new Error("Informe um valor com até duas casas decimais.");
    return Math.round(Number(value.replace(",", ".")) * 100);
  };
  const date = (value: string) => new Date(value).toISOString();
  async function save(work: () => Promise<{ ok: boolean; error?: string }>) {
    try {
      const r = await work();
      setMessage(
        r.ok ? "Registro salvo." : (r.error ?? "Registro não concluído."),
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Registro não concluído.",
      );
    }
  }
  async function handlePreview() {
    if (!csvText.trim()) return;
    start(async () => {
      const res = await submitImportBatchPreview({
        tenantId,
        marketplace: importMarketplace,
        csvContent: csvText,
      });
      if (res.ok) {
        setImportPreview(res.data as any);
        setSelectedRowIds([]);
        setResolutions({});
        setMessage("Preview do lote gerado.");
      } else {
        setMessage(res.error);
      }
    });
  }
  async function handleCommit() {
    if (!importPreview) return;
    start(async () => {
      const res = await submitCommitImportBatch({
        tenantId,
        batchId: importPreview.batchId,
        expectedDigest: importPreview.preview.fileDigest,
        selectedRowIds,
        reviewResolutions: resolutions,
      });
      if (res.ok) {
        setMessage(
          `Lote comitado com sucesso (${(res.data as any).committedRowsCount} linhas).`,
        );
        setImportPreview(null);
        setSelectedRowIds([]);
        setCsvText("");
        router.refresh();
      } else {
        setMessage(res.error);
      }
    });
  }
  async function handleExportCsv() {
    start(async () => {
      const res = await exportFinancialCsvAction({ tenantId });
      if (res.ok) {
        const blob = new Blob([res.data.csv], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = res.data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage("Extrato CSV exportado.");
      } else {
        setMessage(res.error);
      }
    });
  }
  const entries: CommissionEntry[] = data.commissions.map((e) => ({
    id: e.id,
    tenantId,
    conversionId: e.conversion_id,
    sourceKey: e.source_key!,
    amountCents: amount(e.amount_cents),
    currency: e.currency,
    state: e.state as CommissionEntry["state"],
    occurredAt: e.occurred_at,
    sourceRef: e.source_ref,
    predecessorId: e.predecessor_id,
    createdAt: e.created_at,
  }));
  const currencies = [...new Set(entries.map((e) => e.currency))];
  const revenues: SaaSRevenueEntry[] = data.revenues.map((e) => ({
    id: e.id,
    tenantId,
    obligationKey: e.obligation_key!,
    eventKey: e.event_key!,
    contractRef: e.contract_ref!,
    amountCents: amount(e.amount_cents),
    currency: e.currency,
    state: e.state as SaaSRevenueEntry["state"],
    occurredAt: e.occurred_at,
    sourceRef: e.source_ref,
    predecessorId: e.predecessor_id,
    createdAt: e.created_at,
  }));
  return (
    <section className="admin-panel">
      <h1>Resultados comerciais</h1>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <label>
          Conta{" "}
          <select
            value={tenantId}
            onChange={async (e) => {
              const target = e.target.value;
              if ((await selectAccountAction(target)).ok) {
                router.push(
                  `/admin/financeiro?conta=${encodeURIComponent(target)}`,
                );
                router.refresh();
              }
            }}
          >
            {accounts.map((a) => (
              <option key={a.affiliateId} value={a.tenantId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleExportCsv} disabled={pending}>
          Exportar Extrato (CSV)
        </button>
      </div>
      <p role="status">{message}</p>
      <h2>Comissões</h2>
      {!entries.length ? (
        <p>Comissões ainda não registradas. Isso não significa receita zero.</p>
      ) : (
        currencies.map((currency) => {
          const s = calculateCommissionSummary(entries, currency);
          return (
            <p key={currency}>
              Pendente: {money(s.pendingCents, currency)} · Confirmada:{" "}
              {money(s.confirmedCents, currency)} · Caixa recebido:{" "}
              {money(s.receivedCashCents, currency)} · Reversões:{" "}
              {money(s.reversedCents, currency)}
            </p>
          );
        })
      )}
      <form
        action={(f) =>
          start(() =>
            save(() =>
              submitManualConversion({
                tenantId,
                marketplace: val(f, "marketplace"),
                occurredAt: date(val(f, "date")),
                currency: val(f, "currency").toUpperCase(),
                orderValueCents: val(f, "value")
                  ? cents(val(f, "value"))
                  : null,
                evidenceRef: val(f, "source") || null,
                verification: val(f, "source") ? "documented" : "declared",
                requestId: crypto.randomUUID(),
              }),
            ),
          )
        }
      >
        <h2>Registrar venda conhecida</h2>
        <p>
          A origem da campanha ficará desconhecida quando não houver
          comprovação.
        </p>
        <label>
          Loja{" "}
          <select name="marketplace">
            <option value="mercadolivre">Mercado Livre</option>
            <option value="shopee">Shopee</option>
            <option value="aliexpress">AliExpress</option>
          </select>
        </label>
        <label>
          Data <input name="date" type="datetime-local" required />
        </label>
        <label>
          Moeda{" "}
          <input name="currency" defaultValue="BRL" required maxLength={3} />
        </label>
        <label>
          Valor, se conhecido <input name="value" inputMode="decimal" />
        </label>
        <label>
          Referência documental, se disponível <input name="source" />
        </label>
        <button disabled={pending}>Salvar venda</button>
      </form>
      <form
        action={(f) =>
          start(() =>
            save(() =>
              submitCommissionEntry({
                tenantId,
                conversionId: val(f, "conversion") || null,
                sourceKey: val(f, "sourceKey"),
                amountCents: cents(val(f, "amount")),
                currency: val(f, "currency").toUpperCase(),
                state: val(f, "state") as CommissionEntry["state"],
                occurredAt: date(val(f, "date")),
                sourceRef: val(f, "source"),
                predecessorId: val(f, "predecessor") || null,
              }),
            ),
          )
        }
      >
        <h2>Registrar comissão ou ajuste</h2>
        <label>
          Venda{" "}
          <select name="conversion">
            <option value="">Sem atribuição a pedido</option>
            {data.conversions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.marketplace} · {c.occurred_at}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identificador do evento <input name="sourceKey" required />
        </label>
        <label>
          Valor <input name="amount" inputMode="decimal" required />
        </label>
        <label>
          Moeda{" "}
          <input name="currency" defaultValue="BRL" required maxLength={3} />
        </label>
        <label>
          Estado{" "}
          <select name="state">
            <option value="estimated">Estimado</option>
            <option value="pending">Pendente</option>
            <option value="confirmed">Confirmado</option>
            <option value="received">Recebido</option>
            <option value="reversed">Revertido</option>
          </select>
        </label>
        <label>
          Data <input name="date" type="datetime-local" required />
        </label>
        <label>
          Fonte <input name="source" required />
        </label>
        <label>
          Lançamento anterior{" "}
          <select name="predecessor">
            <option value="">Nova obrigação</option>
            {data.commissions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.source_key} · {e.state}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pending}>Salvar lançamento</button>
      </form>
      <h2>Importação de comissões (CSV)</h2>
      <p>
        Envie o extrato CSV canônico para validação, deduplicação e lançamento
        transacional com idempotência.
      </p>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          margin: "0.5rem 0",
        }}
      >
        <label>
          Loja
          <select
            value={importMarketplace}
            onChange={(e) => setImportMarketplace(e.target.value)}
          >
            <option value="shopee">Shopee</option>
            <option value="mercadolivre">Mercado Livre</option>
            <option value="aliexpress">AliExpress</option>
          </select>
        </label>
        <label>
          Upload de arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const text = await file.text();
                setCsvText(text);
              }
            }}
          />
        </label>
      </div>
      <label>
        Ou cole o conteúdo CSV
        <textarea
          rows={5}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="Cole o CSV com cabeçalho (externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState)"
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
        <button
          type="button"
          onClick={handlePreview}
          disabled={pending || !csvText.trim()}
        >
          Gerar preview do lote
        </button>
        {importPreview && (
          <button
            type="button"
            onClick={handleCommit}
            disabled={pending || selectedRowIds.length === 0}
          >
            Confirmar e lançar lote no ledger
          </button>
        )}
      </div>
      {importPreview && (
        <div
          style={{
            margin: "0.5rem 0",
            padding: "0.75rem",
            background: "#f5f5f5",
            borderRadius: "4px",
          }}
        >
          <h3>
            Preview do lote: {importPreview.preview.validRowsCount} válidas ·{" "}
            {importPreview.preview.errorRowsCount} erros ·{" "}
            {importPreview.preview.duplicateCount} duplicatas ·{" "}
            {importPreview.preview.reviewRequiredCount} exigem revisão
          </h3>
          <p>
            Digest do lote:{" "}
            <code>{importPreview.preview.fileDigest.slice(0, 16)}...</code>
          </p>
          {Object.entries(importPreview.preview.totalsByCurrency || {}).map(
            ([curr, tot]: any) => (
              <p key={curr}>
                Moeda {curr}: Comissões {money(tot.commissionCents, curr)} ·
                Pedidos {money(tot.orderValueCents, curr)}
              </p>
            ),
          )}
          {importPreview.preview.rowDecisions &&
            importPreview.preview.rowDecisions.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedRowIds(
                      importPreview.preview.rowDecisions
                        .filter((r: any) => r.decision === "imported")
                        .map((r: any) => String(r.rowNumber)),
                    )
                  }
                >
                  Selecionar linhas elegíveis sem revisão
                </button>
                <button type="button" onClick={() => setSelectedRowIds([])}>
                  Desmarcar todas
                </button>
                <h4>
                  Decisões por linha (
                  {importPreview.preview.rowDecisions.length} linhas)
                </h4>
                {importPreview.preview.reviewRequiredCount > 0 && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const reviewIds = importPreview.preview.rowDecisions
                          .filter((d: any) => d.decision === "review_required")
                          .map((d: any) => String(d.rowNumber));
                        setSelectedRowIds(reviewIds);
                      }}
                    >
                      Selecionar todas que exigem revisão (
                      {importPreview.preview.reviewRequiredCount})
                    </button>{" "}
                    <button type="button" onClick={() => setSelectedRowIds([])}>
                      Desmarcar todas
                    </button>
                  </div>
                )}
                <table
                  style={{
                    width: "100%",
                    fontSize: "0.875rem",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #ccc",
                        textAlign: "left",
                      }}
                    >
                      <th>Sel.</th>
                      <th>Linha</th>
                      <th>Pedido</th>
                      <th>Item</th>
                      <th>Decisão</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.preview.rowDecisions.map(
                      (d: any, idx: number) => {
                        const rowKey = String(d.rowNumber);
                        const isChecked = selectedRowIds.includes(rowKey);
                        const isReview = d.decision === "review_required";
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: "1px solid #eee",
                              background: isReview ? "#fff9db" : "transparent",
                            }}
                          >
                            <td>
                              {isReview || d.decision === "imported" ? (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowIds((prev) => [
                                        ...prev,
                                        rowKey,
                                      ]);
                                    } else {
                                      setSelectedRowIds((prev) =>
                                        prev.filter((id) => id !== rowKey),
                                      );
                                    }
                                  }}
                                />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{d.rowNumber}</td>
                            <td>
                              <code>{d.externalOrderId}</code>
                            </td>
                            <td>
                              <code>{d.externalItemId || "—"}</code>
                            </td>
                            <td>
                              <strong>{d.decision}</strong>
                            </td>
                            <td>
                              {d.reason || "—"}
                              {isReview && (
                                <>
                                  <label>
                                    Identidade canônica do pedido, se a origem
                                    estiver agregada{" "}
                                    <input
                                      value={
                                        resolutions[rowKey]?.externalOrderId ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setResolutions((v) => ({
                                          ...v,
                                          [rowKey]: {
                                            sourceRevision:
                                              v[rowKey]?.sourceRevision ?? "",
                                            rationale:
                                              v[rowKey]?.rationale ?? "",
                                            externalOrderId: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label>
                                    Revisão documental do evento{" "}
                                    <input
                                      value={
                                        resolutions[rowKey]?.sourceRevision ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setResolutions((v) => ({
                                          ...v,
                                          [rowKey]: {
                                            ...v[rowKey],
                                            sourceRevision: e.target.value,
                                            rationale:
                                              v[rowKey]?.rationale ?? "",
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label>
                                    Justificativa e referência de origem{" "}
                                    <input
                                      value={
                                        resolutions[rowKey]?.rationale ?? ""
                                      }
                                      onChange={(e) =>
                                        setResolutions((v) => ({
                                          ...v,
                                          [rowKey]: {
                                            ...v[rowKey],
                                            sourceRevision:
                                              v[rowKey]?.sourceRevision ?? "",
                                            rationale: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
      <h2>Vendas registradas</h2>
      {!data.conversions.length ? (
        <p>Nenhuma venda registrada nesta conta.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Data</th>
              <th>Valor</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {data.conversions.map((c) => (
              <tr key={c.id}>
                <td>{c.marketplace}</td>
                <td>{c.occurred_at}</td>
                <td>
                  {c.order_value_cents === null
                    ? "Desconhecido"
                    : money(amount(c.order_value_cents), c.currency)}
                </td>
                <td>
                  {c.verification === "declared" ? "Declarada" : "Documentada"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Custos</h2>
      {!data.costs.length ? (
        <p>Custos ainda não monitorados. Margem não calculada.</p>
      ) : (
        data.costs.map((c) => (
          <p key={c.id}>
            {c.kind}:{" "}
            {c.amount_cents !== null && c.currency
              ? money(amount(c.amount_cents), c.currency)
              : c.duration_seconds
                ? `${c.duration_seconds} segundos, sem tarifa informada`
                : "Valor desconhecido"}
          </p>
        ))
      )}
      <form
        action={(f) =>
          start(() =>
            save(() =>
              submitOperationalCost({
                tenantId,
                requestId: crypto.randomUUID(),
                kind: val(f, "kind") as CostKind,
                amountCents: val(f, "amount") ? cents(val(f, "amount")) : null,
                currency: val(f, "currency").toUpperCase(),
                durationSeconds: val(f, "seconds")
                  ? Number(val(f, "seconds"))
                  : null,
                source: val(f, "source"),
                periodStart: date(val(f, "start")),
                periodEnd: date(val(f, "end")),
              }),
            ),
          )
        }
      >
        <h3>Registrar custo ou tempo</h3>
        <label>
          Tipo{" "}
          <select name="kind">
            <option value="infrastructure">Infraestrutura</option>
            <option value="ai">IA</option>
            <option value="messaging">Mensagens</option>
            <option value="creative">Criação</option>
            <option value="human_time">Tempo humano</option>
          </select>
        </label>
        <label>
          Valor conhecido <input name="amount" inputMode="decimal" />
        </label>
        <label>
          Moeda <input name="currency" defaultValue="BRL" maxLength={3} />
        </label>
        <label>
          Duração em segundos{" "}
          <input name="seconds" type="number" min={0} step={1} />
        </label>
        <label>
          Fonte <input name="source" required />
        </label>
        <label>
          Início <input name="start" type="datetime-local" required />
        </label>
        <label>
          Fim <input name="end" type="datetime-local" required />
        </label>
        <button disabled={pending}>Salvar custo</button>
      </form>
      {platformOwner && (
        <>
          <h2>Receita SaaS da plataforma</h2>
          {!revenues.length ? (
            <p>Receita SaaS ainda não registrada.</p>
          ) : (
            [...new Set(revenues.map((e) => e.currency))].map((currency) => {
              const s = calculateSaaSRevenueSummary(revenues, currency);
              return (
                <p key={currency}>
                  Faturamento: {money(s.billedNetCents, currency)} · Caixa:{" "}
                  {money(s.receivedCashCents, currency)}
                </p>
              );
            })
          )}
          <form
            action={(f) =>
              start(() =>
                save(() =>
                  submitSaaSRevenueEntry({
                    tenantId,
                    obligationKey: val(f, "obligation"),
                    eventKey: val(f, "event"),
                    contractRef: val(f, "contract"),
                    amountCents: cents(val(f, "amount")),
                    currency: val(f, "currency").toUpperCase(),
                    state: val(f, "state") as SaaSRevenueEntry["state"],
                    occurredAt: date(val(f, "date")),
                    sourceRef: val(f, "source"),
                    predecessorId: val(f, "predecessor") || null,
                  }),
                ),
              )
            }
          >
            <label>
              Obrigação/competência <input name="obligation" required />
            </label>
            <label>
              Evento <input name="event" required />
            </label>
            <label>
              Contrato <input name="contract" required />
            </label>
            <label>
              Valor <input name="amount" required inputMode="decimal" />
            </label>
            <label>
              Moeda{" "}
              <input
                name="currency"
                required
                defaultValue="BRL"
                maxLength={3}
              />
            </label>
            <label>
              Estado{" "}
              <select name="state">
                <option value="billed">Faturado</option>
                <option value="received">Recebido</option>
                <option value="reversed">Revertido</option>
              </select>
            </label>
            <label>
              Data <input name="date" type="datetime-local" required />
            </label>
            <label>
              Fonte <input name="source" required />
            </label>
            <label>
              Evento anterior{" "}
              <select name="predecessor">
                <option value="">Sem evento anterior</option>
                {data.revenues.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.event_key} · {e.state}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={pending}>Registrar receita SaaS</button>
          </form>
        </>
      )}
    </section>
  );
}
