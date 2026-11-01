import { pageAccount } from "../../lib/page-account.ts";
import { inAccountScope, scopedTenantId } from "../../lib/account-scope.ts";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { adminOverview, captureRunHistory, runningRun, topClicked } from "../../lib/admin-db";
import { listAffiliateAccounts } from "../../lib/affiliate-db";
import { shareBaseUrl } from "../../lib/site-url";
import { bookmarkletCompiles, bookmarkletHref } from "../../lib/bookmarklet";
import { captureEnabled } from "../../lib/platform-gates";
import { marketplaceCounts } from "../../lib/db";
import { MARKETPLACES } from "../../lib/marketplaces";
import { curationSummary } from "../../lib/curation-db";
import { getAuditDesk, getEditorialGuideline } from "../../lib/editorial-compass";
import { getPublishedEditorialSelection } from "../../lib/editorial-selection-db.ts";
import { selectionWorkflowState } from "../../lib/curation-workflow.ts";
import AdminPanel, { type AdminRun } from "./admin-panel";
import { toAdminRun } from "../../lib/admin-run-groups";
import AdminTabs from "./admin-tabs";
import PlatformStatus, { type PlatformStatusRow } from "./platform-status";
import Composer from "./composer";
import Capturador from "./capturador";
import Affiliates from "./affiliates";
import Devices from "./devices";
import BatchCapturePanel from "./batch-capture-panel";
import TodayCommandCenter from "./today-command-center";
import GithubMonitoringPanel from "./github-monitoring-panel";
import { githubMonitoringRuns } from "../../lib/github-monitoring";
import MonitoringPolicyPanel from "./monitoring-policy-panel";
import DispatchPanel from "./dispatch-panel";
import { houseMonitoringPolicies, houseMonitoringPolicyEvents } from "../../lib/affiliate-monitoring-db";
import { getPageAuth, roleAccess } from "../../lib/auth";
import { getWorkbenchPage } from "../../lib/workbench-db.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel | BizuMiner",
  robots: { index: false, follow: false },
};

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

function saoPauloDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

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
        A captura do Mercado Livre é realizada com segurança diretamente pelo seu navegador através da <b>Extensão BizuMiner</b>.
        Clique em <b>“Abrir ofertas no Mercado Livre ↗”</b> acima, acione a extensão na página e importe os produtos com 1 clique para a triagem.
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

function toAdminRuns(runs: Awaited<ReturnType<typeof captureRunHistory>>): AdminRun[] {
  return runs.map(toAdminRun);
}

import type { AccountContext } from "../../lib/account-context.ts";
import { normalizeAdminTab } from "../../lib/admin-navigation.ts";
import { AdminDraftScope } from "./draft-provider.tsx";
import SectionRetry from "./section-retry.tsx";
import AdminLink from "../_components/admin-link.tsx";

function SectionLoading({ label }: { label: string }) {
  return <section className="admin-section route-loading" aria-busy="true" role="status">Carregando {label}…</section>;
}
async function SafeSection({ label, load }: { label: string; load: () => Promise<ReactNode> }) {
  try { return await load(); }
  catch { return <SectionRetry label={label} />; }
}

