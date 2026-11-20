import { pageAccount } from "../../../lib/page-account.ts";
import { inAccountScope, scopedTenantId, currentAccount } from "../../../lib/account-scope.ts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  automatedTriageAvailability,
  curationGroupCards,
  curationQueue,
  curationSummary,
} from "../../../lib/curation-db.ts";
import {
  getAuditDesk,
  getWeeklyAuditSample,
  getWeeklyAuditSettings,
  getEditorialGuideline,
  getGoldenExamples,
  getTriageBatchesHistory,
} from "../../../lib/editorial-compass.ts";
import { captureRuns } from "../../../lib/admin-db.ts";
import WeeklyAudit from "./weekly-audit.tsx";
import EquivalenceControl from "./equivalence-control.tsx";
import { readEquivalenceDesk } from "../../../lib/curation-equivalence-db.ts";
import { readCurationOperationsMetrics } from "../../../lib/curation-operations-metrics.ts";
import OperationsMetrics from "./operations-metrics.tsx";
import AttributeReconcile from "./attribute-reconcile.tsx";
import AutomationStatus from "./automation-status.tsx";
import TodayOperationStatus from '../today-operation-status.tsx';
import {OperationProblems,OperationHistory} from './operation-panels.tsx';
import { readCurationPolicy } from "../../../lib/curation-policy-db.ts";
import PolicyControl from "./policy-control.tsx";
import { readCurationPool } from "../../../lib/curation-pool-read.ts";
import PoolStatus from "./pool-status.tsx";
import {
  canonicalAdminQuery,
  canonicalAdminUrl,
} from "../../../lib/admin-query-aliases.ts";
import {
  getEditorialSelectionDesk,
  getPublishedEditorialSelection,
} from "../../../lib/editorial-selection-db.ts";
import { getPageAuth, resolveAccountContext } from "../../../lib/auth.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import { getRubricPromotionMetrics } from "../../../lib/rubric-db.ts";
import { curationNextStep } from "../../../lib/curation-workflow.ts";
import { readCurationHandoff } from "../../../lib/curation-handoff.ts";
import { readCurationAutomation } from "../../../lib/curation-automation.ts";
import SelecaoView from "./selecao-view.tsx";
import { readScoreComparison } from "../../../lib/curation-score-read.ts";
import { readCurationExceptions } from "../../../lib/curation-exceptions-db.ts";
import CurationReviewer from "./curation-reviewer.tsx";
import GroupReviewer from "./group-reviewer.tsx";
import SpotCheckView from "./spot-check-view.tsx";
import PublishedSelection from "./published-selection.tsx";
import HomepageMetrics from "./homepage-metrics.tsx";
import { homepageEngagementReport } from "../../../lib/homepage-db.ts";
import {AdminDraftScope} from "../draft-provider.tsx";
import DiscoveryControl from "./discovery-control.tsx";
import { discoveryPolicies } from "../../../lib/discovery-policy-db.ts";
import RecommendationControl from "./recommendation-control.tsx";
import { recommendationDesk } from "../../../lib/recommendation-db.ts";
import TriageControl from "./triage-control.tsx";
import BussolaView from "../direcionamento/bussola-view.tsx";
import PipelineView from "../direcionamento/pipeline-view.tsx";
import RadarView from "../direcionamento/radar-view.tsx";
import { getRadarOpportunities } from "../../../lib/opportunity-db.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Curadoria | BizuMiner",
  robots: { index: false, follow: false },
};

