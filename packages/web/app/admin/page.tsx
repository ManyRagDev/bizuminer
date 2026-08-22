import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { adminOverview, captureRuns, runningRun, topClicked } from "../../lib/admin-db";
import { getPageAuth, isAdmin } from "../../lib/auth";
import { shareBaseUrl } from "../../lib/site-url";
import AdminPanel, { type AdminRun } from "./admin-panel";
import Composer from "./composer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel | BizuMiner",
  robots: { index: false, follow: false },
};

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export default async function AdminPage() {
  const user = await getPageAuth();
  if (!user) redirect("/entrar?next=/admin");

  // O painel é exclusivo do dono: qualquer outra conta autenticada leva 403
  // aqui, no servidor — o middleware só redireciona, não autoriza.
  if (!isAdmin(user)) {
    return (
      <main className="admin-page">
        <header className="detail-header">
          <a className="brand" href="/" aria-label="BizuMiner, início">
            <Image src="/brand/bizuminer-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} priority className="brand-mark-img" />
            <span className="brand-name"><b>Bizu</b><i>Miner</i></span>
          </a>
          <div className="detail-header-actions">
            <a href="/">← ver o site</a>
          </div>
        </header>
        <section className="admin-deny" role="alert">
          <p className="eyebrow">Painel do administrador</p>
          <h1>Sem acesso</h1>
          <p>Este painel é exclusivo do dono do BizuMiner. Se você acha que deveria estar aqui, entre com a conta correta.</p>
          <form action="/auth/sair" method="post"><button className="auth-signout" type="submit">trocar de conta</button></form>
        </section>
      </main>
    );
  }

  const [overview, runs, running, clicked] = await Promise.all([
    adminOverview(),
    captureRuns(20),
    runningRun(),
    topClicked(7, 6),
  ]);

  const serializedRuns: AdminRun[] = runs.map((run) => ({
    id: run.id,
    marketplace: run.marketplace,
    status: run.status,
    startedAt: iso(run.started_at)!,
    finishedAt: iso(run.finished_at),
    itemsCaptured: run.items_captured,
    itemsNew: run.items_new,
    priceChanges: run.price_changes,
    error: run.error,
    observationCount: run.observation_count,
  }));

  return (
    <main className="admin-page">
      <header className="detail-header">
        <a className="brand" href="/" aria-label="BizuMiner, início">
          <Image src="/brand/bizuminer-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} priority className="brand-mark-img" />
          <span className="brand-name"><b>Bizu</b><i>Miner</i></span>
        </a>
        <span className="admin-tag">painel do administrador</span>
        <div className="detail-header-actions">
          <form action="/auth/sair" method="post"><button className="auth-signout" type="submit">sair</button></form>
          <a href="/">← ver o site</a>
        </div>
      </header>

      <section className="admin-section" aria-label="Visão geral">
        <div className="metric-row">
          <div className="metric-card"><b>{overview.products.toLocaleString("pt-BR")}</b><span>produtos</span></div>
          <div className="metric-card"><b>{overview.observations.toLocaleString("pt-BR")}</b><span>registros de preço</span></div>
          <div className="metric-card"><b>{overview.runs.toLocaleString("pt-BR")}</b><span>rodagens</span></div>
          <div className="metric-card"><b>{overview.clicks7d.toLocaleString("pt-BR")}</b><span>cliques afiliados · 7d</span></div>
          <div className="metric-card"><b>{overview.publications.toLocaleString("pt-BR")}</b><span>publicações</span></div>
          <div className="metric-card"><b>{overview.subscribers.toLocaleString("pt-BR")}</b><span>assinantes</span></div>
        </div>
      </section>

      <AdminPanel initialRuns={serializedRuns} initialRunningId={running?.id ?? null} />

      <Composer baseUrl={shareBaseUrl()} />

      <section className="admin-columns">
        <section className="admin-section" aria-labelledby="clicked-title">
          <h2 id="clicked-title">Mais clicados · últimos 7 dias</h2>
          {clicked.length === 0 ? (
            <p className="member-empty">Nenhum clique afiliado registrado no período.</p>
          ) : (
            <ol className="admin-list">
              {clicked.map((item) => (
                <li key={item.slug}>
                  <a href={`/bizu/${item.slug}`}>{item.title}</a>
                  <b>{item.clicks}</b>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="admin-section" aria-labelledby="members-title">
          <h2 id="members-title">Área do comprador</h2>
          <dl className="admin-facts">
            <div><dt>pessoas com dados salvos</dt><dd>{overview.members.toLocaleString("pt-BR")}</dd></div>
            <div><dt>favoritos gravados</dt><dd>{overview.favorites.toLocaleString("pt-BR")}</dd></div>
            <div><dt>itens sob acompanhamento</dt><dd>{overview.activeWatches.toLocaleString("pt-BR")}</dd></div>
            <div><dt>perfis preenchidos</dt><dd>{overview.profiles.toLocaleString("pt-BR")}</dd></div>
            <div>
              <dt>última rodagem ok</dt>
              <dd>
                {overview.lastOkRunAt
                  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(overview.lastOkRunAt))
                  : "nunca"}
              </dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}
