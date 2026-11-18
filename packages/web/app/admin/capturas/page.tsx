import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageAccount } from "../../../lib/page-account.ts";
import { inAccountScope } from "../../../lib/account-scope.ts";
import { readCaptureActivities } from "../../../lib/capture-activity-db.ts";
import { captureFilters, captureListHref, captureOrigins, captureOriginLabels, captureStates, captureStateLabels, captureDate, CaptureInputError } from "../../../lib/capture-activity.ts";
import { MARKETPLACES } from "../../../lib/marketplaces.ts";
import { captureEnabled } from "../../../lib/platform-gates.ts";
import AdminLink from "../../_components/admin-link.tsx";
import ActivityList from "./activity-list.tsx";
import "./captures.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Capturas | BizuMiner",robots:{index:false,follow:false}};
export default async function CapturesPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query=await searchParams,account=await pageAccount(query.conta);
  if(!account) notFound();
  let result;
  try {captureFilters(query);result=await inAccountScope(account,()=>readCaptureActivities(account,query));}
  catch(error) {return <section className="admin-section capture-history"><h1>Capturas</h1><p role="alert">{error instanceof CaptureInputError
    ? "Os filtros ou a referência de página são inválidos. Abra o histórico novamente para continuar."
    : "Não foi possível consultar o histórico. Nenhuma captura foi iniciada por esta consulta."}</p>
    <AdminLink href={captureListHref(account.tenantId)}>Consultar histórico novamente</AdminLink></section>;}
  const filters=captureFilters(query),accountQuery=new URLSearchParams({conta:account.tenantId});
  return <div className="capture-history">
    <header className="curation-workspace-header"><div><p className="eyebrow">Recebimentos e operações</p><h1>Capturas</h1>
      <p>Localize cada importação da extensão e cada lote. O recebimento e o processamento posterior têm estados próprios.</p>
      <p>Consultado em {captureDate(result.consultedAt)} · horário de Brasília.</p></div></header>
    <section className="admin-section" aria-labelledby="capture-start-title"><h2 id="capture-start-title">Capturar nas lojas</h2>
      <p>Mercado Livre, Amazon e AliExpress: abra a loja e importe pela extensão pareada. O histórico começa quando o servidor aceita o envio.</p>
      <div className="capture-links"><a href="https://www.mercadolivre.com.br/ofertas" target="_blank" rel="noopener noreferrer">Abrir Mercado Livre ↗</a>
        <a href="https://www.amazon.com.br/deals" target="_blank" rel="noopener noreferrer">Abrir Amazon ↗</a>
        <a href="https://pt.aliexpress.com/" target="_blank" rel="noopener noreferrer">Abrir AliExpress ↗</a>
        <AdminLink href={`/admin?aba=captura-manual&${accountQuery}`}>Conferir extensão e pareamento</AdminLink></div>
      <p>Shopee pela API: {captureEnabled('shopee') ? 'captura disponível neste ambiente, sujeita à conexão da conta.' : 'captura indisponível neste ambiente.'}</p>
      <AdminLink href={`/admin?aba=rodagens&${accountQuery}#iniciar-captura`}>Abrir controles de captura e conexões →</AdminLink>
      <p className="curation-muted">Conexão afiliada e recebimento são coisas diferentes. Uma captura salva pode continuar sem vínculo para divulgação.</p>
    </section>
    <section className="admin-section" aria-labelledby="capture-history-title"><h2 id="capture-history-title">Histórico de capturas</h2>
      <form action="/admin/capturas" className="capture-filters"><input type="hidden" name="conta" value={account.tenantId}/>
        <label>Loja<select name="loja" defaultValue={filters.store??''}><option value="">Todas</option>{MARKETPLACES.map(store=><option key={store.slug} value={store.slug}>{store.label}</option>)}</select></label>
        <label>Origem<select name="origem" defaultValue={filters.origin??''}><option value="">Todas</option>{captureOrigins.map(origin=><option key={origin} value={origin}>{captureOriginLabels[origin]}</option>)}</select></label>
        <label>Finalidade<select name="finalidade" defaultValue={filters.purpose}><option value="capturas">Capturas e importações</option><option value="internas">Conferências e acompanhamento</option><option value="todas">Todas as atividades</option></select></label>
        <label>Situação do recebimento<select name="situacao" defaultValue={filters.state??''}><option value="">Todas</option>{captureStates.map(state=><option key={state} value={state}>{captureStateLabels[state]}</option>)}</select></label>
        <label>De<input type="date" name="de" defaultValue={filters.from??''}/></label><label>Até<input type="date" name="ate" defaultValue={filters.to??''}/></label>
        <label>Referência da captura<input name="referencia" maxLength={400} defaultValue={filters.reference??''}/></label><button type="submit">Filtrar histórico</button>
        <AdminLink href={captureListHref(account.tenantId)}>Limpar filtros</AdminLink>
      </form>
      <p>Conferências internas ficam em filtro próprio. Repetir o mesmo envio não cria outra atividade.</p>
      {!result.available ? <p role="alert">O histórico unificado ainda não está disponível neste ambiente. É necessária a atualização de banco correspondente; isto não significa ausência de capturas.</p>
        : result.items.length ? <ActivityList items={result.items} tenantId={account.tenantId} query={query}/>
        : <p>Nenhum recebimento encontrado com estes filtros.</p>}
      <nav className="capture-links" aria-label="Páginas do histórico">{query.depois && <AdminLink href={captureListHref(account.tenantId,{...query,depois:''})}>Voltar à primeira página</AdminLink>}
        {result.nextCursor && <AdminLink href={captureListHref(account.tenantId,{...query,depois:result.nextCursor})}>Próximas capturas →</AdminLink>}
        <AdminLink href={captureListHref(account.tenantId,query)}>Atualizar consulta</AdminLink></nav>
    </section>
  </div>;
}
