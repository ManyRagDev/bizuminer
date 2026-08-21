"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { PriceBand } from "../../lib/deal-query";
import { priceHighlight } from "../../lib/deal-signal";
import type { VitrineProduct } from "../../lib/deal-view";
import { movementLabel, watchMovement } from "../../lib/member-contract";
import { readSavedState, writeSavedState } from "../../lib/saved-products";
import { ThemeToggle } from "../theme-toggle";

export type MemberSaved = VitrineProduct & { savedAt: string };

export type MemberWatch = {
  watchId: string;
  productId: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  category: string | null;
  baselineCents: number;
  targetCents: number | null;
  currentCents: number | null;
  currentObservedAt: string | null;
  watchedAt: string;
};

export type MemberRec = VitrineProduct & { reasonOrigin: "salvos" | "acompanhando" | "perfil" };

type Profile = { preferredCategories: string[]; priceBand: PriceBand };

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

const shortDate = (isoDate: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(isoDate));

const countLabel = (total: number, singular: string, plural: string) =>
  `${total} ${total === 1 ? singular : plural}`;

const bandOptions: Array<{ value: PriceBand; label: string }> = [
  { value: "all", label: "qualquer preço" },
  { value: "under_100", label: "até R$100" },
  { value: "100_500", label: "R$100–500" },
  { value: "over_500", label: "acima de R$500" },
];

const reasonText = (rec: MemberRec) => {
  if (!rec.category) return "está no seu perfil";
  if (rec.reasonOrigin === "salvos") return `porque você salvou itens de ${rec.category}`;
  if (rec.reasonOrigin === "acompanhando") return `porque você acompanha itens de ${rec.category}`;
  return `está no seu perfil: ${rec.category}`;
};

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);

async function api(path: string, method: string, body: unknown): Promise<{ ok: boolean } & Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { ok: boolean } & Record<string, unknown>;
}

function highlightFor(product: VitrineProduct) {
  return priceHighlight({
    priceCents: product.priceCents,
    previousMinPriceCents: product.previousMinPriceCents,
    observationCount: product.observationCount,
    historyDays: product.historyDays,
    lowestVerified: product.lowestVerified,
  });
}

function MemberCard({ product, meta, actions }: { product: VitrineProduct; meta?: React.ReactNode; actions?: React.ReactNode }) {
  const highlight = highlightFor(product);
  return (
    <article className="member-card">
      <a className="member-card-image" href={`/bizu/${product.slug}`} aria-label={`Abrir detalhes de ${product.title}`}>
        {product.imageUrl
          ? <Image src={product.imageUrl} alt={product.title} fill sizes="(max-width: 820px) calc((100vw - 44px) / 2), (max-width: 1100px) 33vw, 24vw" />
          : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={32} height={32} /></div>}
      </a>
      <p className="member-card-meta">
        <span>{product.category ?? "Mercado Livre"}</span>
        {highlight && <span className={`signal-badge ${highlight.tone}`}>{highlight.label}</span>}
      </p>
      <h3><a href={`/bizu/${product.slug}`}>{product.title}</a></h3>
      {meta}
      <div className="member-card-foot">
        <strong>{brl(product.priceCents)}</strong>
        <a href={`/go/${product.slug}`} target="_blank" rel="noreferrer sponsored">ver no ML ↗</a>
      </div>
      {actions}
    </article>
  );
}

/** Fecha a grade: uma grade que termina em vazio parece erro, não escassez. */
function MoreCard({ label, hint, href }: { label: string; hint: string; href: string }) {
  return (
    <a className="member-more-card" href={href}>
      <i aria-hidden="true">+</i>
      <b>{label}</b>
      <small>{hint}</small>
    </a>
  );
}

