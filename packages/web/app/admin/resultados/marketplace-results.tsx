import { marketplaceDef } from "../../../lib/marketplaces.ts";
import { REPORT_CURRENCIES, type MarketplacePerformance } from "../../../lib/marketplace-performance-db.ts";
import MarketplaceReportForm from "./marketplace-report-form.tsx";

const integer = new Intl.NumberFormat("pt-BR");

function money(cents: string | null, currency: string) {
  return cents === null ? "—" : new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(cents) / 100);
}

function dateLabel(date: string) {
  return date.split("-").reverse().join("/");
}

export default function MarketplaceResults({ clicks, reports, tenantId, canEdit }: {
  clicks: { marketplace: string; clicks: number }[];
  reports: MarketplacePerformance[] | null;
  tenantId: string;
  canEdit: boolean;
}) {
  return (
    <section className="bm-card bm-marketplace-results">
      <h2>Resultados por loja</h2>
      <h3>Cliques medidos pelo BizuMiner</h3>
      <p className="bm-muted">Histórico de cliques registrados. As saídas pelos links assinados da Pauta ainda ficam fora desta contagem.</p>
      {clicks.length ? (
        <dl className="bm-marketplace-clicks">
          {clicks.map((row) => (
            <div key={row.marketplace}>
              <dt>{marketplaceDef(row.marketplace)?.label ?? row.marketplace}</dt>
              <dd>{integer.format(row.clicks)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="bm-muted">Ainda não há cliques registrados.</p>}

      <h3>Totais dos painéis de afiliados</h3>
      {reports === null ? (
        <p className="bm-muted">O registro de relatórios ainda não está disponível.</p>
      ) : (
        <>
          <p className="bm-muted">
            Dados copiados dos painéis das lojas. Cada linha cobre o período indicado. Um traço indica um dado ausente.
          </p>
          {reports.length > 0 ? (
            <div className="bm-marketplace-table" tabIndex={0} role="region" aria-label="Totais por loja e período">
              <table>
                <caption>Até 30 registros, ordenados pela data final do período</caption>
                <thead>
                  <tr>
                    <th scope="col">Loja</th>
                    <th scope="col">Período</th>
                    <th scope="col">Cliques da loja</th>
                    <th scope="col">Pedidos</th>
                    <th scope="col">Valor de vendas</th>
                    <th scope="col">Comissão informada</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={`${report.marketplace}/${report.periodStart}/${report.periodEnd}`}>
                      <th scope="row">{marketplaceDef(report.marketplace)?.label ?? report.marketplace}</th>
                      <td>{dateLabel(report.periodStart)} a {dateLabel(report.periodEnd)}</td>
                      <td>{report.clicks === null ? "—" : integer.format(report.clicks)}</td>
                      <td>{report.orders === null ? "—" : integer.format(report.orders)}</td>
                      <td>{money(report.salesCents, report.currency)}</td>
                      <td>{money(report.commissionCents, report.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="bm-muted">Ainda não há totais de lojas registrados.</p>}
          {canEdit && <MarketplaceReportForm key={tenantId} tenantId={tenantId} currencies={REPORT_CURRENCIES} />}
        </>
      )}
    </section>
  );
}
