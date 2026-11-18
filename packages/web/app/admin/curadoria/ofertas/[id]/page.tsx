import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageAccount } from "../../../../../lib/page-account.ts";
import { inAccountScope } from "../../../../../lib/account-scope.ts";
import { readOperationalOffer } from "../../../../../lib/pauta-db.ts";
import { curationIssuesHref, curationOfferHref } from "../../../../../lib/curation-navigation.ts";
import { marketplaceDef } from "../../../../../lib/marketplaces.ts";
import { offerPriceLabel } from "../../../../../lib/offer-price.ts";
import AdminLink from "../../../../_components/admin-link.tsx";
import { AdminDraftScope } from "../../../draft-provider.tsx";
import OfferConfirmation from "../../offer-confirmation.tsx";
import { captureReference, captureDetailHref, captureQuery, captureFilters } from "../../../../../lib/capture-activity.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conferir oferta | BizuMiner", robots: { index: false, follow: false } };

export default async function OperationalOfferPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conta?: string; opcao?: string; origem?: string; canal?: string; captura?:string; retornoCaptura?:string;retornoProblemas?:string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)
    || query.opcao !== undefined && (!query.opcao || query.opcao.length > 300)) notFound();
  const account = await pageAccount(query.conta);
  if (!account) notFound();
  const offer = await inAccountScope(account, () => readOperationalOffer(account, id));
  if (!offer) notFound();
  const { candidate, channels } = offer;
  const store = marketplaceDef(candidate.marketplace)?.label ?? candidate.marketplace;
  const channel = query.canal === "stories" ? "stories" : "whatsapp";
  const pautaHref = `/pauta?${new URLSearchParams({ conta: account.tenantId, canal: channel })}`;
  let captureBack:string|null=null;
  if(query.origem==='capturas' && query.captura) {
    try {
      const reference=captureReference(query.captura).reference;
      const context=query.retornoCaptura && query.retornoCaptura.length<=6000 ? captureQuery(new URLSearchParams(query.retornoCaptura)) : {};
      captureFilters(context);
      captureBack=captureDetailHref(reference,account.tenantId,context);
    } catch { /* Invalid return context never becomes an arbitrary URL. */ }
  }
  let issuesBack=curationIssuesHref(account.tenantId);
  if(query.origem==='avaliacoes'&&query.retornoProblemas&&query.retornoProblemas.length<=6000){
    try{const context=captureQuery(new URLSearchParams(query.retornoProblemas)),target=new URLSearchParams({aba:'problemas',conta:account.tenantId});
      if(context.categoria&&/^[a-z_]{1,40}$/.test(context.categoria))target.set('categoria',context.categoria);
      if(context.depois&&/^[\w-]{1,2000}$/.test(context.depois))target.set('depois',context.depois);
      issuesBack=`/admin/curadoria?${target}#avaliacoes-incertas`;
    }catch{/* A malformed return value never becomes an external destination. */}
  }
  const backHref = captureBack ?? (query.origem === "pauta" ? pautaHref : query.origem === "avaliacoes"
    ? issuesBack
    : `/admin/curadoria?${new URLSearchParams({ aba: "selecao", conta: account.tenantId })}`);
  const optionMismatch = query.opcao !== undefined && query.opcao !== (candidate.offerOptionKey ?? "listing");
  const date = (value: string | Date) => new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));

  return <AdminDraftScope account={account.tenantId} actor={account.actorAppUserId ?? ""}>
    <div className="curation-page">
      <AdminLink href={backHref}>{captureBack ? "← Voltar à captura" : query.origem === "pauta" ? "← Voltar à pauta" : query.origem === "avaliacoes" ? "← Voltar às avaliações incertas" : "← Voltar à curadoria"}</AdminLink>
      <header className="curation-workspace-header">
        <div><p className="eyebrow">Conferência operacional · {store}</p><h1>{candidate.displayTitle ?? candidate.title}</h1>
          <p>Veja o que impede esta oferta e confira seus dados. Abrir esta página não inicia avaliação nem prepara links.</p></div>
      </header>
      {optionMismatch && <section className="curation-area-intro" role="alert">
        <h2>A opção solicitada não é a opção atual da oferta</h2>
        <p>Opção solicitada: {query.opcao}. Os dados abaixo são da opção atual: {candidate.offerOptionLabel ?? candidate.offerOptionKey ?? "listagem"}. Nenhuma opção foi alterada.</p>
        <AdminLink href={curationOfferHref(id,account.tenantId,{origin:captureBack ? 'capturas' : query.origem === "pauta" ? "pauta" : query.origem === "avaliacoes" ? "avaliacoes" : undefined,captureRef:captureBack ? query.captura : undefined,captureReturn:captureBack?.split('?')[1],issueReturn:query.origem==='avaliacoes'?issuesBack.split('?')[1]?.split('#')[0]:undefined,channel})}>Abrir a opção atual para uma nova conferência</AdminLink>
      </section>}
      <section className="curation-area-intro" aria-label="Dados recebidos da oferta">
        <h2>Dados da oferta</h2>
        <p><strong>{offerPriceLabel(candidate)}</strong></p>
        <dl>
          <dt>Opção</dt><dd>{candidate.offerOptionLabel ?? "Configuração da listagem; confira antes de fixar uma opção"}</dd>
          <dt>Condições</dt><dd>{candidate.offerConditions || "Confira as condições na loja."}</dd>
          <dt>Último preço observado</dt><dd>{candidate.evidenceObservedAt ? date(candidate.evidenceObservedAt) : "Sem observação disponível"}</dd>
        </dl>
        <a href={candidate.productUrl} target="_blank" rel="noopener noreferrer nofollow">Abrir o anúncio na loja ↗</a>
        {!optionMismatch && <OfferConfirmation candidate={JSON.parse(JSON.stringify(candidate))} />}
      </section>
      <section className="curation-area-intro" aria-label="Situação do processamento">
        <h2>Processamento e conexão</h2>
        {offer.processingAvailable===false&&<p role="alert">Não foi possível consultar o processamento deste produto. Os dados da oferta continuam disponíveis.</p>}
        {(offer.uncertain??0) > 0 && <p>{offer.uncertain} avaliação(ões) com resultado incerto. <AdminLink href={curationIssuesHref(account.tenantId)}>Conferir avaliações incertas</AdminLink></p>}
        {offer.evaluationRunning && <p>Há avaliação em execução para este produto.</p>}
        {offer.evaluationQueued && <p>Há avaliação na fila para este produto; o início ainda não está confirmado.</p>}
        {!offer.configured && <p>A conexão afiliada de {store} ainda não está configurada e ativa nesta conta. Uma nova captura não substitui essa configuração.</p>}
        <AdminLink href={`/admin/onboarding?${new URLSearchParams({ conta: account.tenantId })}`}>Conferir a conexão desta loja</AdminLink>
      </section>
      <section className="curation-area-intro" aria-label="Situação na pauta">
        <h2>Por que aparece ou fica fora da pauta</h2>
        {channels.map(state => <div key={state.channel}>
          <h3>{state.channel === "whatsapp" ? "WhatsApp" : "Stories"}</h3>
          {state.selected ? <p>Está na seleção deste canal no momento da consulta.</p>
            : <ul>{state.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </div>)}
        <AdminLink href={pautaHref}>Conferir pauta de divulgação →</AdminLink>
        <p className="curation-muted">Consultado em {date(offer.consultedAt)}. A seleção pode mudar; avaliação e aprovação no catálogo não garantem presença em cada canal.</p>
      </section>
    </div>
  </AdminDraftScope>;
}
