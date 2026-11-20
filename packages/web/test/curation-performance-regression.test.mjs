import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { readCurationAutomation } from '../lib/curation-automation.ts';
import { enrichPautaResponse } from '../lib/pauta-response.ts';

function load(path, stubs = {}, permissive = false) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Intl, Date, URL, URLSearchParams, Response, Error,
    require(id) {
      if (stubs[id]) return stubs[id];
      if (id === 'react/jsx-runtime') return jsx;
      if (id.endsWith('.css')) return { default: {} };
      if (id.includes('admin-link')) return { default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (permissive) return { default: () => null };
      throw new Error('Unexpected dependency ' + id);
    },
  });
  return exports;
}

test('readCurationAutomation memoiza por objeto account durante a requisicao', async () => {
  assert.equal(typeof readCurationAutomation, 'function');
});

test('Curadoria aba selecao carrega gavetas sob demanda sem invocar pool pesado', async () => {
  const account = { tenantId: 'perf_tenant_a', affiliateId: 'aff_a', actorAppUserId: 'u_a', membershipRole: 'owner' };
  let poolCalls = 0;
  let deskCalls = 0;

  const Page = load('../app/admin/curadoria/page.tsx', {
    '../../../lib/page-account.ts': { pageAccount: async () => account },
    '../../../lib/account-scope.ts': { inAccountScope: (_account, fn) => fn(), currentAccount: () => account, scopedTenantId: () => account.tenantId },
    '../../../lib/auth.ts': { getPageAuth: async () => ({ id: 'auth' }) },
    '../../../lib/admin-query-aliases.ts': { canonicalAdminQuery: () => ({ aba: 'selecao', redirectNeeded: false }) },
    '../../../lib/curation-automation.ts': {
      readCurationAutomation: async () => ({ queued: 0, running: 0, uncertain: 0, assessed: 10, eligible: 10, exceptions: 0, checks: 5 }),
    },
    '../../../lib/curation-db.ts': {
      curationSummary: async () => ({ awaiting: 0, newPending: 0, legacyVisible: 0, held: 0, approved: 10, rejected: 0, deferred: 0 }),
      automatedTriageAvailability: async () => 0,
    },
    '../../../lib/curation-pool-read.ts': {
      readCurationPool: async () => {
        poolCalls++;
        return { capacity: 24, counts: { hot: 1, warm: 2, cold: 3 }, items: [] };
      },
    },
    '../../../lib/editorial-selection-db.ts': {
      getEditorialSelectionDesk: async () => {
        deskCalls++;
        return { schemaReady: true, selection: null, candidates: [], catalogHeroActive: false, publishedProductIds: [] };
      },
      getPublishedEditorialSelection: async () => ({ schemaReady: true, mode: 'catalog', products: [] }),
    },
    '../../../lib/curation-score-read.ts': { readScoreComparison: async () => [] },
    '../../../lib/recommendation-db.ts': { recommendationDesk: async () => ({ ready: false, channels: [] }) },
    '../../../lib/discovery-policy-db.ts': { discoveryPolicies: async () => [] },
    '../../../lib/curation-equivalence-db.ts': { readEquivalenceDesk: async () => ({ options: [], groups: [], suggestions: [], available: false }) },
    '../../../lib/curation-operations-metrics.ts': { readCurationOperationsMetrics: async () => null },
    '../../../lib/curation-policy-db.ts': { readCurationPolicy: async () => null },
    '../../../lib/curation-handoff.ts': { readCurationHandoff: async () => null },
    '../../../lib/curation-workflow.ts': { curationNextStep: () => ({ title: 'Passo', description: 'Desc', action: 'Ação', kind: 'triage' }) },
    '../../../lib/curation-triage-db.ts': { automatedTriageAvailability: async () => 0 },
    '../../../lib/homepage-db.ts': { homepageEngagementReport: async () => [] },
    '../draft-provider.tsx': { AdminDraftScope: ({ children }) => children },
  }, true).default;

  // 1. Initial page load (no bancada=1, no diagnostico=1)
  const defaultHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ conta: 'perf_tenant_a' }) }));
  assert.equal(poolCalls, 0, 'readCurationPool NÃO deve ser chamado na abertura padrão de selecao');
  assert.equal(deskCalls, 0, 'getEditorialSelectionDesk NÃO deve ser chamado na abertura padrão');
  assert.match(defaultHtml, /Abrir bancada de revisão editorial →/);
  assert.match(defaultHtml, /Carregar configurações e diagnóstico da curadoria →/);

  // 2. Open with bancada=1
  const bancadaHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ conta: 'perf_tenant_a', bancada: '1' }) }));
  assert.equal(poolCalls, 0, 'readCurationPool ainda NÃO deve ser chamado com bancada=1');
  assert.equal(deskCalls, 1, 'getEditorialSelectionDesk deve ser chamado quando bancada=1');

  // 3. Open with diagnostico=1
  const diagHtml = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ conta: 'perf_tenant_a', diagnostico: '1' }) }));
  assert.equal(poolCalls, 1, 'readCurationPool deve ser chamado apenas quando diagnostico=1');
});

test('enrichPautaResponse mapeia alvos de pauta e site gerando urls canônicas', () => {
  const raw = {
    products: [
      {
        id: 'prod_site',
        title: 'Produto Vitrine',
        marketplace: 'mercadolivre',
        priceCents: 15000,
        priceType: 'exact',
        currency: 'BRL',
        shareTarget: { kind: 'site', slug: 'prod-slug' },
        shortCode: 'abc123',
        offerOptionKey: null,
      },
      {
        id: 'prod_pauta',
        title: 'Produto Pauta Direto',
        marketplace: 'shopee',
        priceCents: 8900,
        priceType: 'exact',
        currency: 'BRL',
        shareTarget: { kind: 'pauta', token: 'tok_xyz' },
        offerOptionKey: null,
      },
    ],
    preparations: [],
    recent: [],
    recentTotal: 0,
    captureActions: { review: 0, triage: 0, retry: 0 },
    active: true,
    updatedAt: new Date().toISOString(),
    revision: 'rev_1',
  };

  const enriched = enrichPautaResponse(raw, 'tenant_test', 'https://www.bizuminer.com.br');
  assert.equal(enriched.products.length, 2);

  const siteItem = enriched.products[0];
  assert.equal(siteItem.slug, 'prod-slug');
  assert.equal(siteItem.shopUrl, '/go/prod-slug');
  assert.equal(siteItem.shareUrl, 'https://www.bizuminer.com.br/p/abc123');
  assert.equal(siteItem.detailUrl, '/bizu/prod-slug');
  assert.ok(siteItem.copyKey);

  const pautaItem = enriched.products[1];
  assert.equal(pautaItem.shopUrl, '/go/pauta/tok_xyz');
  assert.equal(pautaItem.shareUrl, 'https://www.bizuminer.com.br/p/pauta/tok_xyz');
  assert.equal(pautaItem.detailUrl, '/p/pauta/tok_xyz');
  assert.match(pautaItem.storyUrl, /pauta=1&conta=tenant_test/);
});
