import type { homepageEngagementReport } from "../../../lib/homepage-db.ts";
import { engagementRates } from "../../../lib/homepage-engagement.ts";
export default function HomepageMetrics({ rows }: { rows: Awaited<ReturnType<typeof homepageEngagementReport>> }) {
  return <details className="curation-manual-edition">
    <summary>Interesse na vitrine · últimos sete dias</summary>
    <p>Uma exibição exige ao menos metade do cartão visível por um segundo. Ações são deduplicadas por visita, produto e posição. Administradores e robôs conhecidos são excluídos da coleta. Taxas aparecem a partir de 50 exibições por posição; ainda não alteram automaticamente a seleção.</p>
    {rows.length ? <div style={{ overflowX: "auto" }}><table><thead><tr><th>Produto</th><th>Local / posição</th><th>Exibições</th><th>Detalhes</th><th>Salvos</th><th>Saídas para loja</th><th>Taxa de saída</th></tr></thead><tbody>{rows.map(row => {
      const rates = engagementRates(row);
      return <tr key={`${row.product_id}:${row.surface}:${row.position}`}><td>{row.product_id}</td><td>{row.surface === "hero" ? "Destaque" : "Grade"} / {row.position + 1}</td><td>{row.impressions}</td><td>{row.details}</td><td>{row.favorites}</td><td>{row.outbound}</td><td>{rates ? `${(rates.outbound * 100).toFixed(1)}%` : "Amostra insuficiente"}</td></tr>;
    })}</tbody></table></div> : <p>Ainda não há exibições registradas. A coleta começa quando a edição compartilhada estiver publicada e receber visitas.</p>}
  </details>;
}
