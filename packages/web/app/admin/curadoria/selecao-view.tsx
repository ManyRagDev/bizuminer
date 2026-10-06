"use client";

import Image from "next/image";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  EDITORIAL_DIMENSIONS,
  EDITORIAL_LEVELS,
  type EditorialAssessmentInput,
  type EditorialCandidate,
  type EditorialSelection,
} from "../../../lib/editorial-selection.ts";
import { saveEditorialAssessmentAction, replaceEditorialSelectionAction } from "./actions.ts";
import { marketplaceDef } from "../../../lib/marketplaces.ts";
import { rankHeroCandidates, type HeroClassification } from "../../../lib/hero-ranking.ts";
import { HERO_MAX_PRODUCTS, HERO_POLICY_VERSION, HERO_RUBRIC, HERO_WEIGHTS } from "../../../lib/hero-policy.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function errorMessage(error: string): string {
  const messages: Record<string, string> = {
    forbidden: "Você não tem permissão para alterar a curadoria.",
    schema_not_ready: "A migração da seleção ainda não foi aplicada.",
    migration_required: "A migração da seleção ainda não foi aplicada.",
    evidence_changed: "O anúncio mudou desde o início da revisão. Atualize a página e avalie as novas evidências.",
    product_not_approved: "O produto deixou de estar aprovado no catálogo. Atualize a página.",
    assessment_superseded: "Há uma avaliação mais recente deste produto. Atualize a página e prepare a seleção com a revisão atual.",
    assessment_not_found: "Uma avaliação ou produto desta seleção não está mais disponível. Atualize a página.",
    selection_item_blocked: "Um destaque ficou inválido ou ganhou um impedimento. Atualize a página e revise os itens antes de ativar.",
    selection_conflict: "A seleção foi alterada por outra sessão. Atualize a página antes de ativar.",
    stale_assessment: "As evidências mudaram após a avaliação. Revise o produto.",
    invalid_destinations: "Cada destaque precisa ter ao menos um destino.",
    destination_context_required: "Explique o contexto dos produtos destinados somente à home ou somente à pauta.",
    selection_limit: "A seleção aceita até 24 produtos.",
    assessment_explanation_required: "Preencha público, benefício, conteúdo da compra e justificativa pública.",
    invalid_critical_doubts: "Registre no máximo 20 dúvidas, cada uma com 3 a 500 caracteres.",
    invalid_max_price: "Informe um preço máximo aceitável válido.",
    invalid_hero_policy: "Atualize a página para usar a rubrica atual da hero.",
  };
  if (error.startsWith("invalid_dimension_")) return "Preencha o nível e uma justificativa de pelo menos 3 caracteres para cada dimensão.";
  return messages[error] ?? error;
}