export default function MemberArea({
  identified,
  categories,
  initialSaved,
  initialWatches,
  recommended,
  initialProfile,
}: {
  identified: boolean;
  categories: string[];
  initialSaved: MemberSaved[];
  initialWatches: MemberWatch[];
  recommended: MemberRec[];
  initialProfile: Profile;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [watches, setWatches] = useState(initialWatches);
  const [profileDraft, setProfileDraft] = useState(initialProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pendingLocalIds, setPendingLocalIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const watchedIds = useMemo(() => new Set(watches.map((watch) => watch.productId)), [watches]);

  // Queda acumulada: só soma o que de fato caiu desde a marcação. Nunca é
  // chamada de "economia" — a pessoa não comprou, o preço é que se moveu.
  const totalDrop = useMemo(() => watches.reduce((sum, watch) => {
    const movement = watchMovement(watch.baselineCents, watch.currentCents);
    return movement.state === "down" ? sum + movement.deltaCents : sum;
  }, 0), [watches]);

  // Quando toda recomendação nasce do mesmo motivo, ele é dito uma vez no
  // cabeçalho. Repetir a mesma frase em sete cartões é a cicatriz dos 24
  // blurbs idênticos se repetindo em outra tela.
  const uniformReason = useMemo(() => {
    if (recommended.length === 0) return null;
    const distinct = new Set(recommended.map((rec) => `${rec.reasonOrigin}|${rec.category ?? ""}`));
    return distinct.size === 1 ? reasonText(recommended[0]) : null;
  }, [recommended]);

  useEffect(() => {
    const local = readSavedState(window.localStorage);
    const serverIds = new Set(initialSaved.map((item) => item.id));
    setPendingLocalIds(local.ids.filter((id) => !serverIds.has(id)));
  }, [initialSaved]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  }

  async function removeSaved(product: MemberSaved) {
    setSaved((current) => current.filter((item) => item.id !== product.id));
    const local = readSavedState(window.localStorage);
    writeSavedState(window.localStorage, {
      ids: local.ids.filter((id) => id !== product.id),
      products: local.products.filter((item) => item.id !== product.id),
    });
    try {
      const result = await api("/api/minha/favoritos", "POST", { productId: product.id, saved: false });
      if (!result.ok) throw new Error();
      showNotice("Removido dos seus salvos.");
    } catch {
      setSaved((current) => [product, ...current]);
      showNotice("Não deu para remover agora. Tente de novo.");
    }
  }

  async function watchProduct(product: VitrineProduct) {
    try {
      const result = await api("/api/minha/acompanhar", "POST", { productId: product.id });
      if (!result.ok || !result.watch) throw new Error();
      const row = result.watch as Record<string, unknown>;
      const watch: MemberWatch = {
        watchId: String(row.watch_id),
        productId: String(row.product_id),
        title: String(row.title),
        slug: String(row.slug),
        imageUrl: (row.image_url as string | null) ?? null,
        category: (row.category as string | null) ?? null,
        baselineCents: Number(row.baseline_price_cents),
        targetCents: row.target_price_cents === null ? null : Number(row.target_price_cents),
        currentCents: row.current_price_cents === null ? null : Number(row.current_price_cents),
        currentObservedAt: row.current_observed_at ? new Date(row.current_observed_at as string).toISOString() : null,
        watchedAt: new Date(row.watched_at as string).toISOString(),
      };
      setWatches((current) => [watch, ...current.filter((item) => item.productId !== watch.productId)]);
      showNotice("De olho no preço: avisamos aqui o que mudar desde hoje.");
    } catch {
      showNotice("Não deu para acompanhar agora. Tente de novo.");
    }
  }

  async function unwatch(watch: MemberWatch) {
    setWatches((current) => current.filter((item) => item.watchId !== watch.watchId));
    try {
      const result = await api("/api/minha/acompanhar", "DELETE", { productId: watch.productId });
      if (!result.ok) throw new Error();
      showNotice("Você parou de acompanhar este item.");
    } catch {
      setWatches((current) => [watch, ...current]);
      showNotice("Não deu para parar agora. Tente de novo.");
    }
  }

  async function syncLocal() {
    if (!pendingLocalIds.length || syncing) return;
    setSyncing(true);
    try {
      const result = await api("/api/minha/favoritos", "PUT", { productIds: pendingLocalIds });
      if (!result.ok) throw new Error();
      window.location.reload();
    } catch {
      setSyncing(false);
      showNotice("Não deu para sincronizar agora. Tente de novo.");
    }
  }

  async function submitProfile() {
    setProfileSaving(true);
    try {
      const result = await api("/api/minha/perfil", "POST", profileDraft);
      if (!result.ok) throw new Error();
      showNotice("Preferências salvas. As recomendações passam a usar isso.");
    } catch {
      showNotice("Não deu para salvar as preferências agora.");
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleCategory(category: string) {
    setProfileDraft((current) => ({
      ...current,
      preferredCategories: current.preferredCategories.includes(category)
        ? current.preferredCategories.filter((item) => item !== category)
        : [...current.preferredCategories, category],
    }));
  }

  return (
    <main className="member-page">
      <header className="detail-header">
        <a className="brand" href="/" aria-label="BizuMiner, início">
          <Image src="/brand/bizuminer-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} priority className="brand-mark-img" />
          <span className="brand-name"><b>Bizu</b><i>Miner</i></span>
        </a>
        <div className="detail-header-actions">
          <ThemeToggle />
          <a href="/#achados">← voltar aos achados</a>
        </div>
      </header>

      <section className="member-hero">
        <div className="member-hero-copy">
          <p className="eyebrow">Sua bancada</p>
          <h1>Minha área</h1>
          <p className="member-hero-lead">
            O que você salvou, o que está de olho e o que encontramos parecido — tudo num lugar só.
          </p>
          <p className="member-honesty">
            Sua área fica <b>neste navegador</b>: ainda não existe conta com login, então trocar de aparelho não
            leva os dados junto. Quando o login chegar, tudo daqui migra automaticamente.
          </p>
          {pendingLocalIds.length > 0 && (
            <button className="member-sync" type="button" disabled={syncing} onClick={() => void syncLocal()}>
              {syncing ? "sincronizando…" : `sincronizar ${countLabel(pendingLocalIds.length, "salvo", "salvos")} deste navegador`}
            </button>
          )}
        </div>
        <aside className="member-state" aria-label="Resumo da sua área">
          <span className="member-state-label">Estado da bancada</span>
          <div className="member-state-grid">
            <div><b>{saved.length}</b><small>{saved.length === 1 ? "salvo" : "salvos"}</small></div>
            <div><b>{watches.length}</b><small>de olho</small></div>
            <div>
              <b>{profileDraft.preferredCategories.length}</b>
              <small>{profileDraft.preferredCategories.length === 1 ? "categoria" : "categorias"}</small>
            </div>
          </div>
          {totalDrop > 0 && (
            <p className="member-state-drop">
              <b>{brl(totalDrop)}</b> de queda somada desde que você marcou.
            </p>
          )}
        </aside>
      </section>

      <section className="member-section watch-section" aria-labelledby="watch-title">
        <div className="member-section-head">
          <h2 id="watch-title">De olho no preço</h2>
          <span className="member-count">{countLabel(watches.length, "item", "itens")}</span>
        </div>
        {watches.length === 0 ? (
          <div className="watch-empty">
            <p className="member-empty">
              Nenhum item acompanhado ainda. Toque em <b>“de olho no preço”</b> em qualquer produto salvo e o
              BizuMiner passa a comparar o preço de hoje com todos os que vierem depois.
            </p>
            <ol className="watch-how">
              <li><span>01</span>Guardamos o preço exato do dia em que você marca o produto.</li>
              <li><span>02</span>Cada nova varredura do robô compara o preço atual com aquele valor.</li>
              <li><span>03</span>A diferença aparece aqui, em reais e em porcentagem — sem depender da sua memória.</li>
            </ol>
          </div>
        ) : (
          <ul className="watch-list">
            {watches.map((watch) => {
              const movement = watchMovement(watch.baselineCents, watch.currentCents);
              const since = shortDate(watch.watchedAt);
              return (
                <li key={watch.watchId} className="watch-card">
                  <a className="watch-image" href={`/bizu/${watch.slug}`} aria-label={`Abrir detalhes de ${watch.title}`}>
                    {watch.imageUrl
                      ? <Image src={watch.imageUrl} alt="" fill sizes="96px" />
                      : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={24} height={24} /></div>}
                  </a>
                  <div className="watch-body">
                    <h3><a href={`/bizu/${watch.slug}`}>{watch.title}</a></h3>
                    <p className={`watch-move ${movement.state}`}>
                      {movement.state === "down" && <b aria-hidden="true">▼</b>}
                      {movement.state === "up" && <b aria-hidden="true">▲</b>}
                      {movementLabel(movement, brl, since)}
                    </p>
                    <p className="watch-facts">
                      <span>marcado a {brl(watch.baselineCents)} em {since}</span>
                      {watch.currentCents !== null && <span>· agora {brl(watch.currentCents)}</span>}
                    </p>
                  </div>
                  <div className="watch-actions">
                    <a href={`/go/${watch.slug}`} target="_blank" rel="noreferrer sponsored">ver no ML ↗</a>
                    <button type="button" onClick={() => void unwatch(watch)}>parar de acompanhar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="member-section saved-section" aria-labelledby="saved-title">
        <div className="member-section-head">
          <h2 id="saved-title">Seus salvos</h2>
          <span className="member-count">{countLabel(saved.length, "item", "itens")}</span>
        </div>
        {saved.length === 0 ? (
          <p className="member-empty">
            Nada salvo ainda. Toque no coração de um produto na <a href="/#achados">vitrine</a> para guardá-lo aqui.
          </p>
        ) : (
          <div className="member-grid">
            {saved.map((product) => (
              <MemberCard
                key={product.id}
                product={product}
                meta={<p className="member-card-note">salvo em {shortDate(product.savedAt)}</p>}
                actions={
                  <div className="member-card-actions">
                    {watchedIds.has(product.id)
                      ? <span className="member-watching">✓ de olho no preço</span>
                      : <button type="button" onClick={() => void watchProduct(product)}>de olho no preço</button>}
                    <button type="button" className="member-remove" onClick={() => void removeSaved(product)}>remover</button>
                  </div>
                }
              />
            ))}
            <MoreCard label="Garimpar mais achados" hint="voltar à vitrine" href="/#achados" />
          </div>
        )}
      </section>

      <section className="member-section rec-section" aria-labelledby="rec-title">
        <div className="member-section-head">
          <h2 id="rec-title">Recomendados para você</h2>
          {recommended.length > 0 && (
            <span className="member-count">{countLabel(recommended.length, "sugestão", "sugestões")}</span>
          )}
        </div>
        {uniformReason && <p className="member-reason-note">{capitalize(uniformReason)}.</p>}
        {recommended.length === 0 ? (
          <p className="member-empty">
            Ainda não há base para recomendar: salve produtos, acompanhe preços ou preencha o perfil abaixo — as
            sugestões nascem do que você fizer, com o motivo dito em cada uma.
          </p>
        ) : (
          <div className="member-grid">
            {recommended.map((rec) => (
              <MemberCard
                key={rec.id}
                product={rec}
                meta={uniformReason ? undefined : <p className="member-card-reason">{reasonText(rec)}</p>}
              />
            ))}
            <MoreCard label="Ver o catálogo inteiro" hint="mais de uma categoria" href="/#achados" />
          </div>
        )}
      </section>

      <section className="member-section member-profile" aria-labelledby="profile-title">
        <div className="member-section-head">
          <h2 id="profile-title">Perfil do comprador</h2>
        </div>
        <p className="member-empty">
          Conte o que interessa e as recomendações passam a combinar isso com os seus salvos. Nada aqui é
          obrigatório — e nada disso vira e-mail ou cadastro.
        </p>
        <div className="profile-form">
          <div className="profile-group">
            <h3>Categorias de interesse</h3>
            <div className="profile-chips" role="group" aria-label="Categorias de interesse">
              {categories.map((category) => {
                const active = profileDraft.preferredCategories.includes(category);
                return (
                  <button key={category} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => toggleCategory(category)}>
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="profile-group">
            <h3>Faixa de preço preferida</h3>
            <div className="profile-chips" role="radiogroup" aria-label="Faixa de preço preferida">
              {bandOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={profileDraft.priceBand === option.value}
                  className={profileDraft.priceBand === option.value ? "active" : ""}
                  onClick={() => setProfileDraft((current) => ({ ...current, priceBand: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button className="profile-save" type="button" disabled={profileSaving || !identified} onClick={() => void submitProfile()}>
            {profileSaving ? "salvando…" : "salvar preferências"}
          </button>
        </div>
      </section>

      <div className={notice ? "toast visible" : "toast"} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
