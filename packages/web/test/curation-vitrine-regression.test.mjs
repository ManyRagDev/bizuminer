import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { PRODUCT_EVIDENCE_TTL_DAYS, isPublicCatalogEligible } from "../lib/catalog-policy.ts";
import { CURATION_STATUSES } from "../lib/curation-contract.ts";
import { stateAfterDecision } from "../lib/curation-transition.ts";
import * as marketplaces from "../lib/marketplaces.ts";
import * as dealSignal from "../lib/deal-signal.ts";
import * as offerPrice from "../lib/offer-price.ts";
import * as offerOption from "../lib/offer-option.ts";
import * as dealQuery from "../lib/deal-query.ts";
import * as heroPolicy from "../lib/hero-policy.ts";
import * as homeCover from "../lib/home-cover.ts";
import * as savedProducts from "../lib/saved-products.ts";
import * as catalogNavigation from "../lib/catalog-navigation.ts";

/**
 * Predicado canônico da vitrine conforme implementado em packages/web/lib/db.ts:
 * "and pc.status = 'approved'" + validade de evidência de sete dias.
 */
function isVitrineVisible(status) {
  return isPublicCatalogEligible(status, "2026-09-05T12:00:00.000Z", new Date("2026-09-06T12:00:00.000Z"));
}

test("M4-E Vitrine: Isolamento editorial estrito de statuses", () => {
  // 1. statuses possíveis
  assert.deepEqual(CURATION_STATUSES, ["legacy_visible", "pending", "approved", "rejected", "held"]);

  // 2. Vitrine só aceita approved
  assert.equal(isVitrineVisible("approved"), true);
  assert.equal(isVitrineVisible("legacy_visible"), false);
  assert.equal(isVitrineVisible("pending"), false);
  assert.equal(isVitrineVisible("held"), false);
  assert.equal(isVitrineVisible("rejected"), false);
});

test("catálogo: evidência vence após sete dias e uma reobservação renova", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(PRODUCT_EVIDENCE_TTL_DAYS, 7);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-01T12:00:00.000Z", now), true);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-01T11:59:59.999Z", now), false);
  assert.equal(isPublicCatalogEligible("approved", "2026-09-08T11:00:00.000Z", now), true);
});

test("M4-E Vitrine: Ação em massa com saturação não vaza produtos retidos para a vitrine", () => {
  // Simulação de catálogo com 5 produtos
  const catalog = [
    { id: "p1", title: "Item 1", status: "pending" },
    { id: "p2", title: "Item 2", status: "pending" },
    { id: "p3", title: "Item 3", status: "pending" },
    { id: "p4", title: "Item 4", status: "pending" },
    { id: "p5", title: "Item 5", status: "pending" },
  ];

  // Antes de qualquer ação: nenhum pendente aparece na vitrine
  const initialVitrine = catalog.filter((p) => isVitrineVisible(p.status));
  assert.equal(initialVitrine.length, 0);

  // Ação de grupo M4-E:
  // p1 aprovado como representante
  // p2 a p5 retidos por saturação de família
  const updatedCatalog = catalog.map((p) => {
    if (p.id === "p1") {
      const trans = stateAfterDecision({ status: "approved", reasonCode: null, reasonDetail: null });
      return { ...p, status: trans.status };
    } else {
      const trans = stateAfterDecision({ status: "held", reasonCode: "family_saturation", reasonDetail: null });
      return { ...p, status: trans.status };
    }
  });

  // Após ação: apenas p1 aparece na vitrine; os retidos por saturação ficam estritamente ocultos
  const finalVitrine = updatedCatalog.filter((p) => isVitrineVisible(p.status));
  assert.equal(finalVitrine.length, 1);
  assert.equal(finalVitrine[0].id, "p1");
  assert.equal(finalVitrine[0].status, "approved");

  const nonVisible = updatedCatalog.filter((p) => !isVitrineVisible(p.status));
  assert.equal(nonVisible.length, 4);
  for (const item of nonVisible) {
    assert.equal(item.status, "held");
  }
});

