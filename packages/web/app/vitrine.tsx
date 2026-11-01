"use client";
import { optionDetailPath } from "../lib/offer-option.ts";

import Image from "next/image";
import Link from "next/link";
import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_PAGE_SIZE, catalogStateFromSearchParams, catalogStateToDealQuery, catalogStateToSearchParams } from "../lib/deal-query";
import type { CatalogState, DealSort, FreshnessBand, PriceBand } from "../lib/deal-query";
import { freshnessLabel, priceFreshness, priceHighlight, priceNarrative, seenAgo } from "../lib/deal-signal";
import { mergeSavedProducts, readSavedState, writeSavedState } from "../lib/saved-products";
import type { VitrineProduct } from "../lib/deal-view";
import { MARKETPLACES, marketplaceDef, type MarketplaceDef } from "../lib/marketplaces";
import CopyProductLink from "./_components/copy-product-link";
import { ThemeToggle } from "./theme-toggle";
import { HERO_MAX_PRODUCTS } from "../lib/hero-policy";
import { isHomepageSelectionQuery } from "../lib/deal-query";
import { requestFavorite } from "../lib/member-actions";
import { offerPriceLabel, offerPriceNote } from "../lib/offer-price";
import { CATALOG_RETURN_KEY, parseCatalogReturn } from "../lib/catalog-navigation";
import { useHomepageEngagement } from "./_components/use-homepage-engagement";
import HomeBanner from "./_components/home-banner";
import { selectCoverProduct } from "../lib/home-cover";

type EditorialProduct = VitrineProduct & { editorialRationale: string; editorialContext: string; editorialPurchaseContents: string };

type ApiPage = { selectionVersion?: number | null; selectionStateKey?: string; products: VitrineProduct[]; total: number; categories: string[]; marketplaceCounts: Record<string, number> };
type MobileView = "home" | "categories" | "saved" | "filters" | "menu" | "guide";

const catalogGuide = "Acompanhamos o preço de todas as ofertas daqui. Como isso vale para o catálogo inteiro, não repetimos em cada produto: o selo só aparece quando o histórico tem algo a dizer que o anúncio não diz.";

const priceFilters: Array<{ value: PriceBand; label: string }> = [{ value: "all", label: "todos" }, { value: "under_100", label: "até R$100" }, { value: "100_500", label: "R$100–500" }, { value: "over_500", label: "acima R$500" }];
const sortOptions: Array<{ value: DealSort; label: string }> = [{ value: "signal", label: "ordem editorial" }, { value: "price", label: "menor preço" }, { value: "popularity", label: "mais populares" }, { value: "recent", label: "atualizados agora" }];
const freshnessOptions: Array<{ value: FreshnessBand; label: string }> = [{ value: "today", label: "hoje" }, { value: "2d", label: "últimas 48 horas" }, { value: "3d", label: "últimos 3 dias" }, { value: "7d", label: "últimos 7 dias" }, { value: "14d", label: "últimos 14 dias" }, { value: "all", label: "tudo" }];
const ratingOptions = [{ value: 4, label: "★★★★+" }, { value: 3, label: "★★★+" }, { value: 2, label: "★★+" }];
const discountOptions = [{ value: 30, label: "30%+" }, { value: 50, label: "50%+" }, { value: 70, label: "70%+" }];
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
const historyInput = (product: VitrineProduct) => ({ priceCents: product.priceCents, previousMinPriceCents: product.previousMinPriceCents, observationCount: product.observationCount, historyDays: product.historyDays, lowestVerified: product.lowestVerified });
/** Percentual de desconto declarado pelo anúncio, ou null. Alegação do vendedor — nunca cálculo nosso. */
const discountPercentOf = (product: VitrineProduct): number | null => {
  if (product.discountPercent && product.discountPercent > 0) return product.discountPercent;
  if (product.originalPriceKind === "source_claimed" && product.originalPriceCents && product.originalPriceCents > product.priceCents) {
    return Math.round((1 - product.priceCents / product.originalPriceCents) * 100);
  }
  return null;
};
const trackInteraction = (event: string, productId?: string) => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bizuminer:interaction", { detail: { event, productId } })); };

function paginationItems(current: number, total: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const visible = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | "ellipsis-left" | "ellipsis-right"> = [];
  visible.forEach((page, index) => {
    const previous = visible[index - 1];
    if (previous && page - previous > 1) result.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    result.push(page);
  });
  return result;
}

function MarketplaceEvidence({ product }: { product: VitrineProduct }) {
  if (product.ratingStar === null && !product.salesLabel) return null;
  const evidenceLabel = marketplaceDef(product.marketplace)?.evidenceLabel ?? `dados de ${product.marketplace}`;
  return <p className="product-evidence">
    {product.ratingStar !== null && <span>★ {product.ratingStar.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>}
    {product.ratingStar !== null && product.salesLabel && <i>·</i>}
    {product.salesLabel && <span>{product.salesLabel}</span>}
    {/* A origem é anunciada por quem lê por áudio; visualmente o ícone sobre
        a foto e o texto do CTA já identificam a loja — texto fora da vista. */}
    <span className="sr-only">{evidenceLabel}</span>
  </p>;
}

/**
 * Ícone quadrado da loja, exibido sobre a foto do produto (canto superior
 * esquerdo). Reconhecimento pré-aprendido: o usuário identifica a loja no
 * olhar, antes de ler qualquer texto — mesmo princípio de favicon e ícone
 * de app.
 *
 * Se o arquivo não existir (404) ou não estiver no registro, o ícone some e
 * a loja continua identificada pelo texto do CTA. A checagem de `complete &&
 * naturalWidth === 0` no mount cobre o 404 que acontece antes da hidratação
 * (o `onError` chegaria tarde demais).
 */
function MarketplaceIcon({ logo, className }: { logo?: MarketplaceDef["logo"]; className: string }) {
  const [indisponivel, setIndisponivel] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setIndisponivel(true);
  }, []);

  if (!logo || indisponivel) return null;
  return (
    <span className={className} role="img" aria-label={logo.alt}>
      {/* alt vazio de propósito: quem anuncia é o aria-label do pai, senão o
          leitor de tela repete o nome da loja duas vezes. */}
      <img ref={imgRef} src={logo.src} alt="" onError={() => setIndisponivel(true)} />
    </span>
  );
}