function EvidenceDetails({ candidate }: { candidate: EditorialCandidate }) {
  const evidence = candidate.offerEvidence && typeof candidate.offerEvidence === "object" ? candidate.offerEvidence as Record<string, unknown> : {};
  const source = evidence.source && typeof evidence.source === "object" ? evidence.source as Record<string, unknown> : {};
  const display = (value: unknown) => Array.isArray(value) ? value.join(", ") : typeof value === "string" || typeof value === "number" ? String(value) : "Desconhecido";
  return <details className="editorial-evidence-details"><summary>Evidências disponíveis para revisão</summary>
    <dl>{([
      ["Descrição da fonte", evidence.description], ["Variante", evidence.variantLabel],
      ["Identificação da variante", evidence.variantKey],
      ["Preço mínimo declarado no anúncio", typeof evidence.priceMinCents === "number" ? brl.format(evidence.priceMinCents / 100) : undefined],
      ["Preço máximo declarado no anúncio", typeof evidence.priceMaxCents === "number" ? brl.format(evidence.priceMaxCents / 100) : undefined],
      ["Avaliações positivas (não equivalem a estrelas)", typeof evidence.positiveReviewRate === "number" ? `${(evidence.positiveReviewRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : undefined],
      ["Método da captura", source.method], ["Data da evidência da fonte", source.capturedAt],
      ["Conteúdo do pacote", evidence.packageContents], ["Quantidade", evidence.packageQuantity],
      ["Dimensões", evidence.dimensions], ["Quantidade de avaliações", evidence.reviewCount],
    ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl>
    {typeof evidence.priceMinCents === "number" && typeof evidence.priceMaxCents === "number" && evidence.priceMinCents !== evidence.priceMaxCents && <p className="editorial-selection-blockers">O anúncio apresenta uma faixa de preços. O destaque fica bloqueado até uma nova captura comprovar a configuração e o preço exatos; a avaliação manual não remove este impedimento.</p>}
    <p>Última observação: {candidate.evidenceObservedAt ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(candidate.evidenceObservedAt)) : "desconhecida"}.</p>
    {typeof source.url === "string" && /^https?:\/\//.test(source.url) && <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">Abrir fonte das evidências ↗</a>}
  </details>;
}

function heroScoreLabel(classification: HeroClassification): string {
  if (classification.score === null) return "sem nota";
  const score = classification.score.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return classification.basis === "catalog" ? `${score} pontos de evidência` : `${score}/100`;
}

const levelLabels = { unknown: "Desconhecido", weak: "Fraco", adequate: "Adequado", strong: "Forte", exceptional: "Excepcional" };

function HeroClassificationDetails({ classification }: { classification: HeroClassification }) {
  return <details className="hero-classification-details">
    <summary>{classification.status === "hero" ? "Disputa a hero" : classification.status === "blocked" ? "Indicação bloqueada" : "Seleção geral"} · {heroScoreLabel(classification)} · {classification.basis === "editorial" ? "avaliação editorial" : "sinais do catálogo"}</summary>
    <p>Política {classification.policyVersion}. Os melhores disponíveis ocupam até {HERO_MAX_PRODUCTS} posições, sem nota mínima. Avaliações editoriais válidas têm prioridade; os sinais do catálogo ordenam produtos ainda não avaliados.</p>
    {classification.basis === "catalog" && <p>Este índice mede evidências disponíveis, sem atribuir notas de utilidade ou adequação ao público. Dados ausentes não recebem pontos.</p>}
    {classification.breakdown.length > 0 && <dl>{classification.breakdown.map(({ id, weight, points, contribution }) => <div key={id}><dt>{EDITORIAL_DIMENSIONS.find((dimension) => dimension.id === id)!.label} ({weight}%)</dt><dd>{points === null ? "Desconhecido" : `${points}/100 → ${contribution} pontos`}</dd></div>)}</dl>}
    {classification.catalogSignals.length > 0 && <dl>{classification.catalogSignals.map(({ label, points }) => <div key={label}><dt>{label}</dt><dd>{points} pontos</dd></div>)}</dl>}
    {classification.reasons.length > 0 && <ul>{classification.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
  </details>;
}
type DraftItem = { productId: string; assessmentId: string; destinations: ("home" | "pauta")[]; context: string };

function draftFrom(selection: EditorialSelection | null): DraftItem[] {
  return selection?.items.map(({ productId, assessmentId, destinations, context }) => ({ productId, assessmentId, destinations, context })) ?? [];
}

function assessmentFrom(candidate: EditorialCandidate): EditorialAssessmentInput {
  const previous = candidate.assessment;
  return {
    heroPolicyVersion: HERO_POLICY_VERSION,
    productId: candidate.id,
    evidenceFingerprint: candidate.evidenceFingerprint,
    dimensions: Object.fromEntries(EDITORIAL_DIMENSIONS.map(({ id }) => [id, previous?.dimensions[id] ?? { level: "unknown", reason: "" }])) as EditorialAssessmentInput["dimensions"],
    audience: previous?.audience ?? "",
    benefit: previous?.benefit ?? "",
    purchaseContents: previous?.purchaseContents ?? "",
    publicRationale: previous?.publicRationale ?? "",
    criticalDoubts: previous?.criticalDoubts ?? [],
    maxPriceCents: previous?.maxPriceCents ?? candidate.priceCents,
  };
}

function AssessmentForm({ candidate, disabled, onSaved, onCancel }: {
  candidate: EditorialCandidate; disabled: boolean;
  onSaved: (candidate: EditorialCandidate) => void; onCancel: () => void;
}) {
  const [input, setInput] = useState(() => assessmentFrom(candidate));
  const [maxPrice, setMaxPrice] = useState(() => (input.maxPriceCents / 100).toFixed(2));
  const [doubts, setDoubts] = useState(input.criticalDoubts.join("\n"));
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = Math.round(Number(maxPrice.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) { setFeedback("Informe um preço máximo válido."); return; }
    startTransition(async () => {
      const result = await saveEditorialAssessmentAction({ ...input, maxPriceCents: cents, criticalDoubts: doubts.split("\n").map((line) => line.trim()).filter(Boolean) });
      if (!result.ok) { setFeedback(errorMessage(result.error)); return; }
      if (!result.candidate) { setFeedback("O produto deixou de estar disponível para seleção. Atualize a página."); return; }
      onSaved(result.candidate);
    });
  }

  return <form className="editorial-assessment-form" onSubmit={submit}>
    <h4>Avaliação editorial</h4>
    <p>Registre fatos e suas fontes. Informações que o anúncio não permite confirmar continuam desconhecidas.</p>
    <p>Esta revisão usa a rubrica {HERO_POLICY_VERSION}. “Excepcional” exige demonstrar por que o produto se destaca; vendas, desconto anunciado e imagem atraente não substituem a justificativa.</p>
    {EDITORIAL_DIMENSIONS.map(({ id, label, prompt }) => <fieldset key={id}>
      <legend>{label}</legend><p>{prompt}</p>
      <details className="hero-rubric-guide"><summary>Como avaliar · peso de {HERO_WEIGHTS[id]}% na hero</summary>{(["adequate", "strong", "exceptional"] as const).map((level) => <p key={level}><b>{levelLabels[level]}:</b> {HERO_RUBRIC[id][level]}</p>)}</details>
      <label>Nível
        <select value={input.dimensions[id].level} onChange={(event) => setInput((current) => ({ ...current, dimensions: { ...current.dimensions, [id]: { ...current.dimensions[id], level: event.target.value as typeof EDITORIAL_LEVELS[number] } } }))}>
          {EDITORIAL_LEVELS.map((level) => <option key={level} value={level}>{levelLabels[level]}</option>)}
        </select>
      </label>
      <label>Justificativa e evidências
        <textarea required minLength={3} maxLength={1000} value={input.dimensions[id].reason} onChange={(event) => setInput((current) => ({ ...current, dimensions: { ...current.dimensions, [id]: { ...current.dimensions[id], reason: event.target.value } } }))} />
      </label>
    </fieldset>)}
    <label>Público e situação de uso<textarea required minLength={3} maxLength={500} value={input.audience} onChange={(event) => setInput((current) => ({ ...current, audience: event.target.value }))} /></label>
    <label>Benefício concreto<textarea required minLength={3} maxLength={500} value={input.benefit} onChange={(event) => setInput((current) => ({ ...current, benefit: event.target.value }))} /></label>
    <label>O que chega na compra (quantidade, variante e tamanho conhecidos)<textarea required minLength={3} maxLength={1000} value={input.purchaseContents} onChange={(event) => setInput((current) => ({ ...current, purchaseContents: event.target.value }))} /></label>
    <label>Por que indicamos — texto público para home e pauta<textarea required minLength={10} maxLength={500} value={input.publicRationale} onChange={(event) => setInput((current) => ({ ...current, publicRationale: event.target.value }))} /></label>
    <label>Preço máximo aceitável (R$)<input required inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /><small>Acima deste valor, o destaque será bloqueado até nova avaliação.</small></label>
    <label>Dúvidas essenciais em aberto (uma por linha)<textarea maxLength={4000} value={doubts} onChange={(event) => setDoubts(event.target.value)} /><small>Dúvidas essenciais e níveis fracos ou desconhecidos impedem o destaque.</small></label>
    {feedback && <p role="alert">{feedback}</p>}
    <div className="selecao-card-actions"><button type="submit" disabled={pending || disabled}>{pending ? "Salvando…" : "Salvar avaliação"}</button><button type="button" disabled={pending} onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export default function SelecaoView({ initialCandidates, initialSelection, schemaReady, catalogHeroActive }: {
  initialCandidates: EditorialCandidate[]; initialSelection: EditorialSelection | null; schemaReady: boolean; catalogHeroActive: boolean;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selection, setSelection] = useState(initialSelection);
  const [draft, setDraft] = useState(() => draftFrom(initialSelection));
  const [validHours, setValidHours] = useState("24");
  const [search, setSearch] = useState("");
  const [marketplace, setMarketplace] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const ranked = useMemo(() => rankHeroCandidates(candidates), [candidates]);
  const filtered = useMemo(() => ranked.filter(({ candidate }) => (marketplace === "all" || candidate.marketplace === marketplace) && candidate.title.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [ranked, marketplace, search]);
  const heroPreview = useMemo(() => {
    if (catalogHeroActive && !selection && !dirty) return ranked.filter((entry) => entry.selectedForHero);
    const pool = draft.filter((item) => item.destinations.includes("home") && byId.get(item.productId)?.assessment?.id === item.assessmentId)
      .map((item) => byId.get(item.productId)!);
    return rankHeroCandidates(pool, new Date(), new Map(draft.map((item, position) => [item.productId, position]))).filter((entry) => entry.selectedForHero);
  }, [draft, byId, catalogHeroActive, selection, dirty, ranked]);

  function prepareBest() {
    const best = rankHeroCandidates(candidates.filter((candidate) => candidate.assessment)).filter((entry) => entry.selectedForHero);
    const additions = best.filter(({ candidate }) => !draft.some((item) => item.productId === candidate.id));
    if (draft.length + additions.length > 24) { setFeedback("Retire itens da seleção para abrir espaço aos melhores candidatos."); return; }
    if (!best.length) { setFeedback("Ainda não há avaliações válidas para montar uma edição editorial. Avalie os candidatos; antes da primeira edição, os melhores do catálogo já aparecem automaticamente na home e na pauta."); return; }
    const bestIds = new Set(best.map(({ candidate }) => candidate.id));
    changeDraft([...best.map(({ candidate }) => ({ productId: candidate.id, assessmentId: candidate.assessment!.id,
      destinations: ["home", "pauta"] as ("home" | "pauta")[], context: draft.find((item) => item.productId === candidate.id)?.context ?? "" })), ...draft.filter((item) => !bestIds.has(item.productId))]);
    setFeedback(`${best.length} candidatos preparados para home e pauta. Confira a prévia e ative a seleção.`);
  }

  function changeDraft(next: DraftItem[]) { setDraft(next); setDirty(true); setFeedback(""); }
  function move(index: number, direction: number) {
    const next = [...draft]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    changeDraft(next);
  }
  function toggleDestination(index: number, destination: "home" | "pauta") {
    changeDraft(draft.map((item, position) => position !== index ? item : { ...item, destinations: item.destinations.includes(destination) ? item.destinations.filter((value) => value !== destination) : [...item.destinations, destination] }));
  }
  function activate() {
    startTransition(async () => {
      const result = await replaceEditorialSelectionAction({
        expectedVersion: selection?.version ?? null,
        validUntil: new Date(Date.now() + Number(validHours) * 3_600_000).toISOString(), items: draft,
      });
      if (!result.ok) { setFeedback(errorMessage(result.error)); return; }
      setSelection(result.selection); setDraft(draftFrom(result.selection)); setDirty(false);
      setFeedback(`Seleção versão ${result.selection.version} ativada para home e pauta.`);
    });
  }

  return <section className="selecao-dia-view" aria-labelledby="selecao-dia-title">
    <div className="selecao-dia-header"><div><h2 id="selecao-dia-title" className="selecao-dia-heading">Seleção editorial</h2><p className="selecao-dia-sub">Avalie o catálogo aprovado e escolha os destaques compartilhados pela home e pela pauta.</p></div></div>
    {!schemaReady && <p className="editorial-selection-alert" role="alert">A estrutura da seleção ainda não está disponível no banco. Avaliação e ativação permanecem desabilitadas até a migração ser aplicada.</p>}
    {feedback && <p className="editorial-selection-alert" role="status">{feedback}</p>}
    <section className="hero-ranking-board" aria-labelledby="hero-ranking-title">
      <h3 id="hero-ranking-title">Hero · os melhores disponíveis</h3>
      <p>Até {HERO_MAX_PRODUCTS} melhores produtos disponíveis, por ordem relativa. A nota ajuda a comparar; não há corte mínimo de qualidade para preencher as posições.</p>
      <p>Público {HERO_WEIGHTS.audience}% · utilidade {HERO_WEIGHTS.utility}% · valor {HERO_WEIGHTS.value}% · confiança {HERO_WEIGHTS.confidence}% · clareza {HERO_WEIGHTS.clarity}%.</p>
      <p>{catalogHeroActive && !selection && !dirty ? "Destaques atuais: antes da primeira edição editorial, home e pauta compartilham os melhores do catálogo aprovado. Avaliações válidas têm prioridade, seguidas pelos sinais de preço comparável, avaliações, clareza e vendas." : "Prévia da próxima ativação: itens do rascunho destinados à home, com a avaliação atual. A ordem geral permanece editorial; a hero usa a classificação."}</p>
      {heroPreview.length ? <ol>{heroPreview.map(({ candidate, classification }) => <li key={candidate.id}><b>{candidate.title}</b> · {heroScoreLabel(classification)} · {classification.basis === "editorial" ? "avaliação editorial" : "sinais do catálogo"}</li>)}</ol> : <p>Nenhum item válido nesta prévia. Ofertas desatualizadas ou com impedimentos de compra precisam de revisão.</p>}
      <button type="button" disabled={!schemaReady || pending} onClick={prepareBest}>Preparar os {HERO_MAX_PRODUCTS} melhores candidatos</button>
      <p>Este botão prepara uma edição com os melhores candidatos já avaliados. Ao ativá-la, ela passa a controlar home e pauta; uma edição vazia ou vencida não é preenchida automaticamente pelo catálogo.</p>
    </section>
    <section className="editorial-selection-board" aria-labelledby="editorial-current-title">
      <h3 id="editorial-current-title">Seleção vigente {selection ? `· versão ${selection.version}` : "· ainda não ativada"}</h3>
      {selection && <p>Vigência até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(selection.validUntil))} (São Paulo).{Date.parse(selection.validUntil) <= Date.now() ? " A seleção venceu; os destaques não aparecem ao público." : ""}</p>}
      <p>Retirar ou mudar a ordem dos destaques preserva a aprovação no catálogo. As alterações entram no ar quando você ativa esta seleção.</p>
      {!draft.length && <p>Nenhum destaque preparado. A seleção pode ser ativada vazia para retirar todos os destaques.</p>}
      <ol className="editorial-selection-list">{draft.map((item, index) => {
        const candidate = byId.get(item.productId);
        return <li key={item.productId}>
          <strong>{candidate?.title ?? `Produto ${item.productId}`}</strong>
          <p>{candidate?.assessment?.id === item.assessmentId ? candidate.assessment.publicRationale : selection?.items.find((current) => current.productId === item.productId)?.publicRationale}</p>
          {candidate?.assessment && candidate.assessment.id !== item.assessmentId && <div className="editorial-selection-blockers"><p>A avaliação usada neste item foi substituída. O destaque está suspenso até ativar uma seleção com a revisão atual.</p><button type="button" disabled={pending || candidate.selectionBlockers.length > 0} onClick={() => changeDraft(draft.map((current, position) => position === index ? { ...current, assessmentId: candidate.assessment!.id } : current))}>Usar avaliação atual</button></div>}
          {candidate?.selectionBlockers.length ? <p className="editorial-selection-blockers">{candidate.selectionBlockers.join(" · ")}</p> : null}
          {!candidate && <p className="editorial-selection-blockers">Produto fora do catálogo elegível. Retire antes de ativar.</p>}
          <div className="editorial-selection-destinations">{(["home", "pauta"] as const).map((destination) => <label key={destination}><input type="checkbox" disabled={pending} checked={item.destinations.includes(destination)} onChange={() => toggleDestination(index, destination)} />{destination === "home" ? "Página inicial" : "Pauta"}</label>)}</div>
          <label className="editorial-selection-context">Contexto da seleção (explique quando o destino for específico)<input maxLength={500} disabled={pending} value={item.context} onChange={(event) => changeDraft(draft.map((current, position) => position === index ? { ...current, context: event.target.value } : current))} /></label>
          <div className="selecao-card-actions"><button type="button" disabled={pending || index === 0} onClick={() => move(index, -1)} aria-label={`Subir ${candidate?.title ?? "produto"}`}>↑ Subir</button><button type="button" disabled={pending || index === draft.length - 1} onClick={() => move(index, 1)} aria-label={`Descer ${candidate?.title ?? "produto"}`}>↓ Descer</button><button type="button" disabled={pending} onClick={() => changeDraft(draft.filter((current) => current.productId !== item.productId))}>Retirar do destaque</button></div>
        </li>;
      })}</ol>
      <div className="editorial-selection-activate"><label>Vigência da nova versão<select value={validHours} disabled={pending} onChange={(event) => { setValidHours(event.target.value); setDirty(true); }}><option value="6">6 horas</option><option value="12">12 horas</option><option value="24">24 horas</option><option value="48">48 horas</option></select></label><button type="button" disabled={pending || !schemaReady} onClick={activate}>{pending ? "Ativando…" : "Ativar seleção na home e pauta"}</button>{dirty && <span>Há alterações ainda não ativadas.</span>}</div>
    </section>
    <div className="selecao-dia-header"><div><h3>Catálogo aprovado ({candidates.length})</h3><p className="selecao-dia-sub">Aprovação no catálogo não equivale a destaque editorial.</p></div><div className="selecao-dia-controls"><input aria-label="Buscar produto no catálogo aprovado" type="search" placeholder="Buscar por título…" className="selecao-search-input" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="selecao-filter-pills">{["all", "mercadolivre", "shopee", "aliexpress"].map((slug) => <button type="button" key={slug} className={`filter-pill ${marketplace === slug ? "active" : ""}`} aria-pressed={marketplace === slug} onClick={() => setMarketplace(slug)}>{slug === "all" ? "Todos" : marketplaceDef(slug)?.label ?? slug}</button>)}</div></div></div>
    {!filtered.length && <div className="empty-selecao-box">Nenhum produto encontrado.</div>}
    <div className="selecao-grid">{filtered.map(({ candidate, classification, heroRank }) => <article key={candidate.id} className={`selecao-card${editingId === candidate.id ? " editorial-card-editing" : ""}`}>
      <div className="selecao-card-thumb">{candidate.imageUrl ? <Image src={candidate.imageUrl} alt={candidate.title} fill sizes="(max-width: 768px) 100vw, 300px" className="selecao-img" /> : <div className="selecao-card-no-img">Sem foto</div>}<span className={`mp-badge-tag ${candidate.marketplace}`}>{marketplaceDef(candidate.marketplace)?.label ?? candidate.marketplace}</span></div>
      <div className="selecao-card-body"><h3 className="selecao-card-title"><a href={`/bizu/${candidate.slug}`} target="_blank" rel="noopener noreferrer">{candidate.title}</a></h3><div className="selecao-card-price"><strong className="current-price">{brl.format(candidate.priceCents / 100)}</strong></div><div className="selecao-card-meta">{candidate.ratingStar !== null && <span>★ {candidate.ratingStar.toFixed(1)}</span>}{candidate.salesCount !== null && <span>{candidate.salesCount} vendas</span>}{candidate.category && <span>{candidate.category}</span>}</div>
      {candidate.assessment && <p className="editorial-card-rationale">{candidate.assessment.publicRationale}</p>}
      {heroRank !== null && <p className="hero-rank-label">#{heroRank} entre os candidatos aptos à hero{heroRank > HERO_MAX_PRODUCTS ? " · além das três primeiras posições" : ""}</p>}
      <HeroClassificationDetails classification={classification} />
      {candidate.selectionBlockers.length > 0 && <div className="editorial-selection-blockers"><p>Para incluir numa edição editorial:</p><ul>{candidate.selectionBlockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}</ul></div>}
      <EvidenceDetails candidate={candidate} />
      <div className="selecao-card-actions"><a className="btn-card-link" href={candidate.productUrl} target="_blank" rel="noopener noreferrer nofollow">↗ Conferir anúncio</a><button type="button" disabled={!schemaReady || pending} onClick={() => setEditingId(editingId === candidate.id ? null : candidate.id)}>{candidate.assessment ? "Reavaliar" : "Avaliar"}</button><button type="button" disabled={!schemaReady || pending || !candidate.assessment || candidate.selectionBlockers.length > 0 || draft.length >= 24 || draft.some((item) => item.productId === candidate.id)} onClick={() => { if (candidate.assessment) changeDraft([...draft, { productId: candidate.id, assessmentId: candidate.assessment.id, destinations: ["home", "pauta"], context: "" }]); }}>Incluir no destaque</button></div>
      {editingId === candidate.id && <AssessmentForm key={`${candidate.id}-${candidate.assessment?.id ?? "new"}`} candidate={candidate} disabled={!schemaReady} onCancel={() => setEditingId(null)} onSaved={(updated) => { setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setFeedback("Avaliação salva. Confira os impedimentos antes de incluir no destaque."); if (draft.some((item) => item.productId === updated.id) && updated.assessment) changeDraft(draft.map((item) => item.productId === updated.id ? { ...item, assessmentId: updated.assessment!.id } : item)); }} />}
      </div>
    </article>)}</div>
  </section>;
}
