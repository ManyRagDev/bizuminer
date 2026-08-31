import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { adminOverview, captureRuns, runningRun, topClicked } from "../../lib/admin-db";
import { listAffiliateAccounts, type AffiliateAccountSummary } from "../../lib/affiliate-db";
import { getPageAuth, isAdmin } from "../../lib/auth";
import { shareBaseUrl } from "../../lib/site-url";
import { bookmarkletCompiles, bookmarkletHref } from "../../lib/bookmarklet";
import { captureEnabled } from "../../lib/platform-gates";
import { marketplaceCounts } from "../../lib/db";
import { MARKETPLACES } from "../../lib/marketplaces";
import AdminPanel, { type AdminRun } from "./admin-panel";
import AdminTabs from "./admin-tabs";
import PlatformStatus, { type PlatformStatusRow } from "./platform-status";
import Composer from "./composer";
import Capturador from "./capturador";
import Affiliates from "./affiliates";
import Devices from "./devices";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel | BizuMiner",
  robots: { index: false, follow: false },
};

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

/**
 * Painel de rodagem por plataforma: endpoint de disparo + o aviso mostrado
 * quando o gate está desligado.
 *
 * O aviso fica aqui, explícito por loja, DE PROPÓSITO: é prosa, não lógica.
 * Cada plataforma está desligada por um motivo diferente — o ML por decisão
 * de risco (scraping), a Shopee por falta de credencial — e genericizar isso
 * produziria um "plataforma indisponível" que não ajuda ninguém a agir.
 *
 * Plataforma sem entrada aqui simplesmente não ganha painel de rodagem — é
 * o caso da AliExpress até a API ser aprovada (M5): ela não aparece
 * prometendo um botão que não existe.
 */
const RUN_PANELS: Record<string, { triggerPath: string; disabledNotice: ReactNode }> = {
  mercadolivre: {
    triggerPath: "/api/admin/rodagem",
    disabledNotice: (
      <>
        A varredura automatizada do Mercado Livre está <b>desligada</b> por default (limite técnico adotado para
        reduzir risco). O caminho vigente de captura é o <b>manual</b> — aba “Captura manual”, ao lado. A tabela
        acima mostra o histórico de rodagens anteriores.
      </>
    ),
  },
  shopee: {
    triggerPath: "/api/admin/rodagem/shopee",
    disabledNotice: (
      <>
        A captura da Shopee está <b>desligada</b> — falta credencial (<code>SHOPEE_APP_ID</code>/<code>SHOPEE_APP_SECRET</code>)
        ou a flag <code>SHOPEE_CAPTURE_ENABLED</code> no ambiente do servidor. Diferente do Mercado Livre, a Shopee
        usa API oficial de afiliados — não é scraping.
      </>
    ),
  },
  aliexpress: {
    triggerPath: "/api/admin/rodagem/aliexpress",
    disabledNotice: (
      <>
        A captura da AliExpress está <b>desligada</b>. Exige <code>ALIEXPRESS_CAPTURE_ENABLED=true</code> mais
        <code> ALIEXPRESS_APP_KEY</code>, <code>ALIEXPRESS_APP_SECRET</code> e <code>ALIEXPRESS_TRACKING_ID</code>.
        O <b>tracking id é obrigatório</b> aqui, diferente das outras: sem ele a API responde normalmente, mas os
        links vêm sem atribuição e o clique <b>não gera comissão</b> — a rodagem pareceria bem-sucedida e encheria
        o catálogo de links que não pagam nada.
      </>
    ),
  },
};

