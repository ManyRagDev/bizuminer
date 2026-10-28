import { priceHistoryView, type HistoryContext, type HistoryPoint } from "../../../lib/price-history";
import { offerPriceLabel } from "../../../lib/offer-price";
import styles from "./price-history.module.css";

const date = (value: Date | string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });

export default function PriceHistory({ points, context, totalCount }: { points: HistoryPoint[]; context?: HistoryContext; totalCount: number }) {
  const view = priceHistoryView(points, context);
  const money = (cents: number) => offerPriceLabel({ priceCents: cents, currency: context?.currency, priceType: "exact" });
  const path = view.coordinates.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return <section className="history-section" aria-labelledby="history-title">
    <div><p className="eyebrow">Antes de decidir</p><h2 id="history-title">Como esse preço mudou?</h2>
      <p>{view.explanation}</p>
      <p className={styles.counts}>{totalCount} registro{totalCount === 1 ? "" : "s"} coletado{totalCount === 1 ? "" : "s"} no anúncio · {view.series.length} comparáve{view.series.length === 1 ? "l" : "is"} nos últimos {context?.windowDays ?? 90} dias.</p>
      {!!context?.excludedCount && <p className={styles.counts}>{context.excludedCount} registro{context.excludedCount === 1 ? " ficou fora porque não confirma" : "s ficaram fora porque não confirmam"} a mesma versão, moeda ou condições de compra.</p>}
    </div>
    <div className="history-card">
      {view.series.length ? <>
        <svg className={styles.chart} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Histórico desta versão: de ${money(view.min!)} a ${money(view.max!)}. ${view.explanation}`}>
          <path className={styles.grid} d="M5 86H95 M5 50H95 M5 16H95" />
          {view.series.length > 1 && <path className={styles.line} d={path} />}
          {view.coordinates.map((p, i) => <circle key={i} className={styles.point} cx={p.x} cy={p.y} r={view.series.length === 1 ? 2 : 1}><title>{date(p.observed_at)}: {money(p.price_cents)}</title></circle>)}
        </svg>
        <div className={styles.dates}><span>{date(view.series[0].observed_at)}</span><span>{date(view.series[view.series.length - 1].observed_at)}</span></div>
        <dl><div><dt>menor nesta comparação</dt><dd>{money(view.min!)}</dd></div><div><dt>maior nesta comparação</dt><dd>{money(view.max!)}</dd></div></dl>
        <details className={styles.records}><summary>Ver os preços e as datas</summary><div className={styles.table}><table><thead><tr><th>Data</th><th>Preço observado</th></tr></thead><tbody>{view.series.map((p, i) => <tr key={i}><td>{new Date(p.observed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td>{money(p.price_cents)}</td></tr>)}</tbody></table></div></details>
      </> : <div className={styles.empty}><span aria-hidden="true">↗</span><strong>A comparação ainda está sendo formada</strong><p>Você pode conferir a oferta na loja enquanto reunimos os dados que faltam.</p></div>}
    </div>
  </section>;
}
