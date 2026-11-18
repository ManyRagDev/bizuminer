import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { curationOfferHref, curationIssuesHref } from "../lib/curation-navigation.ts";
import { canonicalAdminQuery, canonicalAdminUrl } from "../lib/admin-query-aliases.ts";
import { captureReference, captureDetailHref, captureQuery, captureFilters } from "../lib/capture-activity.ts";

function component(path, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, require(id) {
    if (modules[id]) return modules[id];
    if (id === "react/jsx-runtime") return jsx;
    if (id.includes('use-operation-progress')) return {useOperationProgress:()=>({data:null,error:false})};
    if (id.includes("curation-navigation")) return { curationIssuesHref };
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  return exports.default;
}
const Automation = component("../app/admin/curadoria/automation-status.tsx");
const Today = component("../app/admin/today-command-center.tsx", {
  "./curadoria/automation-status.tsx": { default: Automation },
  "./workbench-interactive-table.tsx": { default: () => React.createElement("p", null, "Bancada manual") },
});
const automation = { queued: 2, running: 0, uncertain: 13, assessed: 1081, eligible: 900, exceptions: 0, checks: 5 };
const props = { tenantId: "conta-b", autoPublish: true, minScore: 4, captureDoneToday: true,
  triageDoneToday: false, approvedToday: 0, eligibleTriage: 33, selectionReady: true,
  selectionLabel: "24 produtos selecionados", awaiting: 34, held: 0, deferred: 0, auditRemaining: 0,
  workbenchPage: { items: [] } };

test("Hoje v2 apresenta avaliação incerta e fila sem pedir triagem ou decisão manual do catálogo", () => {
  const html = renderToStaticMarkup(React.createElement(Today, { ...props, automation }));
  assert.match(html, /13 avaliações têm resultado incerto/);
  assert.match(html, /Exceções editoriais · 0 · revisão opcional/);
  assert.match(html, /início do processamento ainda não está confirmado/);
  assert.match(html, /aba=problemas&amp;conta=conta-b#avaliacoes-incertas/);
  assert.doesNotMatch(html, /Triar 33|Aprova notas|34 aguardando|Resolver pendências na bancada|Bancada manual|O cron acompanha/);
});

test("Hoje mantém as ações do modo legado e não afirma que um cron está rodando", () => {
  const html = renderToStaticMarkup(React.createElement(Today, props));
  assert.match(html, /Triar 33 produtos com IA/);
  assert.match(html, /Aprova notas a partir de 4/);
  assert.match(html, /34 aguardando/);
  assert.match(html, /Bancada manual/);
  assert.doesNotMatch(html, /O cron acompanha/);
});

test("links operacionais preservam conta, opção, origem e canal fora do workspace comercial", () => {
  const link = new URL(curationOfferHref("produto-a", "conta-b", {
    optionKey: "azul/220v", origin: "pauta", channel: "stories", confirm: true,
  }), "https://fixture.invalid");
  assert.equal(link.pathname, "/admin/curadoria/ofertas/produto-a");
  assert.equal(link.searchParams.get("conta"), "conta-b");
  assert.equal(link.searchParams.get("opcao"), "azul/220v");
  assert.equal(link.searchParams.get("origem"), "pauta");
  assert.equal(link.searchParams.get("canal"), "stories");
  assert.equal(link.hash, "#confirmar-opcao-produto-a");
  const params = { aba: "problemas", conta: "conta-b" };
  assert.equal(canonicalAdminQuery(params).aba, "problemas");
  assert.match(canonicalAdminUrl("/admin/curadoria", params), /conta=conta-b/);
});

test("o detalhe mantém o gate comercial existente e não prepara links ao ser consultado", async () => {
  let calls = 0;
  const candidate = { id: "produto-a", title: "UGREEN", marketplace: "aliexpress", productUrl: "https://www.aliexpress.com/item/10000000001.html",
    priceCents: 9900, currency: "BRL", priceType: "exact", offerOptionKey: "azul", offerOptionLabel: "Azul", evidenceObservedAt: "2026-11-15T16:00:00Z" };
  const Page = component("../app/admin/curadoria/ofertas/[id]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("404"); } },
    "../../../../../lib/page-account.ts": { pageAccount: async tenant => tenant === "conta-b" ? { tenantId: tenant, actorAppUserId: "owner" } : null },
    "../../../../../lib/account-scope.ts": { inAccountScope: (_c, work) => work() },
    "../../../../../lib/pauta-db.ts": { readOperationalOffer: async () => { calls++; return { candidate, configured: false,
      channels: [{ channel: "whatsapp", selected: false, reasons: ["Falta um link de afiliado válido."] }],
      uncertain: 1, evaluationQueued: false, evaluationRunning: false, consultedAt: "2026-11-15T17:00:00Z" }; } },
    "../../../../../lib/curation-navigation.ts": { curationOfferHref, curationIssuesHref },
    "../../../../../lib/capture-activity.ts": { captureReference, captureDetailHref, captureQuery, captureFilters },
    "../../../../../lib/marketplaces.ts": { marketplaceDef: () => ({ label: "AliExpress" }) },
    "../../../../../lib/offer-price.ts": { offerPriceLabel: () => "R$ 99,00" },
    "../../../../_components/admin-link.tsx": { default: ({ children, ...p }) => React.createElement("a", p, children) },
    "../../../draft-provider.tsx": { AdminDraftScope: ({ children }) => children },
    "../../offer-confirmation.tsx": { default: () => React.createElement("p", null, "Conferência de opção disponível") },
  });
  const render = async query => renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "produto-a" }), searchParams: Promise.resolve(query) }));
  const html = await render({ conta: "conta-b", origem: "pauta", canal: "stories" });
  assert.match(html, /UGREEN/);
  assert.match(html, /Falta um link de afiliado válido/);
  assert.match(html, /Voltar à pauta/);
  assert.match(html, /conta=conta-b&amp;canal=stories/);
  assert.match(html, /Conferência de opção disponível/);
  const mismatch = await render({ conta: "conta-b", opcao: "vermelho", origem: "avaliacoes" });
  assert.match(mismatch, /Opção solicitada: vermelho/);
  assert.match(mismatch, /Voltar às avaliações incertas/);
  assert.doesNotMatch(mismatch, /Conferência de opção disponível/);
  const capture = await render({conta:'conta-b',origem:'capturas',captura:'batch:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    retornoCaptura:'conta=outra-conta&loja=amazon&depois=pagina-anterior'});
  assert.match(capture,/Voltar à captura/);assert.match(capture,/conta=conta-b&amp;loja=amazon&amp;depois=pagina-anterior/);
  const issue=await render({conta:'conta-b',origem:'avaliacoes',retornoProblemas:'conta=estranha&categoria=uncertain&depois=pagina_2'});
  assert.match(issue,/conta=conta-b&amp;categoria=uncertain&amp;depois=pagina_2#avaliacoes-incertas/);
  await assert.rejects(render({ conta: "outra-conta" }), /404/);
  assert.equal(calls, 4);
  const gate = readFileSync(new URL("../app/admin/ofertas/layout.tsx", import.meta.url), "utf8");
  assert.match(gate, /affiliateWorkspaceEnabled/);
});