async function OverviewTab({ account: accountContext }: { account: AccountContext }) {
  return inAccountScope(accountContext, async () => {
    const [overview, curation, auditDesk, editorialConfig, publishedSelection, workbenchPage] = await Promise.all([
      adminOverview(), curationSummary(accountContext.tenantId, undefined, accountContext),
      getAuditDesk(accountContext.tenantId), getEditorialGuideline(accountContext.tenantId),
      getPublishedEditorialSelection("all", accountContext.tenantId),
      getWorkbenchPage(accountContext, { limit: 15 }).catch(() => null),
    ]);
  const selectionState = selectionWorkflowState({ schemaReady: publishedSelection.schemaReady,
    mode: publishedSelection.mode, count: publishedSelection.products.length, validUntil: publishedSelection.validUntil });

    return (
    <>
      <TodayCommandCenter
        autoPublish={editorialConfig.autoPublish}
        minScore={editorialConfig.minScoreAutoPublish}
        captureDoneToday={saoPauloDay(overview.lastDiscoveryAt) === saoPauloDay(new Date())}
        triageDoneToday={overview.lastTriage?.status === "ok" && saoPauloDay(overview.lastTriage.finishedAt) === saoPauloDay(new Date())}
        approvedToday={saoPauloDay(overview.lastTriage?.finishedAt) === saoPauloDay(new Date()) ? overview.lastTriage?.approvedCount ?? 0 : 0}
        selectionReady={selectionState.ready}
        selectionLabel={selectionState.label}
        awaiting={curation.awaiting}
        held={curation.held}
        deferred={curation.deferred}
        auditRemaining={auditDesk.progress.remaining}
        workbenchPage={workbenchPage}
      />
      <div id="captura-hoje">
        <BatchCapturePanel
          marketplaces={MARKETPLACES.map((def) => ({
            slug: def.slug,
            label: def.label,
            enabled: def.slug === "mercadolivre" || captureEnabled(def.slug),
          }))}
        />
      </div>
      <section className="admin-section" aria-label="Visão geral">
        <div className="metric-row">
          <div className="metric-card"><b>{overview.products.toLocaleString("pt-BR")}</b><span>produtos</span></div>
          <div className="metric-card"><b>{overview.observations.toLocaleString("pt-BR")}</b><span>registros de preço</span></div>
          <div className="metric-card"><b>{overview.runs.toLocaleString("pt-BR")}</b><span>execuções nas lojas</span></div>
          <div className="metric-card"><b>{overview.triageRuns.toLocaleString("pt-BR")}</b><span>triagens IA</span></div>
          <div className="metric-card"><b>{overview.clicks7d.toLocaleString("pt-BR")}</b><span>cliques afiliados · 7d</span></div>
          <div className="metric-card"><b>{overview.publications.toLocaleString("pt-BR")}</b><span>publicações</span></div>
        </div>
      </section>

      <Suspense fallback={<SectionLoading label="as lojas" />}>
        <SafeSection label="as lojas" load={() => PlatformOverview({ account: accountContext })} />
      </Suspense>

      <section className="admin-section" aria-labelledby="members-title">
        <h2 id="members-title">Área do comprador & Operação</h2>
        <dl className="admin-facts">
          <div><dt>pessoas com dados salvos</dt><dd>{overview.members.toLocaleString("pt-BR")}</dd></div>
          <div><dt>favoritos gravados</dt><dd>{overview.favorites.toLocaleString("pt-BR")}</dd></div>
          <div><dt>itens sob acompanhamento</dt><dd>{overview.activeWatches.toLocaleString("pt-BR")}</dd></div>
          <div><dt>perfis preenchidos</dt><dd>{overview.profiles.toLocaleString("pt-BR")}</dd></div>
          <div>
            <dt>última execução nas lojas</dt>
            <dd>
              {overview.lastOkRunAt
                ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(overview.lastOkRunAt))
                : "nunca"}
            </dd>
          </div>
          <div>
            <dt>última triagem editorial (IA)</dt>
            <dd>
              {overview.lastTriage?.finishedAt
                ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(overview.lastTriage.finishedAt))
                : "nunca"}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
  });
}

async function PlatformOverview({ account }: { account: AccountContext }) {
  return inAccountScope(account, async () => {
    const [productCounts, runsByMarketplace] = await Promise.all([
      marketplaceCounts(),
      Promise.all(MARKETPLACES.map(async def => [def.slug, { runs: await captureRunHistory(20, account.tenantId, def.slug) }] as const))
        .then(entries => new Map(entries)),
    ]);
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

    return <PlatformStatus rows={platformStatusRows} />;
  });
}

async function GithubSection({ account }: { account: AccountContext }) {
  return inAccountScope(account, async () => {
    const githubMonitoring = await githubMonitoringRuns()
      .then(runs => ({ runs, error: false })).catch(() => ({ runs: [], error: true }));
    return <GithubMonitoringPanel {...githubMonitoring} dispatchConfigured={Boolean(process.env.GITHUB_ACTIONS_WRITE_TOKEN)} />;
  });
}

