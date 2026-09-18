import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  curationDecisionLoad,
  curationGroupCards,
  curationQueue,
  curationSummary,
  deferredQueue,
  getApprovedVitrineProducts,
} from "../../../lib/curation-db.ts";
import {
  getEditorialGuideline,
  getGoldenExamples,
  getOperationalPulse,
  getRecentSpotCheckProducts,
  getTriageBatchesHistory,
} from "../../../lib/editorial-compass.ts";
import { captureRuns } from "../../../lib/admin-db.ts";
import { canonicalAdminQuery, canonicalAdminUrl } from "../../../lib/admin-query-aliases.ts";
import { formatDecisionLoad } from "../../../lib/curation-contract.ts";
import { shortCodesForSlugs } from "../../../lib/short-link-db.ts";
import { shareBaseUrl } from "../../../lib/site-url.ts";
import SelecaoView from "./selecao-view.tsx";
import CurationReviewer from "./curation-reviewer.tsx";
import GroupReviewer from "./group-reviewer.tsx";
import SpotCheckView from "./spot-check-view.tsx";
import HeldQueueView from "./held-queue-view.tsx";
import BussolaView from "../direcionamento/bussola-view.tsx";
import PipelineView from "../direcionamento/pipeline-view.tsx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mesa Única de Curadoria Editorial | BizuMiner",
  robots: { index: false, follow: false },
};

