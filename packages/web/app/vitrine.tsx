"use client";

import { FormEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_PAGE_SIZE, catalogStateFromSearchParams, catalogStateToDealQuery, catalogStateToSearchParams } from "../lib/deal-query";
import type { CatalogState, DealSort, PriceBand } from "../lib/deal-query";
import { freshnessLabel, priceNarrative, priceSignal } from "../lib/deal-signal";
import type { VitrineProduct } from "../lib/deal-view";

type ApiPage = { products: VitrineProduct[]; total: number };
const priceFilters: Array<{ value: PriceBand; label: string }> = [{ value: "all", label: "todos" }, { value: "under_100", label: "até R$100" }, { value: "100_500", label: "R$100–500" }, { value: "over_500", label: "acima R$500" }];
const sortOptions: Array<{ value: DealSort; label: string }> = [{ value: "signal", label: "melhores oportunidades" }, { value: "price", label: "menor preço" }, { value: "popularity", label: "mais populares" }, { value: "recent", label: "atualizados agora" }];
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
const historyInput = (product: VitrineProduct) => ({ priceCents: product.priceCents, previousMinPriceCents: product.previousMinPriceCents, observationCount: product.observationCount, historyDays: product.historyDays, lowestVerified: product.lowestVerified });
const discountLabel = (product: VitrineProduct) => product.discountPercent && product.discountPercent > 0 ? `−${product.discountPercent}% no anúncio` : product.originalPriceCents && product.originalPriceCents > product.priceCents ? `−${Math.round((1 - product.priceCents / product.originalPriceCents) * 100)}% no anúncio` : null;
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
  return <p className="product-evidence">
    {product.ratingStar !== null && <span>★ {product.ratingStar.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5</span>}
    {product.ratingStar !== null && product.salesLabel && <i>·</i>}
    {product.salesLabel && <span>{product.salesLabel}</span>}
    <small>dados do Mercado Livre</small>
  </p>;
}

function EditorialSlide({ products, hidden }: { products: VitrineProduct[]; hidden: boolean }) {
  const primary = products[0];
  const secondary = products[1];
  return <article className="hero-slide hero-editorial-slide" aria-hidden={hidden}>
    <div className="hero-editorial-copy">
      <p className="hero-kicker">Curadoria de ponta a ponta</p>
      <h2>Menos tempo procurando.<br /><em>Mais clareza</em> para decidir.</h2>
      <p>O BizuMiner reúne ofertas, acompanha preços e organiza as evidências que ajudam você a comparar sem abrir dezenas de abas.</p>
      <a href="#achados" tabIndex={hidden ? -1 : undefined}>ver ofertas selecionadas <b>↓</b></a>
    </div>
    <div className="hero-editorial-board" aria-hidden="true">
      <span className="hero-edition">EDIÇÃO<br /><b>01</b></span>
      <div className="hero-grid-lines" />
      {primary?.imageUrl && <div className="hero-cutout hero-cutout-primary"><img src={primary.imageUrl} alt="" /></div>}
      {secondary?.imageUrl && <div className="hero-cutout hero-cutout-secondary"><img src={secondary.imageUrl} alt="" /></div>}
      <div className="hero-note"><small>COMO ESCOLHEMOS</small><b>preço atual</b><b>histórico disponível</b><b>avaliação e vendas</b></div>
      <span className="hero-tape" />
    </div>
  </article>;
}

