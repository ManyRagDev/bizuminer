import { pageAccount } from "../../../lib/page-account.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import { commercialRolloutReady } from "../../../lib/commercial-rollout.ts";
import { getCommercialResults } from "../../../lib/commercial-financial-db.ts";
import { getUserMemberships } from "../../../lib/account-context.ts";
import { getPageAuth } from "../../../lib/auth.ts";
import {
  calculateCommissionSummary,
  type CommissionEntry,
} from "../../../lib/commercial-financial-contract.ts";
import FinancialWorkspace from "../financeiro/workspace.tsx";
import AdminLink from "../../_components/admin-link.tsx";

export const dynamic = "force-dynamic";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 100
  );

export default async function Page() {
  const c = await pageAccount();
  const user = await getPageAuth();
  if (!c || !user) return null;

  const resultData = await withAccountDb(c, async (tx) => {
    const ready = await commercialRolloutReady(tx);
    if (!ready) return null;

    const [summary] = await tx<any[]>`
      select 
        (select count(*)::int from garimpa.click_event where tenant_id=${c.tenantId}) as clicks,
        (select count(*)::int from garimpa.conversion where tenant_id=${c.tenantId}) as sales,
        (select count(*)::int from garimpa.commission_entry where tenant_id=${c.tenantId}) as entries
    `;

    const topProducts = await tx<any[]>`
      select p.id, p.title, p.slug, coalesce(p.display_title, p.title) as display_title, count(c.id)::int as clicks
      from garimpa.click_event c
      join garimpa.product p on p.id = c.product_id
      where c.tenant_id = ${c.tenantId}
      group by p.id, p.title, p.slug, p.display_title
      order by clicks desc
      limit 5
    `.catch(() => []);

    return { summary, topProducts };
  });

  const summary = resultData?.summary;
  const topProducts = resultData?.topProducts ?? [];
  const data = summary ? await getCommercialResults(c) : null;

  const entries: CommissionEntry[] =
    (data?.commissions
      .filter((e: any) => e.currency === "BRL")
      .map((e: any) => ({
        id: e.id,
        tenantId: c.tenantId,
        conversionId: e.conversion_id,
        sourceKey: e.source_key,
        amountCents: Number(e.amount_cents),
        currency: e.currency,
        state: e.state,
        occurredAt: e.occurred_at,
        predecessorId: e.predecessor_id,
        sourceRef: e.source_ref,
        createdAt: e.created_at,
      })) as CommissionEntry[]) ?? [];

  const commissions = calculateCommissionSummary(entries, "BRL");

  return (
    <div className="bm-workspace">
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Retorno comercial</p>
        <h1>Desempenho das suas divulgações</h1>
        <p>
          Acompanhe o interesse gerado (cliques) e as comissões registradas a partir dos seus links.
        </p>
      </header>

      {summary ? (
        <>
          {/* Main 3 KPIs */}
          <div className="bm-stats">
            <div>
              <strong>{summary.clicks ?? 0}</strong>
              <span>cliques totais nos seus links</span>
            </div>
            <div>
              <strong>{summary.sales || "0"}</strong>
              <span>vendas confirmadas pelas lojas</span>
            </div>
            <div>
              <strong>{money(commissions.confirmedCents + commissions.receivedCashCents)}</strong>
              <span>comissão confirmada / recebida</span>
            </div>
          </div>

          {/* Top Converting / Clicked Products */}
          <section className="bm-card" style={{ marginTop: "24px" }}>
            <h2>🏆 Produtos mais clicados pelo seu público</h2>
            {topProducts.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
                {topProducts.map((p: any, idx: number) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 800, marginRight: "8px", color: "var(--ink-muted)" }}>
                        #{idx + 1}
                      </span>
                      <strong>{p.display_title || p.title}</strong>
                    </div>
                    <span style={{ fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", padding: "4px 10px", borderRadius: "12px", fontSize: "13px" }}>
                      {p.clicks} {p.clicks === 1 ? "clique" : "cliques"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bm-muted" style={{ margin: "12px 0 0" }}>
                Ainda não há cliques registrados nos seus links. Compartilhe uma oferta hoje para começar a acompanhar.
              </p>
            )}
          </section>

          {/* Commission Breakdown */}
          <section className="bm-card" style={{ marginTop: "24px" }}>
            <h2>Extrato de comissões</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", margin: "16px 0 0" }}>
              <div>
                <dt style={{ fontSize: "12px", color: "var(--ink-muted)", textTransform: "uppercase" }}>Estimada</dt>
                <dd style={{ fontSize: "18px", fontWeight: 700, margin: "4px 0 0" }}>
                  {money(commissions.estimatedCents)}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "12px", color: "var(--ink-muted)", textTransform: "uppercase" }}>Pendente na Loja</dt>
                <dd style={{ fontSize: "18px", fontWeight: 700, margin: "4px 0 0" }}>
                  {money(commissions.pendingCents)}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "12px", color: "var(--ink-muted)", textTransform: "uppercase" }}>Confirmada</dt>
                <dd style={{ fontSize: "18px", fontWeight: 700, color: "#15803d", margin: "4px 0 0" }}>
                  {money(commissions.confirmedCents)}
                </dd>
              </div>
              <div>
                <dt style={{ fontSize: "12px", color: "var(--ink-muted)", textTransform: "uppercase" }}>Recebida na Conta</dt>
                <dd style={{ fontSize: "18px", fontWeight: 700, color: "#15803d", margin: "4px 0 0" }}>
                  {money(commissions.receivedCashCents)}
                </dd>
              </div>
            </dl>
          </section>
        </>
      ) : (
        <p className="bm-notice">
          Os resultados comerciais estão sendo ativados para a sua conta.
        </p>
      )}

      {/* Advanced Reconciliation (Accordion) */}
      {data && (
        <details className="bm-card bm-results-detail" style={{ marginTop: "32px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Opções avançadas: Importar relatórios de vendas e ver conciliação detalhada
          </summary>
          <div style={{ marginTop: "16px" }}>
            <FinancialWorkspace
              accounts={await getUserMemberships(user.id)}
              tenantId={c.tenantId}
              platformOwner={false}
              data={JSON.parse(JSON.stringify(data))}
            />
          </div>
        </details>
      )}
    </div>
  );
}