function MarketplaceFilter({ className, active, counts, onChoose }: { className: string; active: string | null; counts: Record<string, number>; onChoose: (marketplace: string | null) => void }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return <div className={className}>
    <button className={active === null ? "mp-btn active" : "mp-btn"} onClick={() => onChoose(null)} aria-label="Todas as lojas">
      <small>{total > 0 ? total : ""}</small>
    </button>
    {MARKETPLACES.map((def) => <button key={def.slug} className={active === def.slug ? "mp-btn active" : "mp-btn"} onClick={() => onChoose(def.slug)} aria-label={def.label}>
      {def.logo && <img src={def.logo.src} alt="" />}
      {!def.logo && <span>{def.label.charAt(0)}</span>}
      <small>{counts[def.slug] ?? 0}</small>
    </button>)}
  </div>;
}

function SearchForm({ className, id, placeholder, query, disabled, onQuery, onSubmit }: { className: string; id: string; placeholder: string; query: string; disabled: boolean; onQuery: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className={className} action="/" method="get" onSubmit={onSubmit} role="search">
    <span aria-hidden="true">⌕</span>
    <label className="sr-only" htmlFor={id}>Buscar produtos</label>
    <input id={id} type="search" name="busca" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} />
    <button type="submit" disabled={disabled}>buscar</button>
  </form>;
}

function CategoryList({ className, categories, active, onChoose }: { className: string; categories: string[]; active: string | null; onChoose: (category: string | null) => void }) {
  return <div className={className}>
    <button className={active === null ? "active" : ""} onClick={() => onChoose(null)}>todas</button>
    {categories.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => onChoose(item)}>{item}</button>)}
  </div>;
}