async function CurationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const canonical = canonicalAdminQuery(params);
  if (canonical.redirectNeeded)
    redirect(canonicalAdminUrl("/admin/curadoria", params));
  const { aba, sub } = canonical;
  const user = await getPageAuth();
  const account = user ? currentAccount() ?? null : null;
  const href = (aba: string, sub?: string) => {
    const query = new URLSearchParams({ aba });
    if (sub) query.set("sub", sub);
    if (account) query.set("conta", account.tenantId);
    return `/admin/curadoria?${query}`;
  };
  const automationRead=account?await readCurationAutomation(account).then(value=>({available:true,value})).catch(()=>({available:false,value:null})):{available:true,value:null};
  const automation=automationRead.value;
  if(!automationRead.available)return <section className="curation-page"><h1>Curadoria</h1><p role="alert">Não foi possível consultar todo o processamento. A triagem anterior não foi considerada o motor ativo.</p>
    {account&&<TodayOperationStatus tenantId={account.tenantId}/>}
    <a href={href('selecao')}>Consultar a curadoria novamente</a> · <a href={`/admin/capturas?conta=${encodeURIComponent(account?.tenantId??'')}`}>Consultar recebimentos</a></section>;
  const summary = await (account
      ? curationSummary(account.tenantId, undefined, account)
      : Promise.resolve({ awaiting: 0, newPending: 0, legacyVisible: 0, held: 0, approved: 0, rejected: 0, deferred: 0 }));
  const audit = aba === "auditoria" ? await getAuditDesk(account?.tenantId ?? scopedTenantId()) : null;
  const pendingTotal = summary.awaiting + summary.held + summary.deferred;
  const secondary = aba === "bussola" || aba === "pipeline" || aba === "radar";
  const supportLinks = <nav aria-label="Apoio à curadoria">
    <a href={href("bussola")} aria-current={aba === "bussola" ? "page" : undefined}>Critérios e automação</a>
    <a href={href("radar")} aria-current={aba === "radar" ? "page" : undefined}>Radar de oportunidades</a>
    <a href={href("pipeline")} aria-current={aba === "pipeline" ? "page" : undefined}>{automation ? "Histórico da curadoria" : "Histórico da IA"}</a>
  </nav>;
  let content;
  if (aba === "selecao") {
    const loadReviewDesk = Boolean(params.revisar) || params.bancada === "1";
    const loadFullReviewCatalog = params.bancada === "1";
    const loadDiagnostics = Boolean(params.configurar) || params.diagnostico === "1";

    const [desk, published, eligible, engagement, recommendations, discovery, equivalence, operations, policy, pool, handoff] = await Promise.all([
      (loadReviewDesk || loadDiagnostics)
        ? getEditorialSelectionDesk(scopedTenantId(), undefined, params.revisar, false, { focusedOnly: !loadFullReviewCatalog && Boolean(params.revisar) })
        : Promise.resolve({ schemaReady: true, selection: null, candidates: [], catalogHeroActive: false, publishedProductIds: [] }),
      getPublishedEditorialSelection("all"),
      automatedTriageAvailability(),
      loadDiagnostics ? homepageEngagementReport(scopedTenantId()) : Promise.resolve([]),
      loadDiagnostics ? recommendationDesk() : Promise.resolve({ ready: false, channels: [], coverage: [], confirmationQueue: [] }),
      loadDiagnostics ? discoveryPolicies() : Promise.resolve([]),
      (loadDiagnostics && account) ? readEquivalenceDesk(account) : Promise.resolve({ options: [], groups: [], suggestions: [], available: false }),
      (loadDiagnostics && account) ? readCurationOperationsMetrics(account) : Promise.resolve(null),
      (loadDiagnostics && account) ? readCurationPolicy(account) : Promise.resolve(null),
      (loadDiagnostics && account) ? readCurationPool(account) : Promise.resolve(null),
      account ? readCurationHandoff(account) : Promise.resolve(null),
    ]);
    const nextStep = curationNextStep({ triageEligible: eligible, ...summary, ...handoff });
    const scoreComparison = (loadReviewDesk && desk.candidates.length > 0)
      ? await readScoreComparison(scopedTenantId(), desk.candidates.map(candidate => candidate.id))
      : [];
    content = (
      <>
        {automation ? <AutomationStatus automation={automation} tenantId={account!.tenantId}
          selectionLabel={`${published.products.length} produtos selecionados na vitrine`} /> : <section className="curation-start" aria-labelledby="curation-next-step">
          <p className="eyebrow">Seu próximo passo</p>
          <h2 id="curation-next-step">{nextStep.title}</h2>
          <p>{nextStep.description}</p>
          <dl className="curation-task-counts" aria-label="Situação dos produtos desta conta">
            <div><dt>Para analisar com IA</dt><dd>{eligible >= 100 ? "100+" : eligible}</dd></div>
            <div><dt>Para revisar agora</dt><dd>{summary.awaiting + summary.held}</dd></div>
            <div><dt>Aprovados recentes</dt><dd>{summary.approved}</dd></div>
          </dl>
          <TriageControl eligible={eligible} />
          <div className="curation-start-actions">
            {nextStep.href && <a className="curation-primary-action" href={`${nextStep.href}${account ? `${nextStep.href.includes("?") ? "&" : "?"}conta=${encodeURIComponent(account.tenantId)}` : ""}`}>{nextStep.action} →</a>}
            {nextStep.kind === "triage" && summary.awaiting + summary.held > 0 && <a href={href("excecoes")}>Revisar os produtos já pendentes</a>}
            <a href="/admin?aba=rodagens">Ver situação das capturas</a>
            {summary.deferred > 0 && <a href={href("excecoes", "adiados")}>{summary.deferred} produtos adiados</a>}
          </div>
          <p className="curation-start-note">Aprovação e divulgação são etapas diferentes. A pauta exige preço recente, opção de compra e link de afiliado válidos.</p>
          {handoff && (handoff.runningCaptures > 0 || handoff.incompleteCaptures > 0) && <p className="curation-start-note">
            Capturas: {handoff.runningCaptures} em andamento · {handoff.incompleteCaptures} incompletas · {handoff.preparedOffers} registros ainda em preparação.
          </p>}
        </section>}
        <section className="curation-route-guide" aria-labelledby="curation-how-it-works">
          <h2 id="curation-how-it-works">Das capturas à divulgação</h2>
          <ol>
            <li><span>1</span><div><strong>{automation ? 'Avaliação automática' : 'Analisar capturas'}</strong><p>A IA ajuda a avaliar os produtos recebidos.</p></div></li>
            <li><span>2</span><div><strong>{automation ? 'Seleção por critérios' : 'Revisar produtos'}</strong><p>{automation ? 'O motor compara as ofertas; você pode revisar as exceções.' : 'Você decide sobre os casos pendentes.'}</p></div></li>
            <li><span>3</span><div><strong>Preparar divulgação</strong><p>Na pauta, escolha o canal e confira a oferta antes de compartilhar.</p></div></li>
          </ol>
        </section>
        {published.products.length > 0 && <details className="curation-manual-edition">
          <summary>Destaques da página inicial · {published.products.length} produtos</summary>
          <PublishedSelection selection={published} />
        </details>}
        <details className="curation-manual-edition" open={loadReviewDesk}>
          <summary>Revisão editorial de um produto · opcional</summary>
          <p style={{ color: "var(--ink-muted, #71717a)", margin: "8px 0 16px" }}>
            Use esta área se desejar conferir um produto na loja externa, fixar a variante exata (cor, voltagem, kit) ou escrever uma ressalva sincera para turbinar o destaque na pauta.
          </p>
          {loadReviewDesk ? (
            <>
              {params.revisar && !loadFullReviewCatalog && (
                <p style={{ margin: "0 0 12px" }}>
                  <a href={`${href("selecao")}&bancada=1&revisar=${encodeURIComponent(params.revisar)}`}>
                    Ver todos os produtos aprovados na bancada →
                  </a>
                </p>
              )}
              <SelecaoView reviewOnly
                key={params.revisar ?? "editorial-desk"}
                initialCandidates={desk.candidates}
                initialSelection={desk.selection}
                schemaReady={desk.schemaReady}
                catalogHeroActive={desk.catalogHeroActive}
                initialEditingId={params.revisar}
                scoreComparison={scoreComparison}
              />
            </>
          ) : (
            <p style={{ marginTop: "8px" }}>
              <a className="curation-primary-action" href={`${href("selecao")}&bancada=1`}>
                Abrir bancada de revisão editorial →
              </a>
            </p>
          )}
        </details>
        <details className="curation-advanced" id="curation-settings" open={loadDiagnostics}>
          <summary>Configurações e diagnóstico</summary>
          <p>Ajuste critérios e canais quando precisar. Não é necessário alterar estas configurações para revisar produtos ou consultar a pauta.</p>
          {supportLinks}
          {loadDiagnostics ? (
            <>
              {policy && <PolicyControl key={`policy:${account?.tenantId}`} initial={policy} canManage={account?.membershipRole === "owner"} />}
              <RecommendationControl candidates={desk.candidates.map(c=>({id:c.id,title:c.title,displayTitle:c.displayTitle,offerOptionLabel:c.offerOptionLabel}))} tenantId={account?.tenantId ?? ""} desk={recommendations} canManage={account?.membershipRole === "owner"}/>
              {equivalence.available && <EquivalenceControl key={`equivalence:${account?.tenantId}`} options={equivalence.options} groups={equivalence.groups} suggestions={equivalence.suggestions} canManage={account?.membershipRole === "owner"} />}
              {recommendations.ready && <DiscoveryControl tenantId={account?.tenantId ?? ""} policies={discovery} canManage={account?.membershipRole === "owner"}/>}
              <HomepageMetrics rows={engagement} />
              <OperationsMetrics metrics={operations} />
              {account && <PoolStatus pool={pool} tenantId={account.tenantId} />}
            </>
          ) : (
            <p style={{ marginTop: "12px" }}>
              <a className="curation-primary-action" href={`${href("selecao")}&diagnostico=1#curation-settings`}>
                Carregar configurações e diagnóstico da curadoria →
              </a>
            </p>
          )}
        </details>
      </>
    );
  } else if (aba === "problemas") {
    content=account?<OperationProblems account={account} query={params}/>:<p>Conta indisponível.</p>;
  } else if (aba === "excecoes") {
    const closeToBoundary=account ? await readCurationExceptions(account) : [];
    const queue =
      sub === "retidos" ? "held" : sub === "adiados" ? "deferred" : "awaiting";
    const count =
      queue === "held"
        ? summary.held
        : queue === "deferred"
          ? summary.deferred
          : summary.awaiting;
    const filters = [
      {
        sub: "singulars",
        label: "Aguardando decisão",
        count: summary.awaiting,
      },
      { sub: "retidos", label: "Retidos", count: summary.held },
      { sub: "adiados", label: "Adiados", count: summary.deferred },
    ];
    const cards = sub === "grupos" ? await curationGroupCards(20) : null;
    const products = cards
      ? []
      : (await curationQueue(20, scopedTenantId(), queue)).map((product) => ({
          ...product,
          observedAt: new Date(product.observedAt).toISOString(),
          queuedAt: new Date(product.queuedAt).toISOString(),
          deferredUntil: product.deferredUntil
            ? new Date(product.deferredUntil).toISOString()
            : null,
        }));
    content = (
      <>
        <section className="curation-area-intro">
          <h2>{automation ? 'Exceções da curadoria automática' : 'Resolver pendências'}</h2>
          <p>
            {automation ? 'Confira os casos sinalizados pela seleção. A revisão manual do catálogo abaixo é opcional e não é necessária para cada produto avaliado.' : 'Decida apenas o que exige atenção humana. As três filas separam produtos disponíveis para decisão, retidos e adiados.'}
          </p>
        </section>
        {closeToBoundary.length>0 && <section className="curation-area-intro" aria-labelledby="boundary-review-title">
          <h2 id="boundary-review-title">Revisões próximas do corte</h2>
          <p>São casos opcionais ordenados por impacto. A revisão não substitui a conferência de preço ou os bloqueios da oferta.</p>
          <ul>{closeToBoundary.map(item=><li key={item.id}>
            <a href={`/admin/curadoria?aba=selecao&revisar=${encodeURIComponent(item.productId)}&conta=${encodeURIComponent(account!.tenantId)}`}>{item.title}</a>
            {` · pontuação ${Number(item.snapshot.score).toFixed(1)} · corte ${Number(item.snapshot.cutoff).toFixed(1)} · confiança ${Math.round(Number(item.snapshot.confidence)*100)}%`}
            {` · até ${new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date(item.expiresAt))}`}
          </li>)}</ul>
        </section>}
        {automation && closeToBoundary.length===0 && <p>Não há exceções de seleção abertas neste momento.</p>}
        <details open={!automation}>
        <summary>Revisão manual do catálogo · opcional</summary>
        <nav className="curation-filter-nav" aria-label="Filtrar pendências">
          {filters.map((filter) => (
            <a
              key={filter.sub}
              href={href("excecoes", filter.sub)}
              aria-current={
                sub === filter.sub ||
                (sub === "grupos" && filter.sub === "singulars")
                  ? "page"
                  : undefined
              }
            >
              {filter.label} <span>{filter.count}</span>
            </a>
          ))}
        </nav>
        {queue === "awaiting" && (
          <nav
            className="curation-view-switch"
            aria-label="Visualização da mesma fila"
          >
            <span>Visualização:</span>
            <a
              href={href("excecoes", "singulars")}
              aria-current={sub !== "grupos" ? "page" : undefined}
            >
              Item a item
            </a>
            <a
              href={href("excecoes", "grupos")}
              aria-current={sub === "grupos" ? "page" : undefined}
            >
              Agrupar semelhantes
            </a>
            <small>São duas formas de decidir sobre os mesmos produtos.</small>
          </nav>
        )}
        {cards ? (
          <GroupReviewer initialCards={cards} />
        ) : (
          <CurationReviewer
            key={queue}
            initialProducts={products}
            initialAwaiting={count}
            queueKind={queue}
          />
        )}
        </details>
      </>
    );
  } else if (aba === "auditoria" && audit) {
    const [settings, rubricMetrics] = await Promise.all([
      account ? getWeeklyAuditSettings(account.tenantId) : Promise.resolve({version:0,limit:20,available:false}),
      account ? withAccountDb(account, (tx) => getRubricPromotionMetrics(tx, account.tenantId)).catch(() => null)
        : Promise.resolve(null),
    ]);
    const weekly = account && settings.available ? await getWeeklyAuditSample(account.tenantId,settings.limit) : [];
    content = (
      <><WeeklyAudit key={account?.tenantId} products={weekly} settings={settings} canConfigure={account?.membershipRole === "owner"} /><SpotCheckView
        key={`${audit.progress.reviewed}:${audit.products.map((p) => p.sourceEventId).join(",")}`}
        initialProducts={audit.products}
        initialReviewed={audit.progress.reviewed}
        dailyTarget={audit.progress.target}
        initialRubricMetrics={rubricMetrics}
      /></>
    );
  } else if (aba === "bussola") {
    const [guideline, examples] = await Promise.all([
      getEditorialGuideline(),
      getGoldenExamples(scopedTenantId(), 6),
    ]);
    content = (
      <BussolaView initialGuideline={guideline} goldenExamples={examples} />
    );
  } else if (aba === "radar") {
    const opportunities = account
      ? await withAccountDb(account, (tx) => getRadarOpportunities(tx, account.tenantId)).catch(() => [])
      : [];
    content = (
      <RadarView
        tenantId={account?.tenantId ?? scopedTenantId()}
        initialOpportunities={opportunities}
      />
    );
  } else {
    const legacy = await Promise.all([
      getTriageBatchesHistory(scopedTenantId(), 8),
      captureRuns(6),
    ]).then(([batches,runs])=>({batches,runs})).catch(()=>null);
    content = (<>
      {automation&&account&&<OperationHistory account={account} after={params.historicoDepois}/>}
      <details open={!automation}><summary>{automation?'Histórico da triagem anterior':'Histórico de execução anterior'}</summary>{legacy?<PipelineView
        automatic={Boolean(automation)}
        tenantId={account?.tenantId}
        triageBatches={legacy.batches}
        captureRuns={legacy.runs.map((run) => ({
          ...run,
          started_at: new Date(run.started_at).toISOString(),
          finished_at: run.finished_at
            ? new Date(run.finished_at).toISOString()
            : null,
        }))}
      />:<p>Consulta do histórico anterior indisponível. Os eventos v2 acima têm leitura independente.</p>}</details></>);
  }
  const tabs = [
    ...(automation ? [{ id: "problemas", label: "Problemas para resolver", detail: `${automation.uncertain} avaliações incertas · ver outras pendências` }] : []),
    { id: "selecao", label: automation?'Andamento':'Começar', detail: "Seu próximo passo" },
    {
      id: "excecoes",
      label: automation ? "Exceções" : "Revisar produtos",
      detail: automation ? `${automation.exceptions} casos sinalizados` : `${pendingTotal} produtos recentes`,
    },
    {
      id: "auditoria",
      label: "Conferir decisões da IA",
      detail: audit?.progress.remaining
        ? `${audit.progress.remaining} para conferir · opcional`
        : "Amostragem opcional",
    },
  ];
  return (
    <div className="curation-page">
      <header className="curation-workspace-header">
        <div>
          <p className="eyebrow">Operação editorial</p>
          <h1>Curadoria</h1>
          <p>
            Analise as capturas, revise os produtos e prepare sua divulgação.
          </p>
        </div>
        <a href="/admin#captura-hoje">Captura e acompanhamento →</a>
      </header>
      <nav className="curation-main-nav" aria-label="Trabalho da curadoria">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={href(tab.id)}
            aria-current={aba === tab.id ? "page" : undefined}
          >
            <strong>{tab.label}</strong>
            <span>{tab.detail}</span>
          </a>
        ))}
      </nav>
      {automation&&account&&<TodayOperationStatus tenantId={account.tenantId} problemFilter={aba==='problemas'?{category:params.categoria||undefined,after:params.depois}:undefined}/>}
      {content}
      {aba !== "selecao" && <details className="curation-settings-nav" open={secondary}>
        <summary>Critérios e histórico da IA</summary>
        {supportLinks}
      </details>}
    </div>
  );
}

export default async function ScopedPage(props: Parameters<typeof CurationPage>[0]) {
 const params=await props.searchParams;
 const account=await pageAccount(params?.conta);
 if(!account) return <section><p>Nenhuma conta autorizada disponível.</p></section>;
 const content=await inAccountScope(account,()=>CurationPage(props));
 return <AdminDraftScope account={account.tenantId} actor={account.actorAppUserId ?? ""}>{content}</AdminDraftScope>;
}
