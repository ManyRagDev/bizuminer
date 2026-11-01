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
  getEditorialGuideline,
  getGoldenExamples,
  getTriageBatchesHistory,
} from "../../../lib/editorial-compass.ts";
import { captureRuns } from "../../../lib/admin-db.ts";
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
import { selectionWorkflowState } from "../../../lib/curation-workflow.ts";
import SelecaoView from "./selecao-view.tsx";
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
const href = (aba: string, sub?: string) =>
  `/admin/curadoria?aba=${aba}${sub ? `&sub=${sub}` : ""}`;

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
  const [summary, audit] = await Promise.all([
    account
      ? curationSummary(account.tenantId, undefined, account)
      : Promise.resolve({ awaiting: 0, newPending: 0, legacyVisible: 0, held: 0, approved: 0, rejected: 0, deferred: 0 }),
    getAuditDesk(account?.tenantId ?? scopedTenantId()),
  ]);
  const pendingTotal = summary.awaiting + summary.held + summary.deferred;
  const secondary = aba === "bussola" || aba === "pipeline" || aba === "radar";
  let content;
  if (aba === "selecao") {
    const [desk, published, eligible, engagement, recommendations, discovery] = await Promise.all([
      getEditorialSelectionDesk(scopedTenantId(),undefined,params.revisar),
      getPublishedEditorialSelection("all"),
      automatedTriageAvailability(),
      homepageEngagementReport(scopedTenantId()),
      recommendationDesk(),
      discoveryPolicies(),
    ]);
    const state = selectionWorkflowState({
      schemaReady: published.schemaReady,
      mode: published.mode,
      count: published.products.length,
      validUntil: published.validUntil,
    });
    content = (
      <>
        <section className="curation-next-action">
          <div>
            <p className="eyebrow">Vitrine disponível agora</p>
            <h2>{state.label}</h2>
            <p>
              Produtos aprovados entram no catálogo. A seleção define os
              destaques de cada canal, com maior exigência para indicação direta.
            </p>
          </div>
          <div className="curation-review-actions">
            {state.ready && (
              <a className="admin-curation-start" href="/pauta">
                Preparar pauta →
              </a>
            )}
            <a href="/admin#captura-hoje">Capturar novas ofertas</a>
          </div>
        </section>
        <TriageControl eligible={eligible} />
        <RecommendationControl candidates={desk.candidates.map(c=>({id:c.id,title:c.title,displayTitle:c.displayTitle,offerOptionLabel:c.offerOptionLabel}))} tenantId={account?.tenantId ?? ""} desk={recommendations} canManage={account?.membershipRole === "owner"}/>
        {recommendations.ready && <DiscoveryControl tenantId={account?.tenantId ?? ""} policies={discovery} canManage={account?.membershipRole === "owner"}/>}
        <PublishedSelection selection={published} />
        <HomepageMetrics rows={engagement} />
        <details className="curation-manual-edition" open={Boolean(params.revisar)}>
          <summary>Avaliar produtos e conferir opções</summary>
          <p>
            Confira as opções e registre o mérito dos candidatos. A lista e a ordem de cada destino são definidas nos controles de canal acima.
          </p>
          <SelecaoView reviewOnly
            key={params.revisar ?? "editorial-desk"}
            initialCandidates={desk.candidates}
            initialSelection={desk.selection}
            schemaReady={desk.schemaReady}
            catalogHeroActive={desk.catalogHeroActive}
            initialEditingId={params.revisar}
          />
        </details>
      </>
    );
  } else if (aba === "excecoes") {
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
          <h2>Resolver pendências</h2>
          <p>
            Decida apenas o que exige atenção humana. As três filas separam
            produtos disponíveis para decisão, retidos e adiados.
          </p>
        </section>
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
      </>
    );
  } else if (aba === "auditoria") {
    const rubricMetrics = account
      ? await withAccountDb(account, (tx) => getRubricPromotionMetrics(tx, account.tenantId)).catch(() => null)
      : null;
    content = (
      <SpotCheckView
        key={`${audit.progress.reviewed}:${audit.products.map((p) => p.sourceEventId).join(",")}`}
        initialProducts={audit.products}
        initialReviewed={audit.progress.reviewed}
        dailyTarget={audit.progress.target}
        initialRubricMetrics={rubricMetrics}
      />
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
    const [batches, runs] = await Promise.all([
      getTriageBatchesHistory(scopedTenantId(), 8),
      captureRuns(6),
    ]);
    content = (
      <PipelineView
        triageBatches={batches}
        captureRuns={runs.map((run) => ({
          ...run,
          started_at: new Date(run.started_at).toISOString(),
          finished_at: run.finished_at
            ? new Date(run.finished_at).toISOString()
            : null,
        }))}
      />
    );
  }
  const tabs = [
    { id: "selecao", label: "Seleção", detail: "Destaques e pauta" },
    {
      id: "excecoes",
      label: "Pendências",
      detail: `${pendingTotal} produtos recentes`,
    },
    {
      id: "auditoria",
      label: "Qualidade da IA",
      detail: audit.progress.remaining
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
            Capture ofertas, resolva exceções e leve os melhores produtos à
            pauta.
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
      <details className="curation-settings-nav" open={secondary}>
        <summary>Configurações e histórico</summary>
        <nav aria-label="Apoio à curadoria">
          <a
            href={href("bussola")}
            aria-current={aba === "bussola" ? "page" : undefined}
          >
            Critérios e automação
          </a>
          <a
            href={href("radar")}
            aria-current={aba === "radar" ? "page" : undefined}
          >
            Radar de oportunidades
          </a>
          <a
            href={href("pipeline")}
            aria-current={aba === "pipeline" ? "page" : undefined}
          >
            Histórico da IA
          </a>
        </nav>
      </details>
      {content}
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