async function RodagensTab({ account: accountContext }: { account: AccountContext }) {
  return inAccountScope(accountContext, async () => {
    const [runsByMarketplace, monitoringPolicies, monitoringPolicyEvents] = await Promise.all([
      Promise.all(MARKETPLACES.map(async def => {
        const [runs, running] = await Promise.all([
          captureRunHistory(20, accountContext.tenantId, def.slug), runningRun(accountContext.tenantId, def.slug),
        ]);
        return [def.slug, { runs, running }] as const;
      })).then(entries => new Map(entries)),
      houseMonitoringPolicies().catch(() => null), houseMonitoringPolicyEvents().catch(() => []),
    ]);
    return (
    <>
      <nav className="section-local-nav" aria-label="Operação">
        <AdminLink className="active" href="/admin?aba=rodagens">Capturas e histórico</AdminLink>
        <AdminLink href="/admin?aba=captura-manual">Captura manual</AdminLink>
        <AdminLink href="/admin/curadoria?aba=pipeline">Execuções da IA</AdminLink>
      </nav>
      <Suspense fallback={<SectionLoading label="o monitoramento" />}>
        <SafeSection label="o monitoramento" load={() => GithubSection({ account: accountContext })} />
      </Suspense>
      <MonitoringPolicyPanel initialPolicies={monitoringPolicies} initialEvents={monitoringPolicyEvents} />
      <DispatchPanel tenantId={accountContext?.tenantId ?? scopedTenantId()} />
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
  });
}

async function ManualTab() {
  const bookmarklet = bookmarkletHref();
  const bookmarkletOk = bookmarkletCompiles();

  return (
    <>
      <nav className="section-local-nav" aria-label="Operação">
        <AdminLink href="/admin?aba=rodagens">Capturas e histórico</AdminLink>
        <AdminLink className="active" href="/admin?aba=captura-manual">Captura manual</AdminLink>
        <AdminLink href="/admin/curadoria?aba=pipeline">Execuções da IA</AdminLink>
      </nav>
      <Capturador bookmarkletHref={bookmarklet} bookmarkletOk={bookmarkletOk} />
      <Devices />
    </>
  );
}

async function PublicacaoTab({ account }: { account: AccountContext }) {
  return inAccountScope(account, async () => {
    const clicked = await topClicked(7, 6);
    return (
    <>
      <nav className="section-local-nav" aria-label="Publicação">
        <AdminLink href="/pauta">Pauta de links</AdminLink>
        <AdminLink className="active" href="/admin?aba=publicacao">Criador de posts</AdminLink>
      </nav>
      <section className="admin-section" style={{ background: "var(--surface-elevated, #fafafa)", border: "1px solid var(--line, #e4e4e7)", borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "1rem" }}>📋 Pauta de Stories & Links Reduzidos</h3>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-muted, #71717a)" }}>
            Mesa dedicada para copiar os links curtos (<code>/p/xxxx</code>) de cada oferta do dia. O contador mostra cópias feitas neste aparelho; a postagem continua manual.
          </p>
        </div>
        <AdminLink href="/pauta" className="admin-curation-start" style={{ textDecoration: "none" }}>
          Abrir Mesa de Pauta (/pauta) →
        </AdminLink>
      </section>
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
  });
}

async function AfiliadosTab({ appUserId, account }: { appUserId: string; account: AccountContext }) {
  return inAccountScope(account, async () => {
  const accounts = await listAffiliateAccounts(appUserId, account.tenantId).catch(() => []);
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

  return <Affiliates initialAccounts={serializedAccounts} />;
  });
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ aba?: string; conta?: string }> }) {
  const params = await searchParams;
  const authUser = await getPageAuth();
  const access = authUser ? await roleAccess(authUser.id, "afiliado") : null;
  if (!authUser || !access) redirect("/entrar?next=/admin");
  if (params.aba === "curadoria") redirect("/admin/curadoria?aba=excecoes");
  const account = await pageAccount(params.conta);
  if (!account) return <section><p>Nenhuma conta autorizada disponível.</p></section>;
  const tab = normalizeAdminTab(params.aba);
  const load = () => {
    switch (tab) {
      case "rodagens": return RodagensTab({ account });
      case "captura-manual": return ManualTab();
      case "publicacao": return PublicacaoTab({ account });
      case "afiliados": return AfiliadosTab({ appUserId: access.appUserId, account });
      default: return OverviewTab({ account });
    }
  };
  return <AdminDraftScope account={account.tenantId} actor={account.actorAppUserId ?? ""}>
    <AdminTabs activeTab={tab}>
      <Suspense key={`${account.tenantId}:${tab}`} fallback={<SectionLoading label="a aba" />}>
        <SafeSection label="a aba" load={load} />
      </Suspense>
    </AdminTabs>
  </AdminDraftScope>;
}