function ProductHeroSlide({ product, index, hidden, onImageClick }: { product: VitrineProduct; index: number; hidden: boolean; onImageClick: (event: MouseEvent<HTMLAnchorElement>, productId: string) => void }) {
  const status = priceSignal(historyInput(product));
  return <article className={`hero-slide hero-product-slide hero-product-${index + 1}`} aria-hidden={hidden}>
    <div className="hero-product-copy">
      <p>Destaque {String(index + 2).padStart(2, "0")} · seleção BizuMiner</p>
      <span className={`hero-history-label ${status.tone}`}>{status.label}</span>
      <h2>{product.title}</h2>
      <p className="hero-product-reason">{priceNarrative(historyInput(product), brl)}</p>
      <div className="hero-product-facts">
        <span><small>preço atual</small><strong>{brl(product.priceCents)}</strong></span>
        {product.ratingStar !== null && <span><small>avaliação no ML</small><strong>★ {product.ratingStar.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong></span>}
        {product.salesLabel && <span><small>vendas informadas</small><strong>{product.salesLabel}</strong></span>}
      </div>
      <a href={`/bizu/${product.slug}`} tabIndex={hidden ? -1 : undefined} onClick={() => trackInteraction("hero_detail_click", product.id)}>ver detalhes <b>↗</b></a>
    </div>
    <a className="hero-product-image" href={`/bizu/${product.slug}`} tabIndex={hidden ? -1 : undefined} aria-label={`Ver detalhes de ${product.title}`} onClick={(event) => onImageClick(event, product.id)}>
      <span className="hero-product-number">0{index + 2}</span>
      <img src={product.imageUrl!} alt={product.title} />
      {discountLabel(product) && <span className="hero-discount">{discountLabel(product)}</span>}
    </a>
  </article>;
}

export default function Vitrine({ initialProducts, initialTotal, initialState, categories, dateLabel }: { initialProducts: VitrineProduct[]; initialTotal: number; initialState: CatalogState; categories: string[]; dateLabel: string }) {
  const [products, setProducts] = useState(initialProducts);
  const [total, setTotal] = useState(initialTotal);
  const [catalog, setCatalog] = useState(initialState);
  const [query, setQuery] = useState(initialState.search);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const carouselDragged = useRef(false);
  const requestVersion = useRef(0);
  const heroProducts = useMemo(() => initialProducts.filter((product) => product.imageUrl).slice(0, 2), [initialProducts]);
  const savedProducts = useMemo(() => products.filter((product) => favorites.includes(product.id)), [favorites, products]);
  const shownProducts = showSaved ? savedProducts : products;
  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const visibleFrom = total === 0 ? 0 : (catalog.page - 1) * CATALOG_PAGE_SIZE + 1;
  const visibleTo = total === 0 ? 0 : visibleFrom + products.length - 1;
  const slideCount = heroProducts.length + 1;
  const featuredProduct = heroProducts[0];

  useEffect(() => { try { const saved = window.localStorage.getItem("bizuminer:salvos"); if (saved) setFavorites(JSON.parse(saved) as string[]); } catch {} }, []);
  useEffect(() => { try { window.localStorage.setItem("bizuminer:salvos", JSON.stringify(favorites)); } catch {} }, [favorites]);
  useEffect(() => {
    syncUrl(initialState, "replace");
    trackInteraction("catalog_impression");
    const handlePopState = () => {
      const next = catalogStateFromSearchParams(new URLSearchParams(window.location.search));
      setCatalog(next);
      setQuery(next.search);
      setShowSaved(false);
      void fetchDeals(next, true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // O estado inicial pertence à navegação que produziu este Server Component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (carouselPaused) return;
    const timer = window.setTimeout(() => setCurrentSlide((slide) => (slide + 1) % slideCount), 6200);
    return () => window.clearTimeout(timer);
  }, [carouselPaused, currentSlide, slideCount]);

  function syncUrl(next: CatalogState, mode: "push" | "replace") {
    const params = catalogStateToSearchParams(next);
    const url = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (mode === "push") window.history.pushState({}, "", url);
    else window.history.replaceState({}, "", url);
  }

  async function fetchDeals(next: CatalogState, scrollToCatalog: boolean) {
    const version = ++requestVersion.current;
    setIsLoading(true);
    setLoadError("");
    const dealQuery = catalogStateToDealQuery(next);
    const params = new URLSearchParams({ limit: String(dealQuery.limit), offset: String(dealQuery.offset), sort: dealQuery.sort, price: dealQuery.priceBand });
    if (dealQuery.category) params.set("category", dealQuery.category);
    if (dealQuery.search) params.set("q", dealQuery.search);
    try {
      const response = await fetch(`/api/deals?${params}`);
      if (!response.ok) throw new Error("catalog_failed");
      const page = await response.json() as ApiPage;
      if (version !== requestVersion.current) return;
      setProducts(page.products);
      setTotal(page.total);
      if (scrollToCatalog) document.querySelector("#achados")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      if (version === requestVersion.current) setLoadError("Não foi possível atualizar as ofertas agora. Tente de novo.");
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }

  function changeCatalog(next: CatalogState, mode: "push" | "replace", scrollToCatalog: boolean) {
    setCatalog(next); setShowSaved(false); syncUrl(next, mode); void fetchDeals(next, scrollToCatalog);
  }
  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 4200); }
  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const saved = current.includes(id);
      trackInteraction(saved ? "favorite_remove" : "favorite_add", id);
      showNotice(saved ? "Removido dos seus salvos." : "Produto salvo neste navegador.");
      return saved ? current.filter((item) => item !== id) : [...current, id];
    });
  }
  function toggleSavedView() {
    if (!showSaved && !favorites.length) { showNotice("Toque no coração de um produto para guardá-lo aqui."); return; }
    setShowSaved((current) => !current);
    document.querySelector("#achados")?.scrollIntoView({ behavior: "smooth" });
  }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); trackInteraction("search"); changeCatalog({ ...catalog, page: 1, search: query.trim() }, "replace", true); }
  function clearFilters() { const next: CatalogState = { page: 1, category: null, priceBand: "all", sort: "signal", search: "" }; setQuery(""); changeCatalog(next, "replace", false); }
  function changePage(page: number) {
    if (page < 1 || page > totalPages || page === catalog.page || isLoading) return;
    trackInteraction("page_change");
    changeCatalog({ ...catalog, page }, "push", true);
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
      showNotice(data.already ? "Você já estava na lista." : "Pronto! As próximas ofertas chegam primeiro para você.");
      form.reset();
    } catch {
      showNotice("Não deu para salvar agora. Tente de novo em instantes.");
    }
  }
  const changeSlide = (direction: number) => setCurrentSlide((slide) => (slide + direction + slideCount) % slideCount);
  function handleHeroImageClick(event: MouseEvent<HTMLAnchorElement>, productId: string) {
    if (carouselDragged.current) {
      event.preventDefault();
      return;
    }
    trackInteraction("hero_detail_click", productId);
  }
  function finishCarouselGesture(clientX: number) {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    if (Math.abs(distance) > 48) {
      carouselDragged.current = true;
      changeSlide(distance > 0 ? -1 : 1);
      window.setTimeout(() => { carouselDragged.current = false; }, 0);
    }
    pointerStart.current = null;
  }

  return <main>
    <div className="signal-bar"><span>Bizu bom não espera.</span><span>Curadoria de ponta a ponta · links de afiliado</span></div>
    <header className="site-header">
      <a className="brand" href="#topo" aria-label="BizuMiner, início"><span className="brand-mark">bm</span><span className="brand-name"><b>Bizu</b><i>Miner</i></span></a>
      <button className="nav-toggle" aria-expanded={navOpen} aria-controls="main-nav" onClick={() => setNavOpen((value) => !value)}>menu</button>
      <nav id="main-nav" className={navOpen ? "open" : ""} aria-label="Navegação principal"><a href="#achados" onClick={() => setNavOpen(false)}>Ofertas</a><a href="#criterios" onClick={() => setNavOpen(false)}>Como escolhemos</a><a href="#vendedores" onClick={() => setNavOpen(false)}>Para vendedores</a></nav>
      <button className={showSaved ? "saved-button active" : "saved-button"} aria-pressed={showSaved} aria-label={`${favorites.length} produtos salvos, ver salvos`} onClick={toggleSavedView}><span>{showSaved ? "♥" : "♡"}</span><b>{favorites.length}</b></button>
    </header>

    <section className="hero" id="topo">
      <div className="hero-carousel" role="region" aria-roledescription="carrossel" aria-label="Destaques BizuMiner" onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onPointerDown={(event) => { pointerStart.current = event.clientX; carouselDragged.current = false; }} onPointerUp={(event) => finishCarouselGesture(event.clientX)} onPointerCancel={() => { pointerStart.current = null; carouselDragged.current = false; }}>
        <div className="hero-track" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
          <EditorialSlide products={heroProducts} hidden={currentSlide !== 0} />
          {heroProducts.map((product, index) => <ProductHeroSlide key={product.id} product={product} index={index} hidden={currentSlide !== index + 1} onImageClick={handleHeroImageClick} />)}
        </div>
      </div>
      <div className="carousel-bar">
        <div className="carousel-arrows"><button onClick={() => changeSlide(-1)} aria-label="Destaque anterior">←</button><button onClick={() => changeSlide(1)} aria-label="Próximo destaque">→</button></div>
        <div className="carousel-progress" aria-hidden="true"><i key={currentSlide} className={carouselPaused ? "paused" : ""} /></div>
        <span className="carousel-count">{String(currentSlide + 1).padStart(2, "0")} / {String(slideCount).padStart(2, "0")}</span>
        <div className="carousel-dots">{Array.from({ length: slideCount }, (_, index) => <button key={index} className={currentSlide === index ? "active" : ""} aria-label={`Ir para o destaque ${index + 1}`} aria-current={currentSlide === index ? "true" : undefined} onClick={() => setCurrentSlide(index)} />)}</div>
      </div>
      <div className="hero-tools">
        <div className="hero-tool-copy"><p className="eyebrow">Escolha com contexto</p><h1>Não perca tempo procurando ofertas.</h1><p>O BizuMiner faz a busca, acompanha o preço e apresenta as informações importantes para você decidir.</p><a href="#achados">ver ofertas <span>↓</span></a></div>
        <form className="search-box" onSubmit={submitSearch} role="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar produtos" placeholder="O que você está procurando?" /><button type="submit" disabled={isLoading}>buscar</button></form>
        {featuredProduct && <a className="hero-bizu" href={`/bizu/${featuredProduct.slug}`}><span><small>destaque selecionado</small>{featuredProduct.title}</span><b>↗</b></a>}
      </div>
    </section>

    <section className="filter-stack" aria-label="Filtrar ofertas">
      <div className="category-strip"><span className="category-label">Navegue por categoria</span><div className="category-list"><button className={catalog.category === null ? "active" : ""} onClick={() => { trackInteraction("category_filter"); changeCatalog({ ...catalog, page: 1, category: null }, "replace", false); }}>todas</button>{categories.map((item) => <button key={item} className={catalog.category === item ? "active" : ""} onClick={() => { trackInteraction("category_filter"); changeCatalog({ ...catalog, page: 1, category: item }, "replace", false); }}>{item}</button>)}</div></div>
      <div className="filter-controls"><div className="price-filters" aria-label="Faixa de preço">{priceFilters.map((item) => <button key={item.value} className={catalog.priceBand === item.value ? "active" : ""} onClick={() => { trackInteraction("price_filter"); changeCatalog({ ...catalog, page: 1, priceBand: item.value }, "replace", false); }}>{item.label}</button>)}</div><label className="sort-control">ordenar por <select value={catalog.sort} onChange={(event) => { trackInteraction("sort"); changeCatalog({ ...catalog, page: 1, sort: event.target.value as DealSort }, "replace", false); }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    </section>

    <section className="finds" id="achados" aria-busy={isLoading}>
      <div className="section-heading"><div><p className="eyebrow">{showSaved ? "Seus salvos · ficam neste navegador" : `Ofertas monitoradas · ${dateLabel}`}</p><h2>{showSaved ? "Seus salvos" : catalog.category === null ? "Destaques selecionados" : catalog.category}</h2></div><p className="result-count">{isLoading ? "atualizando…" : showSaved ? `${savedProducts.length} salvos` : `Mostrando ${visibleFrom}–${visibleTo} de ${total} ofertas`}</p></div>
      {!showSaved && catalog.category === null && catalog.priceBand === "all" && !catalog.search && <p className="catalog-intro">O verde informa o desconto exibido no anúncio. A leitura de preço mostra quantos registros temos e só destaca um menor preço quando o histórico sustenta essa comparação.</p>}
      {loadError && <p className="catalog-error" role="alert">{loadError} <button onClick={() => void fetchDeals(catalog, false)}>tentar de novo</button></p>}
      {shownProducts.length ? <><div className="product-grid">{shownProducts.map((product, index) => <ProductCard key={product.id} product={product} index={showSaved ? index : (catalog.page - 1) * CATALOG_PAGE_SIZE + index} favorite={favorites.includes(product.id)} onFavorite={toggleFavorite} />)}</div>{!showSaved && totalPages > 1 && <CatalogPagination current={catalog.page} total={totalPages} disabled={isLoading} onChange={changePage} />}</> : !isLoading && <div className="empty-state"><span>◇</span><h3>Nenhum produto encontrado.</h3><p>Tente outro termo ou limpe os filtros.</p><button onClick={clearFilters}>limpar filtros</button></div>}
    </section>

    <section className="price-radar" aria-label="Como avaliamos os preços"><div><p className="eyebrow">Histórico BizuMiner</p><h2>Desconto chama atenção.<br /><em>Histórico</em> ajuda a decidir.</h2></div><div className="radar-note"><span className="radar-orbit"><i>R$</i></span><p>Registramos o preço em cada captura. Enquanto o acompanhamento ainda é curto, mostramos exatamente quantos registros existem — sem transformar pouca informação em certeza.</p></div></section>
    <section className="criteria" id="criterios"><div className="criteria-intro"><p className="eyebrow">Da busca à recomendação</p><h2>Todo bizu passa por camadas.</h2><p>O BizuMiner combina automação com critérios claros. Antes de uma oferta chegar até você, organizamos produto, preço e evidências do anúncio.</p></div><ol className="criteria-list"><li><span>01</span><div><h3>Encontrar produtos úteis</h3><p>Selecionamos itens com função clara e potencial de melhorar a rotina.</p></div></li><li><span>02</span><div><h3>Conferir preço e histórico</h3><p>Comparamos o preço atual com os registros que já coletamos, sem prometer o que os dados ainda não provam.</p></div></li><li><span>03</span><div><h3>Apresentar com contexto</h3><p>Preço, avaliação, vendas informadas e link de afiliado aparecem com a fonte identificada.</p></div></li></ol></section>
    <section className="seller-callout" id="vendedores"><div className="seller-stamp">TEM UM<br />BIZU?</div><div><p className="eyebrow">Quer apresentar seu produto?</p><h2>Entre no nosso processo de seleção.</h2></div><div className="seller-copy"><p>Automatizar ofertas é fácil. Conquistar público qualificado é BizuMiner. Marcas e vendedores podem sugerir produtos; a curadoria continua independente.</p><a href="mailto:oi@bizuminer.com.br?subject=Quero%20mandar%20um%20bizu">enviar um produto <span>↗</span></a></div></section>
    <section className="newsletter"><div><span className="newsletter-icon">bm</span></div><div><p className="eyebrow">Bizus antes de todo mundo</p><h2>As próximas ofertas chegam na sua caixa.</h2></div><form onSubmit={submitEmail}><label className="sr-only" htmlFor="email">Seu melhor e-mail</label><input id="email" type="email" required placeholder="seu melhor e-mail" /><button type="submit">quero receber <span>→</span></button></form></section>
    <footer><a className="brand footer-brand" href="#topo"><span className="brand-mark">bm</span><span className="brand-name"><b>Bizu</b><i>Miner</i></span></a><p>A gente acompanha preços para trazer ofertas que valem a sua atenção.</p><div><a href="#criterios">transparência</a><a href="#vendedores">vendedores</a><a href="mailto:oi@bizuminer.com.br">contato</a></div><small>Alguns links são de afiliado. Podemos receber comissão sem custo adicional para você.</small></footer>
    <div className={notice ? "toast visible" : "toast"} role="status" aria-live="polite">{notice}</div>
  </main>;
}

