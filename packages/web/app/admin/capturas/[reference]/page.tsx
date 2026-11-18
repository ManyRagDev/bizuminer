import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageAccount } from "../../../../lib/page-account.ts";
import { inAccountScope } from "../../../../lib/account-scope.ts";
import { readCaptureActivity } from "../../../../lib/capture-activity-db.ts";
import { capturePathReference, captureListHref, captureDetailHref, captureDate, captureOriginLabels, captureStateLabels, captureValidationLabels, CaptureInputError } from "../../../../lib/capture-activity.ts";
import { curationOfferHref } from "../../../../lib/curation-navigation.ts";
import { marketplaceDef } from "../../../../lib/marketplaces.ts";
import AdminLink from "../../../_components/admin-link.tsx";
import TodayOperationStatus from '../../today-operation-status.tsx';
import "../captures.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Detalhe da captura | BizuMiner",robots:{index:false,follow:false}};
const amount=(value:number|null)=>value===null ? 'Não registrado' : value.toLocaleString('pt-BR');
const price=(fact:{priceCents:number|null;currency:string|null;priceType:string|null;priceMaxCents:number|null})=>{
  if(fact.priceCents===null) return 'Não registrado';
  if(fact.currency!=='BRL') return `${fact.priceCents} centavos · moeda não registrada em BRL`;
  const format=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
  const value=format(fact.priceCents);
  return fact.priceType==='from' ? `A partir de ${value}` : fact.priceType==='range' && fact.priceMaxCents!==null
    ? `${value} a ${format(fact.priceMaxCents)}` : fact.priceType==='exact' ? value : `${value} · tipo de preço não registrado`;
};
const phases:Record<string,string>={queued:'Na fila; início ainda não confirmado',capturing:'Recebendo ofertas',awaiting_browser:'Aguardando navegador',retry_wait:'Aguardando próxima tentativa',awaiting_authorization:'Aguardando autorização',awaiting_reconciliation:'Aguardando conferência',publishing:'Salvando fatos recebidos',affiliating:'Preparando vínculos afiliados',triaging:'Etapa de curadoria registrada no lote',finished:'Encerrada'};
export default async function CaptureDetailPage({params,searchParams}:{params:Promise<{reference:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const path=await params,query=await searchParams;
  let reference:string;try {reference=capturePathReference(path.reference);} catch {notFound();}
  const account=await pageAccount(query.conta);if(!account) notFound();
  let result;
  try {result=await inAccountScope(account,()=>readCaptureActivity(account,reference,query));}
  catch(error) {return <section className="admin-section capture-history"><h1>Detalhe da captura</h1><p role="alert">{error instanceof CaptureInputError ? 'A referência de página é inválida. Abra novamente o detalhe.' : 'Não foi possível consultar esta captura. O recebimento não foi repetido.'}</p>
    <AdminLink href={captureDetailHref(reference,account.tenantId)}>Consultar o detalhe novamente</AdminLink></section>;}
  if(!result) notFound();
  if(!result.available || !result.activity) return <section className="admin-section"><h1>Detalhe da captura</h1><p role="alert">O histórico unificado ainda não está disponível neste ambiente. Não é possível concluir se esta captura existe antes da atualização correspondente.</p></section>;
  const activity=result.activity,counts=activity.counts;
  return <div className="capture-history">
    <AdminLink href={captureListHref(account.tenantId,query)}>← Voltar às capturas</AdminLink>
    <header className="curation-workspace-header"><div><p className="eyebrow">{activity.purpose==='internal' ? activity.purposeLabel : captureOriginLabels[activity.origin]}</p>
      <h1>{activity.stores.map(store=>marketplaceDef(store)?.label??store).join(' · ') || 'Captura com loja não registrada'}</h1>
      <p><strong>{captureStateLabels[activity.state]}</strong> · consultado em {captureDate(result.consultedAt)}</p></div></header>
    <section className="admin-section"><h2>Resultado registrado do recebimento</h2>
      <dl className="capture-facts"><div><dt>{activity.origin==='individual' ? 'Leitura registrada' : 'Início'}</dt><dd>{captureDate(activity.startedAt)}</dd></div>
        <div><dt>Recebido no servidor</dt><dd>{captureDate(activity.receivedAt)}</dd></div><div><dt>Fim</dt><dd>{captureDate(activity.finishedAt)}</dd></div>
        <div><dt>Leitura no navegador</dt><dd>{captureDate(activity.clientCapturedAt)}</dd></div>
        <div><dt>Itens recebidos pelo servidor</dt><dd>{amount(counts.received)}</dd></div><div><dt>Itens válidos na entrada</dt><dd>{amount(counts.valid)}</dd></div>
        <div><dt>Recusados na validação</dt><dd>{amount(counts.rejected)}</dd></div><div><dt>Repetidos na entrada</dt><dd>{amount(counts.duplicates)}</dd></div>
        <div><dt>Observações salvas</dt><dd>{amount(counts.observationsSaved)}</dd></div><div><dt>Produtos distintos com vínculo ao recebimento</dt><dd>{amount(counts.products)}</dd></div>
        <div><dt>Produtos criados</dt><dd>{amount(counts.productsCreated)}</dd></div><div><dt>Produtos atualizados</dt><dd>{amount(counts.productsUpdated)}</dd></div>
      </dl>
      {activity.issue && <p role="status">{activity.issue}</p>}
      {activity.phase && <p>Etapa registrada no lote: {phases[activity.phase]}. Este registro não representa sozinho o estado atual de toda a curadoria.</p>}
      {activity.deadline && <p>Prazo registrado: {captureDate(activity.deadline)}.</p>}{activity.nextAttemptAt && <p>Próxima tentativa registrada: {captureDate(activity.nextAttemptAt)}.</p>}
      {result.sourceUrl && <p><a href={result.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Página de origem no navegador ↗</a></p>}
      {activity.receiptVersion===1 && <p>Recibo antigo: contagens de validação e criação não foram registradas. Observações são associadas somente quando a identidade exata do envio pode ser comprovada.</p>}
      {!result.historicalComplete && <p role="status">Não foi possível associar todos os produtos a observações deste envio. {result.linkedProducts} produtos têm fatos históricos comprovados; os dados atuais abaixo são apresentados separadamente.</p>}
      {result.validation.length>0 && <details><summary>Diagnóstico da entrada · {result.validation.length} ocorrências</summary><p>Recusa na entrada não é rejeição editorial.</p><ul>{result.validation.map((item,index)=><li key={index}>Item {item.index}: {item.status==='duplicate'?'repetido':'recusado'} · {captureValidationLabels[item.reason]}</li>)}</ul></details>}
      {result.searchSummary && <p>{result.searchSummary.total} buscas: {result.searchSummary.ok} concluídas, {result.searchSummary.error} com falha, {result.searchSummary.running} em execução. Itens informados nas buscas: {result.searchSummary.reported}; o mesmo produto pode aparecer em várias buscas.</p>}
    </section>
    {result.products.items.length>0&&<TodayOperationStatus key={`${account.tenantId}:${reference}:${query.produtosDepois??''}`} tenantId={account.tenantId} productIds={result.products.items.map(p=>p.id)}/>}
    <section className="admin-section"><h2>Produtos e fatos desta captura</h2><p>O fato deste recebimento fica separado do preço observado mais recentemente. O andamento acima acompanha os produtos desta página; as contagens do recebimento são de toda a captura.</p>
      {!result.products.items.length && <p>Nenhum produto com fato salvo foi encontrado nesta captura. Itens ainda em preparação não são apresentados como observações salvas.</p>}
      <ol className="capture-product-list">{result.products.items.map(product=><li key={product.id}><h3>{product.original?.title??product.title}</h3>
        <p>Fato deste recebimento: {product.original ? `${price(product.original)} · ${captureDate(product.original.observedAt)} · ${product.original.observations} observação(ões), mostrando a mais recente deste recebimento.` : 'Observação histórica não comprovada.'}</p>
        <p>Último preço observado do produto: {product.current ? `${price(product.current)} · ${captureDate(product.current.observedAt)}` : 'Indisponível nesta consulta.'}</p>
        <AdminLink href={curationOfferHref(product.id,account.tenantId,{optionKey:product.original?.optionKey??undefined,origin:'capturas',captureRef:reference,captureReturn:captureDetailHref(reference,account.tenantId,query).split('?')[1]})}>Conferir situação atual e impedimentos →</AdminLink>
      </li>)}</ol>
      <nav className="capture-links" aria-label="Páginas de produtos">{query.produtosDepois && <AdminLink href={captureDetailHref(reference,account.tenantId,{...query,produtosDepois:''})}>Primeiros produtos</AdminLink>}
        {result.products.nextCursor && <AdminLink href={captureDetailHref(reference,account.tenantId,{...query,produtosDepois:result.products.nextCursor})}>Próximos produtos →</AdminLink>}</nav>
    </section>
    {result.searchSummary && <section className="admin-section"><h2>Buscas deste lote</h2><ul className="capture-product-list">{result.searches.items.map(search=><li key={search.id}>
      <strong>{marketplaceDef(search.marketplace)?.label??search.marketplace} · {search.purpose}</strong><p>{captureDate(search.startedAt)} · {captureStateLabels[search.state]} · {search.itemsReported} itens informados</p>
      {search.issue && <p>{search.issue}</p>}<details><summary>Referência da busca</summary><code>{search.id}</code></details></li>)}</ul>
      <nav className="capture-links" aria-label="Páginas de buscas">{query.buscasDepois && <AdminLink href={captureDetailHref(reference,account.tenantId,{...query,buscasDepois:''})}>Primeiras buscas</AdminLink>}
        {result.searches.nextCursor && <AdminLink href={captureDetailHref(reference,account.tenantId,{...query,buscasDepois:result.searches.nextCursor})}>Próximas buscas →</AdminLink>}</nav></section>}
    <section className="admin-section"><h2>Continuar a operação</h2><div className="capture-links"><AdminLink href={`/admin/curadoria?aba=problemas&conta=${encodeURIComponent(account.tenantId)}`}>Conferir avaliações incertas</AdminLink>
      <AdminLink href={`/pauta?conta=${encodeURIComponent(account.tenantId)}`}>Conferir pauta</AdminLink><AdminLink href={captureDetailHref(reference,account.tenantId,query)}>Atualizar consulta</AdminLink></div>
      <p>A consulta não repete o recebimento nem libera tentativas incertas. O histórico permanece disponível depois de fechar o painel.</p>
      <details><summary>Referência persistida da atividade</summary><code>{reference}</code></details></section>
  </div>;
}