test("M4-E Vitrine: Rejeição em lote mantém itens fora da vitrine", () => {
  const products = [
    { id: "r1", status: "pending" },
    { id: "r2", status: "pending" },
  ];

  const rejected = products.map((p) => {
    const trans = stateAfterDecision({ status: "rejected", reasonCode: "low_utility", reasonDetail: null });
    return { ...p, status: trans.status };
  });

  const vitrine = rejected.filter((p) => isVitrineVisible(p.status));
  assert.equal(vitrine.length, 0);
});

test("Vitrine preserva imagem, link e título mesmo quando OfferExpiryBoundary marca preço expirado", () => {
  for (const expired of [false, true]) {
    const exports = {};
    const source = ts.transpileModule(readFileSync(new URL("../app/vitrine.tsx", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const stubComp = (props) => props?.children ?? null;
    vm.runInNewContext(source, {
      exports, module: { exports }, process, URL, URLSearchParams,
      require(id) {
        if (id === "react/jsx-runtime") return jsxRuntime;
        if (id === "react") {
          return {
            Fragment: ({ children }) => children,
            useState: (init) => [typeof init === "function" ? init() : init, () => {}],
            useMemo: (fn) => fn(),
            useRef: (v) => ({ current: v }),
            useEffect: () => {},
          };
        }
        if (id === "next/image") return { __esModule: true, default: ({ src, alt }) => jsxRuntime.jsx("img", { src, alt }) };
        if (id === "next/link") return { __esModule: true, default: ({ href, children, ...rest }) => jsxRuntime.jsx("a", { href, ...rest, children }) };
        if (id.includes("offer-expiry-boundary")) return { useOfferExpired: () => expired };
        if (id.includes("marketplaces")) return marketplaces;
        if (id.includes("deal-signal")) return dealSignal;
        if (id.includes("offer-price")) return offerPrice;
        if (id.includes("offer-option")) return offerOption;
        if (id.includes("deal-query")) return dealQuery;
        if (id.includes("hero-policy")) return heroPolicy;
        if (id.includes("home-cover")) return homeCover;
        if (id.includes("saved-products")) return savedProducts;
        if (id.includes("catalog-navigation")) return catalogNavigation;
        if (id.includes("member-actions")) return { requestFavorite: async () => ({ ok: true }) };
        if (id.includes("analytics")) return { trackEvent: () => {} };
        if (id.includes("use-homepage-engagement")) return { useHomepageEngagement: () => {} };
        if (id.includes("theme-toggle")) return { ThemeToggle: stubComp };
        return { __esModule: true, default: stubComp };
      },
    }, { filename: "vitrine.tsx" });

    const Vitrine = exports.default;
    const html = renderToStaticMarkup(jsxRuntime.jsx(Vitrine, {
      initialProducts: [{
        id: "p-img-1",
        slug: "ml-MLB123",
        title: "Produto Teste",
        priceCents: 15000,
        originalPriceCents: 20000,
        previousMinPriceCents: 18000,
        discountPercent: 25,
        imageUrl: "https://http2.mlstatic.com/test.webp",
        ratingStar: 4.8,
        salesLabel: "100 vendidos",
        salesCount: 100,
        evidenceObservedAt: new Date(Date.now() - 72 * 3_600_000).toISOString(),
        observationCount: 3,
        historyDays: 10,
        lowestVerified: false,
        category: "Casa",
        marketplace: "mercadolivre",
        offerValidUntil: expired ? new Date(Date.now() - 3_600_000).toISOString() : undefined,
      }],
      initialTotal: 1,
      initialState: dealQuery.catalogStateFromSearchParams(new URLSearchParams()),
      categories: ["Casa"],
      dateLabel: "14 nov",
      renderTimestamp: new Date().toISOString(),
    }));

    assert.match(html, /https:\/\/http2\.mlstatic\.com\/test\.webp/, `imagem deve aparecer (expired=${expired})`);
    assert.match(html, /Produto Teste/, `título deve aparecer (expired=${expired})`);
    assert.match(html, /href="\/bizu\/ml-MLB123"/, `link para detalhe deve aparecer (expired=${expired})`);
    if (expired) {
      assert.match(html, /Preço atual não confirmado\./);
      assert.doesNotMatch(html, /href="\/go\//);
      assert.doesNotMatch(html, /class="discount"/);
    } else {
      assert.match(html, /última vez visto/);
      assert.doesNotMatch(html, /Preço atual não confirmado\./);
    }
  }
});
