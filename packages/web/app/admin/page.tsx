import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { adminOverview, captureRunHistory, runningRun, topClicked } from "../../lib/admin-db";
import { listAffiliateAccounts, type AffiliateAccountSummary } from "../../lib/affiliate-db";
import { shareBaseUrl } from "../../lib/site-url";
import { bookmarkletCompiles, bookmarkletHref } from "../../lib/bookmarklet";
import { captureEnabled } from "../../lib/platform-gates";
import { marketplaceCounts } from "../../lib/db";
import { MARKETPLACES } from "../../lib/marketplaces";
import { curationDecisionLoad, curationSummary, dailySuggestedCandidates } from "../../lib/curation-db";
import { formatDecisionLoad } from "../../lib/curation-contract";
import { getDailyAuditProgress, getEditorialGuideline } from "../../lib/editorial-compass";
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

function toAdminRuns(runs: Awaited<ReturnType<typeof captureRunHistory>>): AdminRun[] {
  return runs.map(toAdminRun);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  if (aba === "curadoria") {
    redirect("/admin/curadoria?aba=excecoes");
  }
  // Estado por plataforma derivado do REGISTRO, não de uma lista hardcoded:
  // acrescentar a AliExpress (M5) não exige tocar nesta página (M-R5).
  const [overview, clicked, productCounts, curation, runsByMarketplace, decisionLoad, auditProgress, editorialConfig, suggestedCandidates] = await Promise.all([
    adminOverview(),
    topClicked(7, 6),
    marketplaceCounts(),
    curationSummary(),
    Promise.all(
      MARKETPLACES.map(async (def) => {
        const [runs, running] = await Promise.all([
          captureRunHistory(20, "local", def.slug),
          runningRun("local", def.slug),
        ]);
        return [def.slug, { runs, running }] as const;
      }),
    ).then((entries) => new Map(entries)),
    curationDecisionLoad("local"),
    getDailyAuditProgress("local"),
    getEditorialGuideline("local"),
    dailySuggestedCandidates("local", 50),
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
      <TodayCommandCenter
        autoPublish={editorialConfig.autoPublish}
        minScore={editorialConfig.minScoreAutoPublish}
        captureDoneToday={saoPauloDay(overview.lastOkRunAt) === saoPauloDay(new Date())}
        triageDoneToday={saoPauloDay(overview.lastTriage?.finishedAt) === saoPauloDay(new Date())}
        publishedToday={saoPauloDay(overview.lastTriage?.finishedAt) === saoPauloDay(new Date()) ? overview.lastTriage?.approvedCount ?? 0 : 0}
        auditReviewed={auditProgress.reviewed}
        auditTarget={auditProgress.target}
        auditComplete={auditProgress.complete}
        suggestedCandidateCount={suggestedCandidates.length}
        suggestedCandidateExamples={suggestedCandidates.slice(0, 3).map((candidate) => candidate.title)}
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
      <section className="admin-section admin-curation-alert" aria-labelledby="curation-alert-title">
        <div><p className="eyebrow">Pendências fora da rotina diária</p><h2 id="curation-alert-title">{formatDecisionLoad(decisionLoad)}</h2><p>Use a mesa de Curadoria quando quiser resolver exceções; esse backlog não impede a conclusão de hoje.</p></div>
        <a className="admin-curation-secondary" href="/admin/curadoria?aba=excecoes">Abrir Curadoria →</a>
      </section>
      <section className="admin-section" aria-label="Visão geral">
        <div className="metric-row">
          <div className="metric-card"><b>{overview.products.toLocaleString("pt-BR")}</b><span>produtos</span></div>
          <div className="metric-card"><b>{overview.observations.toLocaleString("pt-BR")}</b><span>registros de preço</span></div>
          <div className="metric-card"><b>{overview.runs.toLocaleString("pt-BR")}</b><span>capturas nas lojas</span></div>
          <div className="metric-card"><b>{overview.triageRuns.toLocaleString("pt-BR")}</b><span>triagens IA</span></div>
          <div className="metric-card"><b>{overview.clicks7d.toLocaleString("pt-BR")}</b><span>cliques afiliados · 7d</span></div>
          <div className="metric-card"><b>{overview.publications.toLocaleString("pt-BR")}</b><span>publicações</span></div>
        </div>
      </section>

      <PlatformStatus rows={platformStatusRows} />

      <section className="admin-section" aria-labelledby="members-title">
        <h2 id="members-title">Área do comprador & Operação</h2>
        <dl className="admin-facts">
          <div><dt>pessoas com dados salvos</dt><dd>{overview.members.toLocaleString("pt-BR")}</dd></div>
          <div><dt>favoritos gravados</dt><dd>{overview.favorites.toLocaleString("pt-BR")}</dd></div>
          <div><dt>itens sob acompanhamento</dt><dd>{overview.activeWatches.toLocaleString("pt-BR")}</dd></div>
          <div><dt>perfis preenchidos</dt><dd>{overview.profiles.toLocaleString("pt-BR")}</dd></div>
          <div>
            <dt>última captura nas lojas</dt>
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

  const rodagensTab = (
    <>
      <nav className="section-local-nav" aria-label="Operação">
        <a className="active" href="/admin?aba=rodagens">Capturas e histórico</a>
        <a href="/admin?aba=captura-manual">Captura manual</a>
        <a href="/admin/curadoria?aba=pipeline">Execuções da IA</a>
      </nav>
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
      <nav className="section-local-nav" aria-label="Operação">
        <a href="/admin?aba=rodagens">Capturas e histórico</a>
        <a className="active" href="/admin?aba=captura-manual">Captura manual</a>
        <a href="/admin/curadoria?aba=pipeline">Execuções da IA</a>
      </nav>
      <Capturador bookmarkletHref={bookmarklet} bookmarkletOk={bookmarkletOk} />
      <Devices />
    </>
  );

  const publicacaoTab = (
    <>
      <nav className="section-local-nav" aria-label="Publicação">
        <a href="/pauta">Pauta de links</a>
        <a className="active" href="/admin?aba=publicacao">Criador de posts</a>
      </nav>
      <section className="admin-section" style={{ background: "var(--surface-elevated, #fafafa)", border: "1px solid var(--line, #e4e4e7)", borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "1rem" }}>📋 Pauta de Stories & Links Reduzidos</h3>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--ink-muted, #71717a)" }}>
            Mesa dedicada para copiar os links curtos (<code>/p/xxxx</code>) de cada oferta do dia. O contador mostra cópias feitas neste aparelho; a postagem continua manual.
          </p>
        </div>
        <a href="/pauta" className="admin-curation-start" style={{ textDecoration: "none" }}>
          Abrir Mesa de Pauta (/pauta) →
        </a>
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

  return (
    <AdminTabs
      initialTab={aba}
      showNavigation={false}
      tabs={[
        { id: "visao-geral", label: "Visão geral", content: overviewTab },
        { id: "rodagens", label: "Lojas & Rodagens", content: rodagensTab },
        { id: "captura-manual", label: "Captura manual", content: capturaManualTab },
        { id: "publicacao", label: "Criador de posts", content: publicacaoTab },
        { id: "afiliados", label: "Contas de afiliados", content: <Affiliates initialAccounts={serializedAccounts} /> },
      ]}
    />
  );
}