export default function Vitrine({ homepageReady = false, homepageEngagement = null, homepageEditionId = null, editorialProducts = [], editorialHeroIds = [], editorialHeroValidUntil = null, editorialStateKey = null, editorialVersion = null, initialProducts, initialTotal, initialState, categories: initialCategories, dateLabel, initialSavedIds = [], initialSavedProducts = [], cacheScope = null, marketplaceCounts: initialMarketplaceCounts = {}, isUserAdmin = false }: { homepageReady?: boolean; homepageEngagement?: { token: string; viewId: string } | null; homepageEditionId?: string | null; editorialProducts?: EditorialProduct[]; editorialHeroIds?: string[]; editorialHeroValidUntil?: string | null; editorialStateKey?: string | null; editorialVersion?: number | null; initialProducts: VitrineProduct[]; initialTotal: number; initialState: CatalogState; categories: string[]; dateLabel: string; initialSavedIds?: string[]; initialSavedProducts?: VitrineProduct[]; cacheScope?: string | null; marketplaceCounts?: Record<string, number>; isUserAdmin?: boolean }) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [marketplaceCounts, setMarketplaceCounts] = useState(initialMarketplaceCounts);
  const [mobileProducts, setMobileProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [catalog, setCatalog] = useState(initialState);
  const [mobileLoadedPage, setMobileLoadedPage] = useState(initialState.page);
  const [query, setQuery] = useState(initialState.search);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<VitrineProduct[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [pendingSessionSaves, setPendingSessionSaves] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("home");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [heroCurrent, setHeroCurrent] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const requestVersion = useRef(0);
  const catalogRead = useRef<AbortController | null>(null);
  const firstMobilePage = useRef(initialState.page);
  const editorialById = new Map(editorialProducts.map((product) => [product.id, product]));
  const heroProducts = heroCurrent ? editorialHeroIds.slice(0, HERO_MAX_PRODUCTS).flatMap((id) => editorialById.has(id) ? [editorialById.get(id)!] : []) : [];
  const editorialContents = useMemo(() => new Map(editorialProducts.map((product) => [product.id, product.editorialPurchaseContents])), [editorialProducts]);
  const editorialRationales = useMemo(() => new Map(editorialProducts.map((product) => [product.id, product.editorialRationale])), [editorialProducts]);
  const savedProducts = useMemo(() => mergeSavedProducts(favorites, favoriteProducts, [...mobileProducts, ...products]), [favoriteProducts, favorites, mobileProducts, products]);
  const shownProducts = showSaved ? savedProducts : products;
  const isEdition = homepageReady && isHomepageSelectionQuery(catalogStateToDealQuery(catalog));
  useHomepageEngagement(homepageEditionId, homepageEngagement, editorialProducts.map(p => p.id), heroProducts.map(p => p.id), !isUserAdmin && isEdition && !showSaved && !isLoading && mobileView === "home" && !navOpen);
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (catalog.page - 1) * CATALOG_PAGE_SIZE + 1;
  const visibleTo = total === 0 ? 0 : visibleFrom + products.length - 1;
  const filteredCategories = categories.filter((item) => item.toLocaleLowerCase("pt-BR").includes(categoryQuery.trim().toLocaleLowerCase("pt-BR")));
  const discoveryCategories = categories.filter((item) => item !== catalog.category).slice(0, 3);
  const mobileHasMore = mobileLoadedPage < totalPages;

  useEffect(() => {
    // Account state remains usable even when browser storage is unavailable.
    try {
      const storage = window.sessionStorage;
      const saved = readSavedState(storage, cacheScope);
      setPendingSessionSaves(cacheScope ? readSavedState(storage).ids.length : 0);
      setFavorites(cacheScope ? initialSavedIds : saved.ids);
      setFavoriteProducts(cacheScope ? initialSavedProducts : saved.products);
    } catch {
      setPendingSessionSaves(0);
      setFavorites(cacheScope ? initialSavedIds : []);
      setFavoriteProducts(cacheScope ? initialSavedProducts : []);
      if (!cacheScope) setNotice("Não foi possível acessar os salvos desta sessão neste navegador.");
    }
    setFavoritesReady(true);
  }, [initialSavedIds, initialSavedProducts, cacheScope]);
  useEffect(() => {
    if (!favoritesReady) return;
    try { writeSavedState(window.sessionStorage, { ids: favorites, products: favoriteProducts }, cacheScope); } catch { /* Cache is optional when the server holds the state. */ }
  }, [favoriteProducts, favorites, favoritesReady, cacheScope]);
  useEffect(() => {
    if (!favoritesReady) return;
    const next = mergeSavedProducts(favorites, favoriteProducts, [...mobileProducts, ...products]);
    if (JSON.stringify(next) !== JSON.stringify(favoriteProducts)) setFavoriteProducts(next);
  }, [favoriteProducts, favorites, favoritesReady, mobileProducts, products]);
  useEffect(() => {
    if (mobileView === "home") return;
    document.querySelector<HTMLElement>(`#mobile-${mobileView}-title`)?.focus();
  }, [mobileView]);
  useEffect(() => {
    syncUrl(initialState, "replace");
    trackInteraction("catalog_impression");
    let cancelled = false;
    try {
      const snapshot = parseCatalogReturn(sessionStorage.getItem(CATALOG_RETURN_KEY));
      if (snapshot && snapshot.url === `${location.pathname}${location.search}`) {
        const restore = async () => {
          if (window.matchMedia("(max-width: 820px)").matches && snapshot.firstPage < snapshot.lastPage) {
            firstMobilePage.current = snapshot.firstPage;
            for (let page = snapshot.firstPage; page <= snapshot.lastPage && !cancelled; page++) {
              if (!await fetchDeals({ ...initialState, page }, false, page === snapshot.firstPage ? "replace" : "append")) return;
            }
          }
          if (!cancelled) requestAnimationFrame(() => requestAnimationFrame(() => {
            if (cancelled) return;
            try { sessionStorage.removeItem(CATALOG_RETURN_KEY); } catch {}
            window.scrollTo(0, snapshot.scrollY);
            const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="/bizu/"],a[href^="/oferta/"]');
            const link = Array.from(links).filter((item) => (item.getAttribute("href") === `/bizu/${snapshot.productSlug}` || item.getAttribute("href")?.startsWith(`/oferta/${snapshot.productSlug}/`)) && item.getClientRects().length > 0).sort((a, b) => Math.abs(a.getBoundingClientRect().top) - Math.abs(b.getBoundingClientRect().top))[0];
            link?.focus({ preventScroll: true });
          }));
        };
        void restore();
      }
    } catch { /* Navigation still works without session storage. */ }
    const handlePopState = () => {
      const next = catalogStateFromSearchParams(new URLSearchParams(window.location.search));
      setCatalog(next);
      firstMobilePage.current = next.page;
      setMobileLoadedPage(next.page);
      setQuery(next.search);
      setShowSaved(false);
      setMobileView("home");
      void fetchDeals(next, true, "replace");
    };
    window.addEventListener("popstate", handlePopState);
    return () => { cancelled = true; catalogRead.current?.abort(); ++requestVersion.current; window.removeEventListener("popstate", handlePopState); };
    // O estado inicial pertence à navegação que produziu este Server Component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editorialStateKey) return;
    const controller = new AbortController();
    let checking = false;
    const invalidate = () => { setHeroCurrent(false); };
    const verify = async () => {
      if (document.visibilityState === "hidden" || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/editorial-selection", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const state = await response.json() as { selectionStateKey: string };
        if (!controller.signal.aborted && state.selectionStateKey !== editorialStateKey) {
          invalidate();
          window.location.reload();
        }
      } catch { /* The local deadline still hides expired highlights. */ }
      finally { checking = false; }
    };
    const deadline = editorialHeroValidUntil ? Date.parse(editorialHeroValidUntil) : NaN;
    const expiry = Number.isFinite(deadline) ? window.setTimeout(() => { invalidate(); void verify(); }, Math.max(0, deadline - Date.now() + 50)) : null;
    const timer = window.setInterval(() => { void verify(); }, 300_000);
    const onVisible = () => { void verify(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      controller.abort();
      if (expiry !== null) window.clearTimeout(expiry);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [editorialHeroIds, editorialHeroValidUntil, editorialStateKey]);

  function syncUrl(next: CatalogState, mode: "push" | "replace") {
    const params = catalogStateToSearchParams(next);
    const url = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (mode === "push") window.history.pushState({}, "", url);
    else window.history.replaceState({}, "", url);
  }

  async function fetchDeals(next: CatalogState, scrollToCatalog: boolean, mode: "replace" | "append" = "replace"): Promise<boolean> {
    catalogRead.current?.abort();
    const controller = new AbortController();
    catalogRead.current = controller;
    const version = ++requestVersion.current;
    setIsLoading(true);
    setLoadError("");
    const dealQuery = catalogStateToDealQuery(next);
    const params = new URLSearchParams({ limit: String(dealQuery.limit), offset: String(dealQuery.offset), sort: dealQuery.sort, price: dealQuery.priceBand });
    if (dealQuery.category) params.set("category", dealQuery.category);
    if (dealQuery.search) params.set("q", dealQuery.search);
    if (dealQuery.marketplace) params.set("marketplace", dealQuery.marketplace);
    params.set("freshness", dealQuery.freshness);
    if (dealQuery.minRating !== null) params.set("minRating", String(dealQuery.minRating));
    if (dealQuery.minDiscount !== null) params.set("minDiscount", String(dealQuery.minDiscount));
    if (dealQuery.lowestOnly) params.set("lowestOnly", "true");
    if (dealQuery.hasHistory) params.set("hasHistory", "true");
    try {
      const response = await fetch(`/api/deals?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error("catalog_failed");
      const page = await response.json() as ApiPage;
      if (controller.signal.aborted || version !== requestVersion.current) return false;
      if ((page.selectionStateKey !== undefined && editorialStateKey !== null && page.selectionStateKey !== editorialStateKey)
        || (page.selectionVersion !== undefined && page.selectionVersion !== editorialVersion)) {
        // A nova navegação deve usar a mesma edição no catálogo e no carrossel.
        // A URL já representa os filtros solicitados; a home lê uma única seleção.
        syncUrl(next, "replace");
        window.location.reload();
        return false;
      }
      setProducts(page.products);
      setCategories(page.categories);
      setMarketplaceCounts(page.marketplaceCounts);
      setMobileProducts((current) => mode === "append" ? [...new Map([...current, ...page.products].map((product) => [product.id, product])).values()] : page.products);
      setMobileLoadedPage(next.page);
      setTotal(page.total);
      if (scrollToCatalog) document.querySelector("#achados")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    } catch {
      if (!controller.signal.aborted && version === requestVersion.current) setLoadError("Não foi possível atualizar as ofertas agora. Tente de novo.");
      return false;
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setIsLoading(false);
    }
  }

  function changeCatalog(next: CatalogState, mode: "push" | "replace", scrollToCatalog: boolean) {
    firstMobilePage.current = next.page;
    setCatalog(next); setMobileLoadedPage(next.page); setShowSaved(false); syncUrl(next, mode); void fetchDeals(next, scrollToCatalog, "replace");
  }
  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 4200); }
  async function toggleFavorite(product: VitrineProduct) {
    const saved = favorites.includes(product.id);
    if (cacheScope) {
      try {
        await requestFavorite(product.id, !saved);
      } catch { showNotice("Não foi possível atualizar seus salvos. Tente de novo."); return; }
    }
    if (!cacheScope) {
      try {
        const ids = saved ? favorites.filter((id) => id !== product.id) : [...favorites, product.id];
        writeSavedState(window.sessionStorage, { ids, products: mergeSavedProducts(ids, favoriteProducts, saved ? [] : [product]) });
      } catch { showNotice("Não foi possível guardar neste navegador."); return; }
    }
    trackInteraction(saved ? "favorite_remove" : "favorite_add", product.id);
    showNotice(saved ? "Removido dos seus salvos." : cacheScope ? "Salvo na sua conta." : "Salvo neste navegador.");
    setFavorites((current) => saved ? current.filter((item) => item !== product.id) : [...current, product.id]);
    setFavoriteProducts((current) => saved ? current.filter((item) => item.id !== product.id) : mergeSavedProducts([...favorites, product.id], current, [product]));
  }
  function toggleSavedView() {
    if (!showSaved && !favorites.length) { showNotice("Toque no coração de um produto para guardá-lo aqui."); return; }
    setShowSaved((current) => !current);
    document.querySelector("#achados")?.scrollIntoView({ behavior: "smooth" });
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const search = String(new FormData(event.currentTarget).get("busca") ?? "").trim(); setQuery(search); trackInteraction("search"); setMobileView("home"); changeCatalog({ ...catalog, page: 1, search }, "replace", true); }
  function clearFilters() { const next: CatalogState = { page: 1, category: null, priceBand: "all", sort: "signal", search: "", marketplace: null, freshness: "2d", minRating: null, minDiscount: null, lowestOnly: false, hasHistory: false }; setQuery(""); setMobileView("home"); changeCatalog(next, "replace", false); }
  function changePage(page: number) {
    if (page < 1 || page > totalPages || page === catalog.page || isLoading) return;
    trackInteraction("page_change"); changeCatalog({ ...catalog, page }, "push", true);
  }
  async function loadMore() {
    if (!mobileHasMore || isLoading) return;
    const next = { ...catalog, page: mobileLoadedPage + 1 };
    const loaded = await fetchDeals(next, false, "append");
    if (!loaded) return;
    setCatalog(next); syncUrl(next, "replace"); trackInteraction("mobile_load_more");
  }
  function chooseCategory(category: string | null) {
    trackInteraction("category_filter"); setMobileView("home"); changeCatalog({ ...catalog, page: 1, category }, "replace", true);
  }
  function chooseMarketplace(marketplace: string | null) {
    trackInteraction("marketplace_filter"); setMobileView("home"); changeCatalog({ ...catalog, page: 1, marketplace }, "replace", true);
  }
  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector<HTMLInputElement>("input[type='email']");
    const email = input?.value.trim() ?? "";
    if (!email) return;
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json() as { ok: boolean; already?: boolean };
      if (!data.ok) throw new Error();
      showNotice(data.already ? "Seu interesse já estava registrado." : "Seu interesse foi registrado. Ainda não há envio de ofertas por e-mail."); form.reset();
    } catch { showNotice("Não deu para salvar agora. Tente de novo em instantes."); }
  }
  return <main className="vitrine-page" onClickCapture={(event) => {
    const target = event.target as Element;
    const link = target.closest<HTMLAnchorElement>('a[href^="/bizu/"],a[href^="/oferta/"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const slug = link.getAttribute("href")?.split("/")[2];
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return;
    try { sessionStorage.setItem(CATALOG_RETURN_KEY, JSON.stringify({ url: `${location.pathname}${location.search}`, firstPage: firstMobilePage.current, lastPage: mobileLoadedPage, scrollY: window.scrollY, productSlug: slug, savedAt: Date.now() })); } catch { /* The detail keeps a safe fallback. */ }
  }}>
    <div className="signal-bar"><span>Bizu bom não espera.</span><span>Curadoria de ponta a ponta · links de afiliado</span></div>
    <header className="site-header">
      <a className="brand" href="#topo" aria-label="BizuMiner, início">
        <Image src="/brand/bizuminer-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} priority className="brand-mark-img" />
        <span className="brand-name"><b>Bizu</b><i>Miner</i></span>
      </a>
      <a className="catalog-jump" href="#explorar">Buscar achados ↗</a>
      <button className="nav-toggle" aria-expanded={navOpen} aria-controls="main-nav" onClick={() => setNavOpen((value) => !value)}>menu</button>
      <nav id="main-nav" className={navOpen ? "open" : ""} aria-label="Navegação principal"><a href="#achados" onClick={() => setNavOpen(false)}>Ofertas</a><a href="#criterios" onClick={() => setNavOpen(false)}>Como escolhemos</a><a href="#vendedores" onClick={() => setNavOpen(false)}>Para vendedores</a><Link href="/minha-area" prefetch={false} onClick={() => setNavOpen(false)}>Minha área</Link>{isUserAdmin && <Link href="/admin" prefetch={false} onClick={() => setNavOpen(false)} style={{ color: "var(--blue-text, #1d4ed8)", fontWeight: 800 }}>⚡ Painel Admin</Link>}</nav>
      <div className="header-actions">
        {isUserAdmin && (
          <Link
            href="/admin"
            prefetch={false}
            className="admin-badge-link"
            title="Acessar Painel do Administrador"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "5px 10px",
              borderRadius: "6px",
              background: "var(--blue-soft, #eff6ff)",
              border: "1px solid var(--blue-line, #bfdbfe)",
              color: "var(--blue-text, #1d4ed8)",
              fontSize: "0.8rem",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            ⚡ Admin
          </Link>
        )}
        <ThemeToggle />
        <button className={showSaved ? "saved-button active" : "saved-button"} aria-pressed={showSaved} aria-label={`${favorites.length} produtos salvos, ver salvos`} onClick={toggleSavedView}><span>{showSaved ? "♥" : "♡"}</span><b>{favorites.length}</b></button>
      </div>
    </header>

    {cacheScope && pendingSessionSaves > 0 && <p className="pending-session-saves" role="status">Você tem {pendingSessionSaves} {pendingSessionSaves === 1 ? "salvo desta sessão" : "salvos desta sessão"}. <Link href="/minha-area" prefetch={false}>Escolher sincronizar com sua conta →</Link></p>}
    <HomeBanner
      product={isEdition && !showSaved ? selectCoverProduct(heroProducts) : null}
      selectionVersion={editorialVersion}
      onProductClick={(id) => trackInteraction("hero_detail_click", id)}
    />

    <section className="filter-stack" id="explorar" aria-label="Buscar e filtrar ofertas">
      <div className="filter-nav-row">
        <SearchForm className="search-box catalog-search" id="busca" placeholder="Qual vai ser seu próximo achado?" query={query} disabled={isLoading} onQuery={setQuery} onSubmit={submitSearch} />
        <CategoryList className="category-list" categories={categories} active={catalog.category} onChoose={chooseCategory} />
        <MarketplaceFilter className="mp-filter" active={catalog.marketplace} counts={marketplaceCounts} onChoose={chooseMarketplace} />
      </div>
      <div className="filter-control-row">
        <div className="filter-primary">
          <label className="freshness-control">preço verificado <select value={catalog.freshness} onChange={(event) => { trackInteraction("freshness_filter"); changeCatalog({ ...catalog, page: 1, freshness: event.target.value as FreshnessBand }, "replace", false); }}>{freshnessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <div className="price-filters" aria-label="Faixa de preço">{priceFilters.map((item) => <button key={item.value} className={catalog.priceBand === item.value ? "active" : ""} onClick={() => { trackInteraction("price_filter"); changeCatalog({ ...catalog, page: 1, priceBand: item.value }, "replace", false); }}>{item.label}</button>)}</div>
          <label className="sort-control">ordenar por <select value={catalog.sort} onChange={(event) => { trackInteraction("sort"); changeCatalog({ ...catalog, page: 1, sort: event.target.value as DealSort }, "replace", false); }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="filter-active-pills">
          {catalog.minRating !== null && <button className="pill" onClick={() => { trackInteraction("filter_remove"); changeCatalog({ ...catalog, page: 1, minRating: null }, "replace", false); }}>★★{catalog.minRating}+ ✕</button>}
          {catalog.minDiscount !== null && <button className="pill" onClick={() => { trackInteraction("filter_remove"); changeCatalog({ ...catalog, page: 1, minDiscount: null }, "replace", false); }}>{catalog.minDiscount}%+ ✕</button>}
          {catalog.lowestOnly && <button className="pill" onClick={() => { trackInteraction("filter_remove"); changeCatalog({ ...catalog, page: 1, lowestOnly: false }, "replace", false); }}>menor preço ✓ ✕</button>}
          {catalog.hasHistory && <button className="pill" onClick={() => { trackInteraction("filter_remove"); changeCatalog({ ...catalog, page: 1, hasHistory: false }, "replace", false); }}>com histórico ✕</button>}
          {(catalog.minRating !== null || catalog.minDiscount !== null || catalog.lowestOnly || catalog.hasHistory) && <button className="pill pill-clear" onClick={() => { trackInteraction("filter_clear_secondary"); changeCatalog({ ...catalog, page: 1, minRating: null, minDiscount: null, lowestOnly: false, hasHistory: false }, "replace", false); }}>limpar</button>}
        </div>
        <button className="filter-expand" aria-label="Mais filtros" onClick={() => setMobileView(mobileView === "filters" ? "home" : "filters")}>+ filtros</button>
      </div>
    </section>

    <section className="finds" id="achados" aria-busy={isLoading}>
      <div className="section-heading"><div><p className="eyebrow">{showSaved ? cacheScope ? "Seus salvos · sua conta" : "Seus salvos · neste navegador" : `Ofertas monitoradas · ${dateLabel}`}</p><h2>{showSaved ? "Seus salvos" : isEdition ? "Seleção de ofertas" : "Catálogo de ofertas"}</h2><p className="mobile-result-count">{isLoading ? "atualizando…" : `${total} ofertas monitoradas · ${dateLabel}`}</p></div><button className="section-help" type="button" aria-label="Como ler os preços e o desconto" onClick={() => setMobileView("guide")}>?</button><p className="result-count">{isLoading ? "atualizando…" : showSaved ? `${savedProducts.length} salvos` : `Mostrando ${visibleFrom}–${visibleTo} de ${total} ofertas`}</p></div>
      {!showSaved && isEdition && <p className="selection-discovery"><Link href="/?ordem=recent#achados" prefetch={false}>Explorar catálogo completo →</Link></p>}
      {loadError && <p className="catalog-error" role="alert">{loadError} <button onClick={() => void fetchDeals(catalog, false)}>tentar de novo</button></p>}
      <div className="desktop-catalog">{shownProducts.length ? <><div className="product-grid">{shownProducts.map((product) => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} onFavorite={toggleFavorite} editorialRationale={product.benefit || editorialRationales.get(product.id)} editorialPurchaseContents={product.purchaseContents || editorialContents.get(product.id)} />)}</div>{!showSaved && totalPages > 1 && <CatalogPagination current={catalog.page} total={totalPages} disabled={isLoading} onChange={changePage} />}</> : !isLoading && <EmptyState onClear={clearFilters} saved={showSaved} />}</div>
      <div className="mobile-catalog"><div className="mobile-catalog-toolbar"><CategoryList className="category-list toolbar-chips" categories={categories} active={catalog.category} onChoose={chooseCategory} /><button className="toolbar-filters" aria-label={`Filtros${(catalog.priceBand !== "all" || catalog.sort !== "signal" || catalog.minRating !== null || catalog.minDiscount !== null || catalog.lowestOnly || catalog.hasHistory || catalog.freshness !== "2d") ? " (ativos)" : ""}`} onClick={() => setMobileView("filters")}><span aria-hidden="true">⚙</span>{(catalog.priceBand !== "all" || catalog.sort !== "signal" || catalog.minRating !== null || catalog.minDiscount !== null || catalog.lowestOnly || catalog.hasHistory || catalog.freshness !== "2d") && <em aria-hidden="true" />}</button></div>{mobileProducts.length ? <div className="mobile-product-grid">{mobileProducts.map((product, index) => <Fragment key={product.id}><ProductCard product={product} favorite={favorites.includes(product.id)} onFavorite={toggleFavorite} editorialRationale={product.benefit || editorialRationales.get(product.id)} editorialPurchaseContents={product.purchaseContents || editorialContents.get(product.id)} />{index === 5 && discoveryCategories.length > 0 && <DiscoveryBreak categories={discoveryCategories} onChoose={chooseCategory} />}</Fragment>)}</div> : !isLoading && <EmptyState onClear={clearFilters} />}{mobileHasMore && <button className="mobile-load-more" type="button" disabled={isLoading} onClick={() => void loadMore()}>{isLoading ? "carregando…" : "carregar mais 24"}<span>{mobileProducts.length} de {total} ofertas</span></button>}</div>
    </section>

    <section className="price-radar" aria-label="Como avaliamos os preços"><div><p className="eyebrow">Histórico BizuMiner</p><h2>Desconto chama atenção.<br /><em>Histórico</em> ajuda a decidir.</h2></div><div className="radar-note"><span className="radar-orbit"><i>R$</i></span><p>Registramos o preço em cada captura. Enquanto o acompanhamento ainda é curto, mostramos exatamente quantos registros existem — sem transformar pouca informação em certeza.</p></div></section>
    <section className="criteria" id="criterios"><div className="criteria-intro"><p className="eyebrow">Da busca à recomendação</p><h2>Todo bizu passa por camadas.</h2><p>O BizuMiner combina automação com critérios claros. Antes de uma oferta chegar até você, organizamos produto, preço e evidências do anúncio.</p></div><ol className="criteria-list"><li><span>01</span><div><h3>Encontrar produtos úteis</h3><p>Selecionamos itens com função clara e potencial de melhorar a rotina.</p></div></li><li><span>02</span><div><h3>Conferir preço e histórico</h3><p>Comparamos o preço atual com os registros que já coletamos, sem prometer o que os dados ainda não provam.</p></div></li><li><span>03</span><div><h3>Apresentar com contexto</h3><p>Preço, avaliação, vendas informadas e link de afiliado aparecem com a fonte identificada.</p></div></li></ol></section>
    <section className="seller-callout" id="vendedores"><div className="seller-stamp">TEM UM<br />BIZU?</div><div><p className="eyebrow">Quer apresentar seu produto?</p><h2>Entre no nosso processo de seleção.</h2></div><div className="seller-copy"><p>Automatizar ofertas é fácil. Conquistar público qualificado é BizuMiner. Marcas e vendedores podem sugerir produtos; a curadoria continua independente.</p><a href="mailto:oi@bizuminer.com.br?subject=Quero%20mandar%20um%20bizu">enviar um produto <span>↗</span></a></div></section>
    <section className="newsletter"><div><span className="newsletter-icon"><Image src="/brand/bizuminer-icon-square-blue.svg" alt="" width={44} height={44} className="rounded-xl" /></span></div><div><p className="eyebrow">Novidades BizuMiner</p><h2>Registre seu interesse.</h2><p className="newsletter-note">Ainda não enviamos ofertas por e-mail. Seu cadastro registra seu interesse em novidades.</p></div><form onSubmit={submitEmail}><label className="sr-only" htmlFor="email">Seu melhor e-mail</label><input id="email" type="email" required placeholder="seu melhor e-mail" /><button type="submit">registrar interesse <span>→</span></button></form></section>
    <footer><a className="brand footer-brand" href="#topo" aria-label="BizuMiner, início"><Image src="/brand/bizuminer-icon-dark.svg" alt="" aria-hidden="true" width={30} height={30} className="brand-mark-img" /><span className="brand-name"><b>Bizu</b><i>Miner</i></span></a><p>A gente acompanha preços para trazer ofertas que valem a sua atenção.</p><div><a href="#criterios">transparência</a><a href="#vendedores">vendedores</a><a href="mailto:oi@bizuminer.com.br">contato</a></div><small>Alguns links são de afiliado. Podemos receber comissão sem custo adicional para você.</small></footer>

    {mobileView === "categories" && <MobilePanel view="categories" title="Categorias" onClose={() => setMobileView("home")}><p className="mobile-panel-intro">Explore por interesse e volte ao feed quando quiser.</p><label className="mobile-panel-search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar categoria</span><input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Buscar uma categoria" /></label><div className="mobile-category-cards"><button onClick={() => chooseCategory(null)}><b>Todas as ofertas</b><span>Ver o catálogo completo</span><i>→</i></button>{filteredCategories.map((item) => <button key={item} onClick={() => chooseCategory(item)}><b>{item}</b><span>Ver ofertas monitoradas</span><i>→</i></button>)}</div></MobilePanel>}
    {mobileView === "saved" && <MobilePanel view="saved" title="Seus salvos" meta={`${favorites.length}`} onClose={() => setMobileView("home")}><p className="mobile-panel-intro">{cacheScope ? <>Seus salvos ficam na conta. Na <Link href="/minha-area" prefetch={false}>minha área</Link> você pode acompanhar preços.</> : <>Seus salvos ficam nesta sessão. Entre na <Link href="/minha-area" prefetch={false}>minha área</Link> para sincronizá-los.</>}</p>{savedProducts.length ? <div className="mobile-product-grid mobile-saved-grid">{savedProducts.map((product) => <ProductCard key={product.id} product={product} favorite onFavorite={toggleFavorite} editorialRationale={product.benefit || editorialRationales.get(product.id)} editorialPurchaseContents={product.purchaseContents || editorialContents.get(product.id)} />)}</div> : <EmptyState onClear={() => setMobileView("home")} saved />}</MobilePanel>}
    {mobileView === "filters" && <MobilePanel view="filters" title="Filtros refinados" onClose={() => setMobileView("home")}><div className="mobile-filter-group"><h3>Faixa de preço</h3><div>{priceFilters.map((item) => <button key={item.value} className={catalog.priceBand === item.value ? "active" : ""} onClick={() => { trackInteraction("price_filter"); changeCatalog({ ...catalog, page: 1, priceBand: item.value }, "replace", false); }}>{item.label}</button>)}</div></div><div className="mobile-filter-group"><h3>Frescura do preço</h3><div>{freshnessOptions.map((item) => <button key={item.value} className={catalog.freshness === item.value ? "active" : ""} onClick={() => { trackInteraction("freshness_filter"); changeCatalog({ ...catalog, page: 1, freshness: item.value }, "replace", false); }}>{item.label}</button>)}</div></div><div className="mobile-filter-group"><h3>Avaliação mínima</h3><div>{ratingOptions.map((item) => <button key={item.value} className={catalog.minRating === item.value ? "active" : ""} onClick={() => { trackInteraction("rating_filter"); changeCatalog({ ...catalog, page: 1, minRating: catalog.minRating === item.value ? null : item.value }, "replace", false); }}>{item.label}</button>)}</div></div><div className="mobile-filter-group"><h3>Desconto informado</h3><div>{discountOptions.map((item) => <button key={item.value} className={catalog.minDiscount === item.value ? "active" : ""} onClick={() => { trackInteraction("discount_filter"); changeCatalog({ ...catalog, page: 1, minDiscount: catalog.minDiscount === item.value ? null : item.value }, "replace", false); }}>{item.label}</button>)}</div></div><div className="mobile-filter-group"><h3>Confiança BizuMiner</h3><div className="mobile-toggles"><button className={catalog.lowestOnly ? "active" : ""} onClick={() => { trackInteraction("confidence_filter"); changeCatalog({ ...catalog, page: 1, lowestOnly: !catalog.lowestOnly }, "replace", false); }}>menor preço verificado</button><button className={catalog.hasHistory ? "active" : ""} onClick={() => { trackInteraction("confidence_filter"); changeCatalog({ ...catalog, page: 1, hasHistory: !catalog.hasHistory }, "replace", false); }}>com histórico (3+ obs.)</button></div></div><label className="mobile-sort-control"><span>Ordenar por</span><select value={catalog.sort} onChange={(event) => { trackInteraction("sort"); changeCatalog({ ...catalog, page: 1, sort: event.target.value as DealSort }, "replace", false); }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="mobile-clear-filters" onClick={clearFilters}>limpar filtros</button></MobilePanel>}
    {mobileView === "guide" && <MobilePanel view="guide" title="Como ler os preços" onClose={() => setMobileView("home")}><p className="mobile-panel-intro">{catalogGuide}</p><ul className="guide-legend"><li><span className="signal-badge verified">menor preço que já vimos</span><p>O preço atual é o menor observado para a mesma configuração confirmada, com pelo menos 3 registros distribuídos em 7 dias. Sem identificar a configuração, mostramos apenas o histórico do anúncio.</p></li><li><span className="signal-badge drop">caiu 12% desde o menor que vimos</span><p>O preço caiu abaixo do menor valor registrado para a mesma configuração confirmada. A comparação usa nosso histórico e não afirma que está barato no mercado.</p></li><li><span className="signal-badge unproven">ainda sem histórico</span><p>Vimos este produto uma vez só. Não há com o que comparar, então trate o desconto do anúncio com cautela extra.</p></li><li><span className="guide-discount">−38% no anúncio</span><p>Desconto informado pelo próprio anúncio no Mercado Livre — é alegação do vendedor, não cálculo nosso.</p></li><li><span className="guide-silence">sem selo</span><p>O preço não se moveu em relação ao que já tínhamos registrado. Silêncio aqui quer dizer que não há novidade — e é por isso que, quando um selo aparece, ele merece atenção.</p></li></ul></MobilePanel>}
    {mobileView === "menu" && <MobilePanel view="menu" title="Menu" onClose={() => setMobileView("home")}><div className="mobile-theme-row"><div><b>Aparência</b><span>Claro ou escuro, do seu jeito</span></div><ThemeToggle className="theme-toggle-wide" withLabel /></div><nav className="mobile-menu-links" aria-label="Menu mobile"><Link href="/minha-area" prefetch={false}><span>Minha área</span><b>→</b></Link>{isUserAdmin && <Link href="/admin" prefetch={false}><span>⚡ Painel Admin</span><b>→</b></Link>}<a href="#achados" onClick={() => setMobileView("home")}><span>Ofertas</span><b>→</b></a><a href="#criterios" onClick={() => setMobileView("home")}><span>Como escolhemos</span><b>→</b></a><a href="#vendedores" onClick={() => setMobileView("home")}><span>Para vendedores</span><b>→</b></a><a href="mailto:oi@bizuminer.com.br"><span>Contato</span><b>↗</b></a></nav></MobilePanel>}

    <nav className="mobile-bottom-nav" aria-label="Navegação mobile"><button className={mobileView === "home" ? "active" : ""} aria-current={mobileView === "home" ? "page" : undefined} onClick={() => { setMobileView("home"); document.querySelector("#topo")?.scrollIntoView({ behavior: "smooth" }); }}><span aria-hidden="true">⌂</span><b>Início</b></button><button className={mobileView === "categories" ? "active" : ""} aria-current={mobileView === "categories" ? "page" : undefined} onClick={() => setMobileView("categories")}><span aria-hidden="true">▦</span><b>Categorias</b></button><button className={mobileView === "saved" ? "active" : ""} aria-current={mobileView === "saved" ? "page" : undefined} onClick={() => setMobileView("saved")}><span aria-hidden="true">♡</span><b>Salvos</b>{favorites.length > 0 && <i>{favorites.length}</i>}</button><button className={mobileView === "menu" ? "active" : ""} aria-current={mobileView === "menu" ? "page" : undefined} onClick={() => setMobileView("menu")}><span aria-hidden="true">☰</span><b>Menu</b></button></nav>
    <div className={notice ? "toast visible" : "toast"} role="status" aria-live="polite">{notice}</div>
  </main>;
}

function MobilePanel({ view, title, meta, onClose, children }: { view: Exclude<MobileView, "home">; title: string; meta?: string; onClose: () => void; children: React.ReactNode }) {
  return <section className="mobile-view-panel" aria-labelledby={`mobile-${view}-title`}><header><button onClick={onClose} aria-label={`Fechar ${title}`}>←</button><h2 id={`mobile-${view}-title`} tabIndex={-1}>{title}</h2>{meta ? <span>{meta}</span> : <i />}</header><div className="mobile-panel-content">{children}</div></section>;
}

function DiscoveryBreak({ categories, onChoose }: { categories: string[]; onChoose: (category: string) => void }) {
  return <aside className="discovery-break"><p>Quer mudar o rumo?</p><div>{categories.map((category) => <button key={category} onClick={() => onChoose(category)}>{category} <span>→</span></button>)}</div></aside>;
}

function EmptyState({ onClear, saved = false }: { onClear: () => void; saved?: boolean }) {
  return <div className="empty-state"><span>{saved ? "♡" : "◇"}</span><h3>{saved ? "Nenhum produto salvo." : "Nenhum produto encontrado."}</h3><p>{saved ? "Toque no coração de um produto para guardá-lo aqui." : "Tente outro termo ou limpe os filtros."}</p><button onClick={onClear}>{saved ? "ver ofertas" : "limpar filtros"}</button></div>;
}

function CatalogPagination({ current, total, disabled, onChange }: { current: number; total: number; disabled: boolean; onChange: (page: number) => void }) {
  const items = paginationItems(current, total);
  return <nav className="catalog-pagination" aria-label="Paginação das ofertas"><button className="pagination-direction" type="button" disabled={disabled || current === 1} onClick={() => onChange(current - 1)}><span aria-hidden="true">←</span><b>anterior</b></button><div className="pagination-numbers">{items.map((item) => typeof item === "number" ? <button key={item} type="button" className={item === current ? "active" : ""} aria-current={item === current ? "page" : undefined} aria-label={`Ir para a página ${item}`} disabled={disabled} onClick={() => onChange(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div><span className="pagination-mobile-status" aria-live="polite">Página {current} de {total}</span><button className="pagination-direction next" type="button" disabled={disabled || current === total} onClick={() => onChange(current + 1)}><b>próxima</b><span aria-hidden="true">→</span></button></nav>;
}

function ProductCard({ product, favorite, onFavorite, editorialRationale, editorialPurchaseContents, featured = false }: { product: VitrineProduct; favorite: boolean; onFavorite: (product: VitrineProduct) => void; editorialRationale?: string; editorialPurchaseContents?: string; featured?: boolean }) {
  const fresh = priceFreshness(product.evidenceObservedAt);
  const highlight = fresh === "current" ? priceHighlight(historyInput(product)) : null;
  const discountPct = fresh === "current" ? discountPercentOf(product) : null;
  const freshness = fresh === "current" ? freshnessLabel(product.evidenceObservedAt) : null;
  const seen = fresh === "stale" ? seenAgo(product.evidenceObservedAt) : null;
  const marketplaceDefinition = marketplaceDef(product.marketplace);
  const marketplaceLabel = marketplaceDefinition?.label ?? product.marketplace;
  const ctaLabel = marketplaceDefinition?.ctaLabel ?? `ver na ${marketplaceLabel}`;
  const marketplaceLogo = marketplaceDefinition?.logo;
  return <article className={`product-card${featured ? " mobile-featured-card" : ""}`} data-home-product={product.id} data-home-surface="grid"><div className="product-image"><Link href={optionDetailPath(product.slug,product.offerOptionKey)} prefetch={false} aria-label={`Abrir detalhes de ${(product.displayTitle || product.title)}`}>{product.imageUrl ? <Image src={product.imageUrl} alt={(product.displayTitle || product.title)} fill sizes={featured ? "(max-width: 820px) calc(100vw - 32px), 25vw" : "(max-width: 560px) calc((100vw - 44px) / 2), (max-width: 1100px) 33vw, 25vw"} /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={32} height={32} /></div>}<MarketplaceIcon logo={marketplaceLogo} className="origin-icon" /></Link>{discountPct !== null && <span className="discount"><b>−{discountPct}%</b><i> no anúncio</i></span>}<button className={favorite ? "favorite active" : "favorite"} aria-label={`${favorite ? "Remover" : "Salvar"} ${(product.displayTitle || product.title)}`} aria-pressed={favorite} onClick={() => onFavorite(product)}>{favorite ? "♥" : "♡"}</button></div><div className={highlight ? "product-meta" : "product-meta quiet"}>{highlight && <span className={`signal-badge ${highlight.tone}`}>{highlight.label}</span>}</div><h3><Link href={optionDetailPath(product.slug,product.offerOptionKey)} prefetch={false}>{(product.displayTitle || product.title)}</Link></h3><MarketplaceEvidence product={product} />{editorialRationale && <p className="product-editorial-rationale">{editorialRationale}</p>}{editorialPurchaseContents && <p className="product-editorial-contents"><b>O que vem:</b> {editorialPurchaseContents}</p>}<p className="product-blurb"><b>Histórico do preço:</b> {priceNarrative(historyInput(product), brl)}</p><div className="product-price"><div>{fresh === "current" ? <><small>{product.originalPriceKind === "source_claimed" && product.originalPriceCents && product.originalPriceCents > product.priceCents ? brl(product.originalPriceCents) : ""}</small><strong>{offerPriceLabel(product)}</strong>{offerPriceNote(product) && <em>{offerPriceNote(product)}</em>}{freshness && <em>{freshness}</em>}</> : <span className="stale-price"><strong>{offerPriceLabel(product)}</strong>{offerPriceNote(product) && <em>{offerPriceNote(product)}</em>}<em>última vez visto {seen ?? "há algum tempo"}</em></span>}</div><a href={product.offerOptionKey ? optionDetailPath(product.slug,product.offerOptionKey):`/go/${product.slug}`} target="_blank" rel="noreferrer sponsored" onClick={() => trackInteraction("outbound_click", product.id)}><MarketplaceIcon logo={marketplaceLogo} className="cta-icon" /><span>{ctaLabel}</span><b>↗</b></a></div><CopyProductLink optionKey={product.offerOptionKey} slug={product.slug} title={(product.displayTitle || product.title)} /></article>;
}
