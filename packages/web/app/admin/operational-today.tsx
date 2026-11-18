"use client";
import AdminLink from '../_components/admin-link.tsx';
import {useOperationProgress} from './use-operation-progress.ts';
import styles from './operational-today.module.css';
const labels:Record<string,string>={mercadolivre:'Mercado Livre',amazon:'Amazon',aliexpress:'AliExpress',shopee:'Shopee'};
const states:Record<string,string>={saved:'Importação salva',running:'Execução não encerrada',ok:'Concluída',partial:'Concluída com pendências',error:'Encerrada com falha'};
const date=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Não registrado';
export default function OperationalToday({tenantId}:{tenantId:string}){
  const {data,error,loading,paused,refresh}=useOperationProgress(tenantId),e=data?.evaluation,p=data?.preparation;
  const href=(path:string)=>{const u=new URL(path,"https://local.invalid");u.searchParams.set("conta",tenantId);return u.pathname+u.search+u.hash;};
  return <div className={`bm-workspace ${styles.today}`}>
    <header className="bm-page-heading"><p className="bm-eyebrow">Operação da conta</p><h1>Hoje</h1>
      <p>Acompanhe o que entrou, o que está sendo processado e o que pode divulgar.</p>
      <div className={styles.actions}><span>{data?`Consultado em ${date(data.consultedAt)}`:'Consultando a situação…'}</span>
        <button type="button" onClick={refresh} disabled={loading}>{loading?'Consultando…':'Atualizar situação'}</button></div>
      {error&&<p role="alert">A consulta está incompleta. Os últimos dados não comprovam que a operação terminou. Tente atualizar.</p>}
    </header>
    <section className="bm-card" aria-labelledby="today-processing"><h2 id="today-processing">Processamento e pendências</h2>
      {!data?<p role="status">{error?'Situação indisponível nesta consulta.':'Consultando o processamento…'}</p>:<>
        {e?<div className={styles.metrics}><p><strong>{e.queued}</strong> avaliações na fila</p><p><strong>{e.running}</strong> avaliações em execução</p>
          <p><strong>{e.uncertain+e.expiredLease}</strong> avaliações sem resultado confirmado</p></div>
          :<p>{data.mode==='legacy'?'Esta conta usa a triagem anterior. Consulte a Curadoria para acompanhar.':'Avaliação indisponível nesta consulta.'}</p>}
        {e&&<details><summary>Avaliações e catálogo</summary><p>{e.recorded} produtos com avaliação registrada · {e.compatible} com compatibilidade factual comprovada · {e.reused} com avaliação reaproveitada.</p><p>{e.eligible} aprovados no catálogo. A seleção e os requisitos de cada canal são conferidos na Pauta.</p></details>}
        {!!e?.waiting&&<p>{e.waiting} avaliações aguardam prazo, incluindo {e.quota} por limite diário.</p>}
        {p&&<p>Conferência de ofertas: {p.pending} na fila · {p.running} em execução · {p.browser} aguardando navegador · {p.auth} aguardando conexão · {p.quota} aguardando cota.</p>}
        {data.captures?data.captures.items.slice(0,4).map(c=><p key={c.id}>{c.message} <AdminLink href={c.href}>Conferir captura →</AdminLink></p>):<p>Capturas em andamento: consulta indisponível.</p>}
        {data.mode==='v2'&&data.availability.processing&&!data.problems.length&&data.availability.links&&<p>Nenhuma pendência de avaliação, conferência ou vínculo encontrada nesta consulta.</p>}
        {!!data.problems.length&&<ul className={styles.problems}>{data.problems.slice(0,3).map(problem=><li key={problem.id}><strong>{problem.title}</strong><p>{problem.message}</p><AdminLink href={problem.href}>Conferir item →</AdminLink></li>)}</ul>}
        {!data.availability.links&&<p>Vínculos afiliados: consulta indisponível.</p>}
        {paused&&<p>A fila não mudou e não há execução confirmada. A consulta automática está em pausa; use Atualizar situação para conferir novamente.</p>}
        {data.poll.nextAt&&!data.poll.active&&<p>Próxima conferência após {date(data.poll.nextAt)}.</p>}
      </>}
      <div className={styles.actions}><AdminLink href={href('/admin/curadoria?aba=andamento')}>Ver todo o andamento →</AdminLink>
        <AdminLink href={href('/admin/curadoria?aba=problemas')}>Resolver problemas →</AdminLink></div>
    </section>
    <section aria-labelledby="today-pauta"><h2 id="today-pauta">Pauta para divulgar</h2><p>A seleção de cada canal independe da fila de processamento.</p>
      <div className={styles.channels}>{(['whatsapp','stories'] as const).map(channel=>{const s=data?.pauta[channel];return <article className="bm-card" key={channel}>
        <h3>{channel==='whatsapp'?'WhatsApp':'Stories'}</h3><p>{!data?'Consultando…':!data.availability[channel]?'Consulta indisponível':!s?'Seleção preparada ainda não consultável. Abra a Pauta para conferir.':!s.active?'Canal inativo':`${s.count} ${s.count===1?'oferta':'ofertas'} na seleção consultada`}</p>
        <AdminLink href={href(`/pauta?canal=${channel}`)}>Abrir {channel==='whatsapp'?'WhatsApp':'Stories'} →</AdminLink></article>;})}</div>
    </section>
    <section className="bm-card" aria-labelledby="today-recent"><h2 id="today-recent">Capturas recebidas recentemente</h2>
      {!data?<p>Consultando recebimentos…</p>:data.recent===null||data.recent===undefined?<p>Histórico indisponível nesta consulta; os recebimentos não foram considerados vazios.</p>:!data.recent.length?<p>Nenhum recebimento encontrado nesta conta.</p>:
        <ol className={styles.receipts}>{data.recent.map(r=><li key={r.reference}><div><strong>{r.stores.map(s=>labels[s]??s).join(' · ')||'Loja não registrada'}</strong>
          <p>{r.origin==='manual'?'Extensão · importação manual':r.origin==='batch'?'Lote de captura':r.origin==='run'?'Execução avulsa':'Registro individual'} · {date(r.startedAt)}</p></div>
          <div><strong>{states[r.state]??r.state}</strong>{r.products!==null&&<p>{r.products} produtos distintos neste recebimento</p>}{r.observations!==null&&<p>{r.observations} observações salvas</p>}
          <AdminLink href={href(`/admin/capturas/${encodeURIComponent(r.reference)}`)}>Abrir detalhes →</AdminLink></div></li>)}</ol>}
      <AdminLink href={href('/admin/capturas')}>Todas as capturas e filtros →</AdminLink>
    </section>
    <section aria-labelledby="today-stores"><h2 id="today-stores">Lojas e novas capturas</h2><p>Produtos com preço recente não representam aprovação nem seleção garantida para divulgação.</p>
      {!data?.stores?<p>Indicadores das lojas indisponíveis nesta consulta.</p>:<div className={styles.stores}>{data.stores.map(s=><article className="bm-card" key={s.store}><h3>{labels[s.store]??s.store}</h3>
        <p>Manual: {s.manual?'habilitado':'indisponível'} · API: {s.api?'habilitada':'indisponível'}. A conexão da conta também precisa estar válida.</p>
        <p>Configuração afiliada: {({active:'ativa',pending:'pendente',paused:'pausada',inactive:'inativa',suspended:'suspensa',revoked:'revogada',missing:'não cadastrada'} as Record<string,string>)[s.connection??'']??'não consultada'}. <AdminLink href={href('/admin/onboarding')}>Conferir conexão →</AdminLink></p>
        <p>{s.recentProducts} produtos com preço observado nas últimas 48 horas.{s.approvedRecentProducts!==undefined&&` Desses, ${s.approvedRecentProducts} estão aprovados no catálogo.`}</p>
        <p>Última atividade de captura: {date(s.lastActivityAt)}.</p>
        <p>Na seleção consultada: {(['whatsapp','stories'] as const).map((c,i)=><span key={c}>{i?' · ':''}{c==='whatsapp'?'WhatsApp':'Stories'} {data.availability[c]&&data.pauta[c]?.byStore?data.pauta[c]!.byStore![s.store]??0:'não consultável'}</span>)}.</p>
        <AdminLink href={href(`/admin/capturas?loja=${s.store}`)}>Ver capturas desta loja →</AdminLink>
      </article>)}</div>}
      <div className={styles.actions}><AdminLink href={href('/admin/capturas#capture-start-title')}>Iniciar uma captura →</AdminLink>
        <AdminLink href={href('/admin/onboarding')}>Conferir lojas e extensão →</AdminLink></div>
    </section>
  </div>;
}