export default async function CurationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const canonical = canonicalAdminQuery(params);
  if (canonical.redirectNeeded) {
    redirect(canonicalAdminUrl("/admin/curadoria", params));
  }
  const activeTab = canonical.aba;
  const subTab = canonical.sub || "padrao";

  const [summary, decisionLoad] = await Promise.all([
    curationSummary(),
    curationDecisionLoad("local"),
  ]);

  // Carregamento sob demanda conforme a aba ativa
  let approvedProducts = null;
  let singularProducts = null;
  let groupCards = null;
  let heldProducts = null;
  let spotCheckProducts = null;
  let guideline = null;
  let goldenExamples = null;
  let triageBatches = null;
  let operationalPulse = null;
  let serializedCaptureRuns = null;
  let shareHost = shareBaseUrl().replace(/\/$/, "");
  let productShortCodes: Record<string, string> = {};

  if (activeTab === "selecao") {
    approvedProducts = await getApprovedVitrineProducts("local", 60);
    const codesMap = await shortCodesForSlugs(approvedProducts.map((p) => p.slug));
    productShortCodes = Object.fromEntries(codesMap.entries());
  } else if (activeTab === "excecoes") {
    if (subTab === "grupos") {
      groupCards = await curationGroupCards(20, "local");
    } else {
      const queue = await curationQueue(20, "local", "awaiting");
      singularProducts = queue.map((product) => ({
        ...product,
        observedAt: new Date(product.observedAt).toISOString(),
        queuedAt: new Date(product.queuedAt).toISOString(),
      }));
    }
  } else if (activeTab === "auditoria") {
    if (subTab === "espera") {
      heldProducts = await deferredQueue(50, "local");
    } else {
      spotCheckProducts = await getRecentSpotCheckProducts("local", 12);
    }
  } else if (activeTab === "bussola") {
    const [g, ge] = await Promise.all([
      getEditorialGuideline("local"),
      getGoldenExamples("local", 6),
    ]);
    guideline = g;
    goldenExamples = ge;
  } else if (activeTab === "pipeline") {
    const [tb, op, cr] = await Promise.all([
      getTriageBatchesHistory("local", 8),
      getOperationalPulse("local"),
      captureRuns(6, "local"),
    ]);
    triageBatches = tb;
    operationalPulse = op;
    serializedCaptureRuns = cr.map((r) => ({
      ...r,
      started_at: typeof r.started_at === "string" ? r.started_at : new Date(r.started_at).toISOString(),
      finished_at: r.finished_at
        ? typeof r.finished_at === "string"
          ? r.finished_at
          : new Date(r.finished_at).toISOString()
        : null,
    }));
  }

  const exceptionsCount = decisionLoad.singularsCount + decisionLoad.openGroupsCount;

  return (
    <div className="curation-page">
      <section className="curation-header-banner" aria-label="Carga decisória e vitrine">
        <div className="curation-decision-load">
          <p className="eyebrow">Carga de Decisão & Vitrine</p>
          <p className="curation-load-text">
            <strong>{formatDecisionLoad(decisionLoad)}</strong> • <span style={{ color: "var(--ink-muted)" }}>{summary.approved} produtos ativos no catálogo</span>
          </p>
        </div>
      </section>

      <nav className="curation-tabs" aria-label="Abas da curadoria editorial">
        <a
          href="/admin/curadoria?aba=excecoes"
          className={"curation-tab " + (activeTab === "excecoes" ? "active" : "")}
        >
          Fila de Decisão
          {exceptionsCount > 0 && (
            <span className="curation-tab-badge" title="Fila de julgamento">{exceptionsCount}</span>
          )}
        </a>
        <a
          href="/admin/curadoria?aba=auditoria"
          className={"curation-tab " + (activeTab === "auditoria" ? "active" : "")}
        >
          Auditoria & Espera
          {summary.held > 0 && (
            <span className="curation-tab-badge" title="Em espera">{summary.held}</span>
          )}
        </a>
        <a
          href="/admin/curadoria?aba=bussola"
          className={"curation-tab " + (activeTab === "bussola" ? "active" : "")}
        >
          🧭 Bússola Editorial
        </a>
        <a
          href="/admin/curadoria?aba=pipeline"
          className={"curation-tab " + (activeTab === "pipeline" ? "active" : "")}
        >
          ⚡ Pipeline & Lotes
        </a>
        <a
          href="/admin/curadoria?aba=selecao"
          className={"curation-tab " + (activeTab === "selecao" ? "active" : "")}
        >
          Vitrine Ativa
          {summary.approved > 0 && (
            <span className="curation-tab-badge" title="Produtos no ar na vitrine">{summary.approved}</span>
          )}
        </a>
      </nav>

      {/* ABA 1: Seleção do Dia */}
      {activeTab === "selecao" && approvedProducts && (
        <SelecaoView
          initialProducts={approvedProducts}
          shortCodes={productShortCodes}
          shareHost={shareHost}
        />
      )}

      {/* ABA 2: Exceções para Julgamento */}
      {activeTab === "excecoes" && (
        <div className="curation-tab-panel">
          <div className="curation-sub-nav">
            <a
              href="/admin/curadoria?aba=excecoes&sub=singulars"
              className={"curation-sub-tab " + (subTab !== "grupos" ? "active" : "")}
            >
              Itens Singulares ({decisionLoad.singularsCount})
            </a>
            <a
              href="/admin/curadoria?aba=excecoes&sub=grupos"
              className={"curation-sub-tab " + (subTab === "grupos" ? "active" : "")}
            >
              Grupos Repetitivos ({decisionLoad.openGroupsCount})
            </a>
          </div>

          {subTab === "grupos" && groupCards ? (
            <GroupReviewer initialCards={groupCards} />
          ) : singularProducts ? (
            <CurationReviewer
              initialProducts={singularProducts}
              initialAwaiting={summary.awaiting}
              queueKind="awaiting"
            />
          ) : null}
        </div>
      )}

      {/* ABA 3: Auditoria & Amostragem */}
      {activeTab === "auditoria" && (
        <div className="curation-tab-panel">
          <div className="curation-sub-nav">
            <a
              href="/admin/curadoria?aba=auditoria&sub=spotcheck"
              className={"curation-sub-tab " + (subTab !== "espera" ? "active" : "")}
            >
              Auditoria Rápida (Spot-Check)
            </a>
            <a
              href="/admin/curadoria?aba=auditoria&sub=espera"
              className={"curation-sub-tab " + (subTab === "espera" ? "active" : "")}
            >
              Fila de Espera ({summary.held})
            </a>
          </div>

          {subTab === "espera" && heldProducts ? (
            <HeldQueueView initialProducts={heldProducts} />
          ) : spotCheckProducts ? (
            <SpotCheckView initialProducts={spotCheckProducts} />
          ) : null}
        </div>
      )}

      {/* ABA 4: Bússola Editorial (Foco em Diretrizes e Piloto) */}
      {activeTab === "bussola" && guideline && goldenExamples && (
        <BussolaView
          initialGuideline={guideline}
          goldenExamples={goldenExamples}
        />
      )}

      {/* ABA 5: Pipeline & Lotes (Disparo e Histórico) */}
      {activeTab === "pipeline" && triageBatches && operationalPulse && serializedCaptureRuns && (
        <PipelineView
          triageBatches={triageBatches}
          operationalPulse={operationalPulse}
          captureRuns={serializedCaptureRuns}
        />
      )}
    </div>
  );
}