function CatalogPagination({ current, total, disabled, onChange }: { current: number; total: number; disabled: boolean; onChange: (page: number) => void }) {
  const items = paginationItems(current, total);
  return <nav className="catalog-pagination" aria-label="Paginação das ofertas">
    <button className="pagination-direction" type="button" disabled={disabled || current === 1} onClick={() => onChange(current - 1)}><span aria-hidden="true">←</span><b>anterior</b></button>
    <div className="pagination-numbers">{items.map((item) => typeof item === "number" ? <button key={item} type="button" className={item === current ? "active" : ""} aria-current={item === current ? "page" : undefined} aria-label={`Ir para a página ${item}`} disabled={disabled} onClick={() => onChange(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div>
    <span className="pagination-mobile-status" aria-live="polite">Página {current} de {total}</span>
    <button className="pagination-direction next" type="button" disabled={disabled || current === total} onClick={() => onChange(current + 1)}><b>próxima</b><span aria-hidden="true">→</span></button>
  </nav>;
}

function ProductCard({ product, index, favorite, onFavorite }: { product: VitrineProduct; index: number; favorite: boolean; onFavorite: (id: string) => void }) {
  const status = priceSignal(historyInput(product));
  const discount = discountLabel(product);
  const freshness = freshnessLabel(product.evidenceObservedAt);
  return <article className="product-card">
    <div className="product-image"><a href={`/bizu/${product.slug}`} aria-label={`Abrir detalhes de ${product.title}`}><img src={product.imageUrl ?? "/og.png"} alt={product.title} /></a><span className="index">{String(index + 1).padStart(2, "0")}</span>{discount && <span className="discount">{discount}</span>}<button className={favorite ? "favorite active" : "favorite"} aria-label={`${favorite ? "Remover" : "Salvar"} ${product.title}`} aria-pressed={favorite} onClick={() => onFavorite(product.id)}>{favorite ? "♥" : "♡"}</button></div>
    <div className="product-meta"><span>{product.category ?? "Mercado Livre"}</span><span className={`signal-badge ${status.tone}`}>{status.label}</span></div>
    <h3><a href={`/bizu/${product.slug}`}>{product.title}</a></h3>
    <MarketplaceEvidence product={product} />
    <p className="product-blurb"><b>Histórico do preço:</b> {priceNarrative(historyInput(product), brl)}</p>
    <div className="product-price"><div><small>{product.originalPriceCents && product.originalPriceCents > product.priceCents ? brl(product.originalPriceCents) : ""}</small><strong>{brl(product.priceCents)}</strong>{freshness && <em>{freshness}</em>}</div><a href={`/go/${product.slug}`} target="_blank" rel="noreferrer sponsored" onClick={() => trackInteraction("outbound_click", product.id)}>ver no Mercado Livre <span>↗</span></a></div>
  </article>;
}