function toAdminRuns(runs: Awaited<ReturnType<typeof captureRuns>>): AdminRun[] {
  return runs.map((run) => ({
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
}

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

  // Estado por plataforma derivado do REGISTRO, não de uma lista hardcoded:
  // acrescentar a AliExpress (M5) não exige tocar nesta página (M-R5).
  const [overview, clicked, productCounts, runsByMarketplace] = await Promise.all([
    adminOverview(),
    topClicked(7, 6),
    marketplaceCounts(),
    Promise.all(
      MARKETPLACES.map(async (def) => {
        const [runs, running] = await Promise.all([
          captureRuns(20, "local", def.slug),
          runningRun("local", def.slug),
        ]);
        return [def.slug, { runs, running }] as const;
      }),
    ).then((entries) => new Map(entries)),
  ]);

  // Afiliados (E1): a tabela só existe após a migration ser aplicada. Enquanto
  // não aplicada, o painel degrada para lista vazia em vez de derrubar a página.
  let accounts: AffiliateAccountSummary[] = [];
  try {
    accounts = await listAffiliateAccounts();
  } catch {
    accounts = [];
  }
  const serializedAccounts = accounts.map((a) => ({
    id: a.id,
    tenantId: a.tenantId,
    publicSlug: a.publicSlug,
    displayName: a.displayName,
    status: a.status,
    ownerCount: a.ownerCount,
    configs: a.configs.map((c) => ({
      marketplace: c.marketplace,
      configured: c.configured,
      status: c.status,
      validatedAt: c.validatedAt ? new Date(c.validatedAt).toISOString() : null,
    })),
  }));

  // Bookmarklet gerado no servidor: o token de captura (CAPTURE_TOKEN) fica
  // embutido no código mas nunca é exposto ao client como variável separada.
  const captureConfig = {
    endpoint: `${shareBaseUrl()}/api/capture`,
    token: process.env.CAPTURE_TOKEN ?? "",
  };
  const bookmarklet = bookmarkletHref(captureConfig);
  const bookmarkletOk = bookmarkletCompiles(captureConfig);

  const platformStatusRows: PlatformStatusRow[] = MARKETPLACES.map((def) => {
    const lastRun = runsByMarketplace.get(def.slug)?.runs[0];
    return {
      slug: def.slug,
      label: def.label,
      captureMode: def.captureMode,
      enabled: captureEnabled(def.slug),
      productCount: productCounts[def.slug] ?? 0,
      lastRun: lastRun
        ? { status: lastRun.status, startedAt: iso(lastRun.started_at)!, itemsCaptured: lastRun.items_captured }
        : null,
    };
  });

  const overviewTab = (
    <>
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

      <PlatformStatus rows={platformStatusRows} />

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
    </>
  );

  const rodagensTab = (
    <>
      {MARKETPLACES.filter((def) => def.slug in RUN_PANELS).map((def) => {
        const panel = RUN_PANELS[def.slug]!;
        const state = runsByMarketplace.get(def.slug);
        return (
          <AdminPanel
            key={def.slug}
            marketplace={def.slug}
            marketplaceLabel={def.label}
            triggerPath={panel.triggerPath}
            initialRuns={toAdminRuns(state?.runs ?? [])}
            initialRunningId={state?.running?.id ?? null}
            enabled={captureEnabled(def.slug)}
            disabledNotice={panel.disabledNotice}
            requiresConsent={def.slug === "mercadolivre"}
          />
        );
      })}
    </>
  );

  const capturaManualTab = (
    <>
      <Capturador bookmarkletHref={bookmarklet} bookmarkletOk={bookmarkletOk} />
      <Devices />
    </>
  );

  const publicacaoTab = (
    <>
      <Composer baseUrl={shareBaseUrl()} />
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
    </>
  );

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

      <AdminTabs
        tabs={[
          { id: "visao-geral", label: "Visão geral", content: overviewTab },
          { id: "rodagens", label: "Rodagens", content: rodagensTab },
          { id: "captura-manual", label: "Captura manual", content: capturaManualTab },
          { id: "afiliados", label: "Afiliados", content: <Affiliates initialAccounts={serializedAccounts} /> },
          { id: "publicacao", label: "Publicação", content: publicacaoTab },
        ]}
      />
    </main>
  );
}
