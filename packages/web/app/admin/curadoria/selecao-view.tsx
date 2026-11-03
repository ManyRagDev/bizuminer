"use client";
import { useAdminDraftState } from "../draft-provider.tsx";
import OfferConfirmation from "./offer-confirmation.tsx";

import Image from "next/image";
import { useEffect,useMemo, useState, useTransition, type FormEvent } from "react";
import {
  EDITORIAL_DIMENSIONS,
  EDITORIAL_MAX_PRODUCTS,
  EDITORIAL_LEVELS,
  hasSuperiorityClaim,
  type EditorialAssessmentInput,
  type EditorialCandidate,
  type EditorialSelection,
} from "../../../lib/editorial-selection.ts";
import { saveEditorialAssessmentAction, replaceEditorialSelectionAction } from "./actions.ts";
import { marketplaceDef } from "../../../lib/marketplaces.ts";
import { offerPriceLabel, offerPriceNote } from "../../../lib/offer-price.ts";
import { rankHeroCandidates, type HeroClassification } from "../../../lib/hero-ranking.ts";
import { composeHomepage, homepageClarityBlockers } from "../../../lib/homepage-policy.ts";
import HomeBanner from "../../_components/home-banner";
import { coverBlockers, selectCoverProduct } from "../../../lib/home-cover";
import { COVER_HEADLINE_MAX_LENGTH, COVER_DESCRIPTION_MAX_LENGTH, COVER_TITLE_MAX_LENGTH } from "../../../lib/product-presentation";
import { HERO_MAX_PRODUCTS, HERO_POLICY_VERSION, HERO_RUBRIC, HERO_WEIGHTS } from "../../../lib/hero-policy.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function errorMessage(error: string): string {
  const messages: Record<string, string> = {
    forbidden: "Você não tem permissão para alterar a curadoria.",
    schema_not_ready: "A migração da seleção ainda não foi aplicada.",
    migration_required: "A migração da seleção ainda não foi aplicada.",
    evidence_changed: "O anúncio mudou desde o início da revisão. Atualize a página e avalie as novas evidências.",
    assessment_conflict: "Outra revisão foi salva enquanto você editava. Atualize a página antes de publicar.",
    presentation_migration_required: "A migração da ficha editorial ainda não foi aplicada neste ambiente.",
    invalid_presentation: "Confira o título (3–500), a ressalva (até 1.000) e, se preparada, a chamada de capa (3–72 caracteres).",
    presentation_requires_durable_copy: "A ficha duradoura deve explicar uso e limitações. Registre preço, desconto e comparações na justificativa da oferta.",
    product_not_approved: "O produto deixou de estar aprovado no catálogo. Atualize a página.",
    assessment_superseded: "Há uma avaliação mais recente deste produto. Atualize a página e prepare a seleção com a revisão atual.",
    assessment_not_found: "Uma avaliação ou produto desta seleção não está mais disponível. Atualize a página.",
    selection_item_blocked: "Um destaque ficou inválido ou ganhou um impedimento. Atualize a página e revise os itens antes de ativar.",
    selection_conflict: "A seleção foi alterada por outra sessão. Atualize a página antes de ativar.",
    stale_assessment: "As evidências mudaram após a avaliação. Revise o produto.",
    invalid_destinations: "Cada destaque precisa ter ao menos um destino.",
    destination_context_required: "Explique o contexto dos produtos destinados somente à home ou somente à pauta.",
    selection_limit: `A seleção aceita até ${EDITORIAL_MAX_PRODUCTS} produtos.`,
    assessment_explanation_required: "Preencha público, benefício, conteúdo da compra e justificativa pública.",
    invalid_critical_doubts: "Registre no máximo 20 dúvidas, cada uma com 3 a 500 caracteres.",
    invalid_max_price: "Informe um preço máximo aceitável válido.",
    invalid_hero_policy: "Atualize a página para usar a rubrica atual da hero.",
    superiority_claim_requires_comparative_basis: "Alegações de superioridade (ex.: 'melhor', 'campeã', 'mais barato') exigem registrar a base comparativa com produtos concorrentes.",
    comparative_basis_alternative_not_found: "Uma ou mais alternativas da base comparativa não existem ou pertencem a outra conta.",
    comparative_basis_alternative_expired: "As alternativas comparadas precisam ter preço verificado nas últimas 48 horas.",
    comparative_basis_alternative_not_approved: "Todas as alternativas comparadas devem estar aprovadas na curadoria.",
    comparative_basis_alternative_changed: "Uma das alternativas teve o preço ou configuração alterado e exige nova revisão.",
    comparative_basis_scope_or_price_required: "Informe o recorte de uso ou faixa de preço da comparação.",
    comparative_basis_criteria_required: "Informe ao menos um critério objetivo de comparação.",
    comparative_basis_references_required: "As referências atuais de oferta e configuração são obrigatórias.",
    comparative_basis_rationale_required: "Informe a justificativa editorial da comparação.",
    comparative_basis_rationale_must_be_distinct: "A justificativa editorial da comparação deve ser própria e distinta da alegação pública.",
    comparative_basis_alternatives_required: "Informe ao menos um produto alternativo para sustentar a alegação.",
    alternative_cannot_be_self: "O produto não pode ser comparado contra si mesmo.",
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
    <p>Política individual {classification.policyVersion}. A seleção final também exige clareza da compra e variedade entre famílias. Avaliações editoriais válidas têm prioridade; os sinais do catálogo ordenam produtos ainda não avaliados.</p>
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
    expectedTenantId:candidate.tenantId,productId: candidate.id,
    evidenceFingerprint: candidate.evidenceFingerprint,
    expectedAssessmentId: previous?.id ?? null,
    presentation: { status: "draft", title: previous?.presentation?.title ?? "", caveat: previous?.presentation?.caveat ?? "", ...(previous?.presentation?.cover ? { cover: { ...previous.presentation.cover, imageApproved: false } } : {}) },
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
  const draftKey=`assessment:${candidate.id}:${candidate.assessment?.id ?? "new"}`;
  const [input, setInput] = useAdminDraftState(draftKey+":input",() => assessmentFrom(candidate));
  const [maxPrice, setMaxPrice] = useAdminDraftState(draftKey+":maxPrice",() => (input.maxPriceCents / 100).toFixed(2));
  const [doubts, setDoubts] = useAdminDraftState(draftKey+":doubts",input.criticalDoubts.join("\n"));
  const [altIdsText, setAltIdsText] = useAdminDraftState(draftKey+":altIdsText",() => candidate.assessment?.comparativeBasis?.alternativeProductIds?.join("\n") ?? "");
  const [usageScope, setUsageScope] = useAdminDraftState(draftKey+":usageScope",() => candidate.assessment?.comparativeBasis?.usageScope ?? "");
  const [minPriceRange, setMinPriceRange] = useAdminDraftState(draftKey+":minPriceRange",() => candidate.assessment?.comparativeBasis?.priceRange?.minCents != null ? (candidate.assessment.comparativeBasis.priceRange.minCents / 100).toFixed(2) : "");
  const [maxPriceRange, setMaxPriceRange] = useAdminDraftState(draftKey+":maxPriceRange",() => candidate.assessment?.comparativeBasis?.priceRange?.maxCents != null ? (candidate.assessment.comparativeBasis.priceRange.maxCents / 100).toFixed(2) : "");
  const [criteriaText, setCriteriaText] = useAdminDraftState(draftKey+":criteriaText",() => candidate.assessment?.comparativeBasis?.criteria?.join("\n") ?? "");
  const [checkedAtText, setCheckedAtText] = useAdminDraftState(draftKey+":checkedAtText",() => candidate.assessment?.comparativeBasis?.checkedAt ? candidate.assessment.comparativeBasis.checkedAt.slice(0, 16) : new Date().toISOString().slice(0, 16));
  const [comparativeRationale, setComparativeRationale] = useAdminDraftState(draftKey+":comparativeRationale",() => candidate.assessment?.comparativeBasis?.rationale ?? "");
  const [feedback, setFeedback] = useState("");
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const evidenceChanged=input.evidenceFingerprint!==candidate.evidenceFingerprint || (input.expectedAssessmentId ?? null)!==(candidate.assessment?.id ?? null);
  const showComparative = hasSuperiorityClaim(input.publicRationale) || altIdsText.trim().length > 0;
  const coverDraft = {
    ...candidate,
    displayTitle: input.presentation?.title.trim(),
    titleOrigin: "editorial" as const,
    editorialRevisionId: "preview",
    benefit: input.benefit,
    coverHeadline: input.presentation?.cover?.headline,
    coverImageApproved: input.presentation?.cover?.imageApproved,
  };
  const coverIssues = coverBlockers(coverDraft);


  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.presentation?.status === "published" && previewSignature !== JSON.stringify(input)) { setFeedback("Confira a prévia atual antes de publicar a ficha."); return; }
    const cents = Math.round(Number(maxPrice.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) { setFeedback("Informe um preço máximo válido."); return; }
    const hasClaim = hasSuperiorityClaim(input.publicRationale);
    const altIds = altIdsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const criteria = criteriaText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const minCents = minPriceRange.trim() ? Math.round(Number(minPriceRange.replace(",", ".")) * 100) : null;
    const maxCents = maxPriceRange.trim() ? Math.round(Number(maxPriceRange.replace(",", ".")) * 100) : null;
    const priceRange = (minCents !== null || maxCents !== null) ? { minCents, maxCents } : null;

    const comparativeBasis = (hasClaim || altIds.length > 0)
      ? {
          version: "v1",
          candidateProductId: candidate.id,
          alternativeProductIds: altIds,
          usageScope: usageScope.trim() || null,
          priceRange,
          criteria,
          checkedAt: checkedAtText ? new Date(checkedAtText).toISOString() : new Date().toISOString(),
          rationale: comparativeRationale.trim(),
        }
      : null;

    startTransition(async () => {
      const result = await saveEditorialAssessmentAction({
        ...input,
        comparativeBasis,
        maxPriceCents: cents,
        criticalDoubts: doubts.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      if (!result.ok) { setFeedback(errorMessage(result.error)); return; }
      if (!result.candidate) { setFeedback("O produto deixou de estar disponível para seleção. Atualize a página."); return; }
      onSaved(result.candidate);
    });
  }

  return <form className="editorial-assessment-form" onSubmit={submit}>
    <h4>Avaliação editorial</h4>
    <p>Ao salvar, canais com seleção automática podem usar esta avaliação. O destino da ficha revisada é definido separadamente abaixo.</p>
    {evidenceChanged && <div role="alert"><p>Há novos dados ou uma nova revisão. Seu rascunho foi preservado. Confira a oferta atual antes de salvar outra avaliação.</p>
      <button type="button" onClick={()=>{setInput({...input,evidenceFingerprint:candidate.evidenceFingerprint,expectedAssessmentId:candidate.assessment?.id ?? null});setPreviewSignature(null);}}>Conferi os novos dados e quero revisar este rascunho</button></div>}
    <p>Registre fatos e suas fontes. Informações que o anúncio não permite confirmar continuam desconhecidas.</p>
    <fieldset>
      <legend>Ficha do produto · permanece disponível fora da seleção da home</legend>
      <p><b>Título da fonte:</b> {candidate.title}</p>
      <p>Preserve modelo, capacidade, compatibilidade e quantidade indispensáveis. A recaptura mantém a revisão; mudança de configuração exige nova conferência.</p>
      {candidate.assessment?.presentation && <p>Última revisão: {candidate.assessment.presentationInvalidatedAt ? "pendente de nova conferência: a configuração ou identidade mudou" : candidate.assessment.presentation.status === "published" ? "publicada, sujeita à validade das evidências" : candidate.assessment.presentation.status === "withdrawn" ? "retirada" : "rascunho"}.</p>}
      <label>Título editorial<input maxLength={500} value={input.presentation?.title ?? ""} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, title: event.target.value } }))} /></label>
      <label>Ressalva pública · não compre se…<textarea maxLength={1000} value={input.presentation?.caveat ?? ""} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, caveat: event.target.value } }))} /><small>Opcional. Somente limitações confirmadas; dúvidas internas ficam no campo próprio.</small></label>
      <label>Destino desta revisão<select value={input.presentation?.status ?? "draft"} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, status: event.target.value as "draft" | "published" | "withdrawn" } }))}>
        <option value="draft">Guardar rascunho (mantém a ficha publicada anterior)</option><option value="published">Publicar ficha revisada</option><option value="withdrawn">Retirar ficha pública (mantém o produto no catálogo)</option>
      </select></label>
    </fieldset>
    <fieldset>
      <legend>Capa da home · opcional</legend>
      <p>Uma imagem grande, uma chamada curta e um benefício. A capa usa o primeiro produto apto entre os destaques da edição; preparar esta ficha não a coloca na home automaticamente.</p>
      <label><input type="checkbox" checked={Boolean(input.presentation?.cover)} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, cover: event.target.checked ? { headline: "", imageApproved: false } : undefined } }))} />Preparar este produto para a capa</label>
      {input.presentation?.cover && <>
        <label>Chamada da capa<textarea minLength={3} maxLength={COVER_HEADLINE_MAX_LENGTH} value={input.presentation.cover.headline} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, cover: { ...current.presentation!.cover!, headline: event.target.value } } }))} placeholder="Ex.: O mesmo filme. Dois fones." /><small>{input.presentation.cover.headline.length}/{COVER_HEADLINE_MAX_LENGTH} · explique o uso sem inventar vantagens ou prometer preço.</small></label>
        <label><input type="checkbox" checked={input.presentation.cover.imageApproved} onChange={event => setInput(current => ({ ...current, presentation: { ...current.presentation!, cover: { ...current.presentation!.cover!, imageApproved: event.target.checked } } }))} />Conferi a foto: nítida, sem texto promocional e fiel à versão e aos itens incluídos.</label>
        <p><small>A confirmação da foto precisa ser refeita a cada revisão. Para a capa, o título editorial deve ter até {COVER_TITLE_MAX_LENGTH} caracteres e o benefício até {COVER_DESCRIPTION_MAX_LENGTH}; o preço e a moeda precisam estar confirmados e atuais.</small></p>
        <details className="editorial-cover-preview"><summary>Ver composição da capa com esta foto</summary>
          <HomeBanner product={coverDraft} selectionVersion={null} onProductClick={() => {}} preview />
          {coverIssues.length > 0 ? <><p>Antes de disputar a capa:</p><ul>{coverIssues.map(issue => <li key={issue}>{issue}</li>)}</ul></> : <p>Apresentação pronta. Publique a ficha e inclua o produto na seleção; os critérios da oferta continuam valendo.</p>}
        </details>
      </>}
    </fieldset>
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
    {showComparative && (
      <fieldset className="comparative-basis-fieldset">
        <legend>Base comparativa (obrigatória para alegações de superioridade ou preço relativo)</legend>
        <p><small>Alegações como &quot;melhor&quot;, &quot;campeã&quot; ou &quot;mais barato&quot; exigem sustentar a comparação contra alternativas válidas da mesma conta observadas nas últimas 48 horas com critérios objetivos.</small></p>
        <label>
          Recorte de uso avaliado (ex.: cafeteiras expresso domésticas com bomba de pressão)
          <input
            type="text"
            value={usageScope}
            onChange={(e) => setUsageScope(e.target.value)}
            placeholder="Recorte de uso ou categoria comparável"
          />
        </label>
        <div style={{ display: "flex", gap: "12px" }}>
          <label style={{ flex: 1 }}>
            Faixa de preço mínima (R$)
            <input
              type="text"
              inputMode="decimal"
              value={minPriceRange}
              onChange={(e) => setMinPriceRange(e.target.value)}
              placeholder="0,00"
            />
          </label>
          <label style={{ flex: 1 }}>
            Faixa de preço máxima (R$)
            <input
              type="text"
              inputMode="decimal"
              value={maxPriceRange}
              onChange={(e) => setMaxPriceRange(e.target.value)}
              placeholder="1000,00"
            />
          </label>
        </div>
        <label>
          Critérios explícitos de comparação (ao menos um, separados por linha ou vírgula)
          <textarea
            required={hasSuperiorityClaim(input.publicRationale)}
            value={criteriaText}
            onChange={(e) => setCriteriaText(e.target.value)}
            placeholder="Ex.: pressão 15 bar&#10;bico vaporizador de leite em inox"
          />
        </label>
        <label>
          IDs das alternativas comparadas (um por linha ou separados por vírgula)
          <textarea
            required={hasSuperiorityClaim(input.publicRationale)}
            value={altIdsText}
            onChange={(e) => setAltIdsText(e.target.value)}
            placeholder="Ex.: prod_1&#10;prod_2"
          />
        </label>
        <label>
          Data/hora da checagem
          <input
            type="datetime-local"
            value={checkedAtText}
            onChange={(e) => setCheckedAtText(e.target.value)}
          />
        </label>
        <label>
          Justificativa comparativa humana
          <textarea
            required={hasSuperiorityClaim(input.publicRationale)}
            value={comparativeRationale}
            onChange={(e) => setComparativeRationale(e.target.value)}
            placeholder="Por que esta oferta supera as alternativas indicadas no recorte avaliado..."
          />
        </label>
        <p><small>Nota: O servidor vinculará e revalidará as referências canônicas de oferta (preço, data e configuração) do candidato e de cada alternativa no momento do salvamento.</small></p>
      </fieldset>
    )}
    <label>Preço máximo aceitável (R$)<input required inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /><small>Acima deste valor, o destaque será bloqueado até nova avaliação.</small></label>
    <label>Dúvidas essenciais em aberto (uma por linha)<textarea maxLength={4000} value={doubts} onChange={(event) => setDoubts(event.target.value)} /><small>Dúvidas essenciais e níveis fracos ou desconhecidos impedem o destaque.</small></label>
    <fieldset>
      <legend>Prévia da apresentação</legend>
      <p>Público, benefício e conteúdo da compra acima compõem a ficha. Use textos que continuem verdadeiros quando o preço mudar.</p>
      <button type="button" onClick={() => setPreviewSignature(JSON.stringify(input))}>Conferir capa, card, detalhe e compartilhamento</button>
      {previewSignature === JSON.stringify(input) && <div aria-live="polite">
        {input.presentation?.cover && <article><h4>Capa</h4><p>{input.presentation.cover.headline}</p><p>Foto {input.presentation.cover.imageApproved ? "aprovada nesta revisão" : "ainda não aprovada"}.</p>{coverIssues.length > 0 && <ul>{coverIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</article>}
        <article><h4>Card</h4><strong>{input.presentation?.title.trim() || candidate.title}</strong><p>{input.benefit || "Benefício ainda não preenchido."}</p><p>{offerPriceLabel(candidate)} · preço da observação atual</p>{offerPriceNote(candidate) && <p>{offerPriceNote(candidate)}</p>}</article>
        <article><h4>Detalhe</h4><strong>{input.presentation?.title.trim() || candidate.title}</strong><p>Para quem: {input.audience || "Não informado"}</p><p>Conteúdo: {input.purchaseContents || "Não confirmado"}</p>{input.presentation?.caveat && <p>Ressalva: {input.presentation.caveat}</p>}</article>
        <article><h4>Compartilhamento</h4><strong>{input.presentation?.title.trim() || candidate.title} · BizuMiner</strong><p>{input.benefit}</p></article>
        <p>Publicar confirma sua revisão humana destes textos e evidências. A justificativa de preço permanece separada.</p>
      </div>}
    </fieldset>
    {feedback && <p role="alert">{feedback}</p>}
    <div className="selecao-card-actions"><button type="submit" disabled={pending || disabled || evidenceChanged || (input.presentation?.status === "published" && previewSignature !== JSON.stringify(input))}>{pending ? "Salvando…" : input.presentation?.status === "published" ? "Salvar avaliação e publicar ficha" : input.presentation?.status === "withdrawn" ? "Salvar e retirar ficha pública" : "Salvar avaliação e rascunho"}</button><button type="button" disabled={pending} onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export default function SelecaoView({ initialCandidates, initialSelection, schemaReady, catalogHeroActive, initialEditingId,reviewOnly=false }: {
  initialCandidates: EditorialCandidate[]; initialSelection: EditorialSelection | null; schemaReady: boolean; catalogHeroActive: boolean; initialEditingId?: string;reviewOnly?:boolean;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  useEffect(()=>setCandidates(initialCandidates),[initialCandidates]);
  const [selection, setSelection] = useState(initialSelection);
  const [draft, setDraft] = useState(() => draftFrom(initialSelection));
  const [validHours, setValidHours] = useState("24");
  const [search, setSearch] = useState(() => initialCandidates.find(candidate => candidate.id === initialEditingId)?.title ?? "");
  const [marketplace, setMarketplace] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(() => initialCandidates.some(candidate => candidate.id === initialEditingId) ? initialEditingId! : null);
  const [feedback, setFeedback] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(candidates.map((candidate) => [candidate.id, candidate])), [candidates]);
  const ranked = useMemo(() => rankHeroCandidates(candidates), [candidates]);
  const filtered = useMemo(() => ranked.filter(({ candidate }) => (marketplace === "all" || candidate.marketplace === marketplace) && candidate.title.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [ranked, marketplace, search]);
  const heroPreview = useMemo(() => {
    if(reviewOnly)return [];
    if (catalogHeroActive && !selection && !dirty) return composeHomepage(candidates).heroes;
    const pool = draft.filter((item) => item.destinations.includes("home") && byId.get(item.productId)?.assessment?.id === item.assessmentId)
      .map((item) => byId.get(item.productId)!);
    return composeHomepage(pool, new Date(), undefined, new Map(draft.map((item, position) => [item.productId, position]))).heroes;
  }, [draft, byId, catalogHeroActive, selection, dirty, candidates,reviewOnly]);

  function prepareBest() {
    const best = composeHomepage(candidates.filter((candidate) => candidate.assessment)).selected;
    const additions = best.filter(({ candidate }) => !draft.some((item) => item.productId === candidate.id));
    if (draft.length + additions.length > EDITORIAL_MAX_PRODUCTS) { setFeedback("Retire itens da seleção para abrir espaço aos melhores candidatos."); return; }
    if (!best.length) { setFeedback("Ainda não há avaliações válidas para montar uma edição editorial. Registre público, utilidade, valor, confiança e clareza; a seleção pode conter menos itens quando faltarem evidências."); return; }
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
    <div className="selecao-dia-header"><div><h2 id="selecao-dia-title" className="selecao-dia-heading">Seleção editorial</h2><p className="selecao-dia-sub">Confira os fatos da oferta e avalie público, utilidade, valor, confiança e clareza. A escolha de produtos e a ordem ficam nos controles de cada canal.</p></div></div>
    {!schemaReady && <p className="editorial-selection-alert" role="alert">A estrutura da seleção ainda não está disponível no banco. Avaliação e ativação permanecem desabilitadas até a migração ser aplicada.</p>}
    {feedback && <p className="editorial-selection-alert" role="status">{feedback}</p>}
    {!reviewOnly && <>
    <section className="hero-ranking-board" aria-labelledby="hero-ranking-title">
      <h3 id="hero-ranking-title">Candidatos à capa da home</h3>
      <p>Até {HERO_MAX_PRODUCTS} candidatos por ordem relativa. A capa mostra apenas o primeiro com ficha publicada, chamada curta, foto aprovada e dados confirmados. Sem candidato apto, entra a arte da marca.</p>
      <p>Público {HERO_WEIGHTS.audience}% · utilidade {HERO_WEIGHTS.utility}% · valor {HERO_WEIGHTS.value}% · confiança {HERO_WEIGHTS.confidence}% · clareza {HERO_WEIGHTS.clarity}%.</p>
      <p>{selectCoverProduct(heroPreview.map(entry => entry.candidate)) ? "Há um candidato com apresentação pronta para a capa." : "Esta prévia usaria a arte da marca: nenhum candidato reúne todos os requisitos da capa."}</p>
      {heroPreview.length ? (
        <ol style={{ paddingLeft: "20px", margin: "12px 0" }}>
          {heroPreview.map(({ candidate, classification }) => (
            <li key={candidate.id} style={{ marginBottom: "8px", lineHeight: "1.4" }}>
              <a
                href={`/bizu/${candidate.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 600, color: "var(--accent, #0070f3)", textDecoration: "none" }}
              >
                {candidate.title}
              </a>
              {" "}·{" "}
              <span style={{ fontSize: "0.8125rem", color: "var(--ink-muted, #71717a)" }}>
                {heroScoreLabel(classification)} · {classification.basis === "editorial" ? "avaliação editorial" : "sinais do catálogo"}
              </span>
              {" "}·{" "}
              <a
                href={candidate.productUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ fontSize: "0.75rem", color: "var(--ink-muted, #71717a)", textDecoration: "underline" }}
              >
                Ver na Loja ↗
              </a>
              {coverBlockers(candidate).length > 0 && <details><summary>O que falta para a capa</summary><ul>{coverBlockers(candidate).map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
            </li>
          ))}
        </ol>
      ) : (
        <p>Nenhum item válido nesta prévia. Ofertas desatualizadas ou com impedimentos de compra precisam de revisão.</p>
      )}
      <button type="button" disabled={!schemaReady || pending} onClick={prepareBest}>Preparar seleção com até {EDITORIAL_MAX_PRODUCTS} produtos</button>
      <p>Home e pauta compartilham até {EDITORIAL_MAX_PRODUCTS} produtos; a capa usa um destaque apto entre os {HERO_MAX_PRODUCTS} candidatos. Este botão prepara uma edição com candidatos já avaliados. Ao ativá-la, ela passa a controlar home e pauta; uma edição vazia ou vencida não é preenchida automaticamente pelo catálogo.</p>
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
    </>}
    <div className="selecao-dia-header"><div><h3>Produtos para avaliação ({candidates.length})</h3><p className="selecao-dia-sub">Aprovação no catálogo não equivale a destaque editorial.</p></div><div className="selecao-dia-controls"><input aria-label="Buscar produto no catálogo aprovado" type="search" placeholder="Buscar por título…" className="selecao-search-input" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="selecao-filter-pills">{["all", "mercadolivre", "shopee", "aliexpress"].map((slug) => <button type="button" key={slug} className={`filter-pill ${marketplace === slug ? "active" : ""}`} aria-pressed={marketplace === slug} onClick={() => setMarketplace(slug)}>{slug === "all" ? "Todos" : marketplaceDef(slug)?.label ?? slug}</button>)}</div></div></div>
    {!filtered.length && <div className="empty-selecao-box">Nenhum produto encontrado.</div>}
    <div className="selecao-grid">{filtered.map(({ candidate, classification, heroRank }) => <article key={candidate.id} id={`editorial-product-${candidate.id}`} className={`selecao-card${editingId === candidate.id ? " editorial-card-editing" : ""}`}>
      <div className="selecao-card-thumb">{candidate.imageUrl ? <Image src={candidate.imageUrl} alt={candidate.title} fill sizes="(max-width: 768px) 100vw, 300px" className="selecao-img" /> : <div className="selecao-card-no-img">Sem foto</div>}<span className={`mp-badge-tag ${candidate.marketplace}`}>{marketplaceDef(candidate.marketplace)?.label ?? candidate.marketplace}</span></div>
      <div className="selecao-card-body"><h3 className="selecao-card-title"><a href={`/bizu/${candidate.slug}`} target="_blank" rel="noopener noreferrer">{candidate.title}</a></h3><div className="selecao-card-price"><strong className="current-price">{offerPriceLabel(candidate)}</strong>{offerPriceNote(candidate) && <p>{offerPriceNote(candidate)}</p>}</div><div className="selecao-card-meta">{candidate.ratingStar !== null && <span>★ {candidate.ratingStar.toFixed(1)}</span>}{candidate.salesCount !== null && <span>{candidate.salesCount} vendas</span>}{candidate.category && <span>{candidate.category}</span>}</div>
      {candidate.assessment && <p className="editorial-card-rationale">{candidate.assessment.publicRationale}</p>}
      {heroRank !== null && <p className="hero-rank-label">#{heroRank} no ranking individual · a composição final considera clareza e variedade</p>}
      <HeroClassificationDetails classification={classification} />
      {homepageClarityBlockers(candidate).length > 0 && <p className="editorial-selection-blockers">Para a seleção automática: {homepageClarityBlockers(candidate).join(" ")}</p>}
      {candidate.selectionBlockers.length > 0 && <div className="editorial-selection-blockers"><p>Para incluir numa edição editorial:</p><ul>{candidate.selectionBlockers.map((blocker, index) => <li key={`${index}-${blocker}`}>{blocker}</li>)}</ul></div>}
      <EvidenceDetails candidate={candidate} />
      <div className="selecao-card-actions"><a className="btn-card-link" href={candidate.productUrl} target="_blank" rel="noopener noreferrer nofollow">↗ Conferir anúncio</a><button type="button" disabled={!schemaReady || pending} onClick={() => setEditingId(editingId === candidate.id ? null : candidate.id)}>{candidate.assessment ? "Reavaliar" : "Avaliar"}</button>{!reviewOnly && <button type="button" disabled={!schemaReady || pending || !candidate.assessment || candidate.selectionBlockers.length > 0 || draft.length >= EDITORIAL_MAX_PRODUCTS || draft.some((item) => item.productId === candidate.id)} onClick={() => { if (candidate.assessment) changeDraft([...draft, { productId: candidate.id, assessmentId: candidate.assessment.id, destinations: ["home", "pauta"], context: "" }]); }}>Incluir no destaque</button>}</div>
      <OfferConfirmation candidate={candidate} onOpen={()=>setEditingId(null)}/>
      {editingId === candidate.id && <AssessmentForm key={`${candidate.id}-${candidate.assessment?.id ?? "new"}`} candidate={candidate} disabled={!schemaReady} onCancel={() => setEditingId(null)} onSaved={(updated) => { setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setFeedback("Avaliação salva. Confira os impedimentos antes de incluir no destaque."); if (draft.some((item) => item.productId === updated.id) && updated.assessment) changeDraft(draft.map((item) => item.productId === updated.id ? { ...item, assessmentId: updated.assessment!.id } : item)); }} />}
      </div>
    </article>)}</div>
  </section>;
}
