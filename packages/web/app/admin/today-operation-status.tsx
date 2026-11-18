"use client";
import AdminLink from '../_components/admin-link.tsx';
import {useOperationProgress} from './use-operation-progress.ts';
import styles from './today-operation-status.module.css';
export default function TodayOperationStatus({tenantId,productIds,problemFilter}:{tenantId:string;productIds?:string[];problemFilter?:{category?:string;after?:string}}){
  const {data,error,loading,paused,refresh}=useOperationProgress(tenantId,productIds,problemFilter),e=data?.evaluation,p=data?.preparation;
  const account=encodeURIComponent(tenantId);
  return <section className={styles.banner} aria-label={productIds?'Andamento destes produtos':'Operação e Pauta'}>
    <div><p className="eyebrow">{productIds?'Situação atual destes produtos':'Operação agora'}</p>
      {!data?<p role="status">{error?'Status indisponível. Consulte novamente.':'Consultando a operação…'}</p>:<>
        <strong className={styles.title}>{error?'Consulta parcial; há informações indisponíveis':paused?'Aguardando confirmação de progresso':data.poll.active?'Há processamento para acompanhar':'Situação no momento da consulta'}</strong>
        <p>Consultado em {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(data.consultedAt))}.</p>
        {e?<><p>Avaliação: {e.queued} na fila · {e.running} em execução · {e.waiting} aguardando prazo, incluindo {e.quota} por limite diário.</p>
          <p>{e.recorded} produtos com avaliação registrada; {e.compatible} com compatibilidade factual comprovada, dos quais {e.reused} usam avaliação de outro fato compatível.</p>
          <p>{e.uncertain} resultados incertos · {e.expiredLease} execuções sem confirmação · {e.failed} falhas · {e.outdated} revisões anteriores ou sem compatibilidade comprovada na fila.</p>
          <p>Produtos na fila ainda não comprovam que a avaliação começou. Contagens de etapas diferentes podem se sobrepor.</p></>:<p>{data.mode==='legacy'?'Esta conta usa o fluxo anterior de triagem.':'Avaliação indisponível nesta consulta.'}</p>}
        {p&&<p>Conferência: {p.pending} na fila · {p.running} em execução · {p.unconfirmed} sem confirmação · {p.browser} aguardando navegador · {p.auth} aguardando conexão · {p.quota} aguardando cota · {p.retry} aguardando prazo · {p.expired} com prazo encerrado.</p>}
        <p>Destino afiliado: {data.links?`${data.links.missing} produtos sem vínculo disponível na janela recente de 48 horas.`:'Consulta indisponível.'}</p>
        {data.mode==='legacy'&&<>{data.activities.map((a,index)=><p key={index}>Atividade do fluxo anterior: {({queued:'captura na fila',capture:'captura em andamento',triage:'triagem em andamento',browser:'aguardando navegador',retry:'aguardando tentativa',authorization:'aguardando autorização',reconciliation:'aguardando conferência',monitoring:'acompanhamento de preços',publication:'salvando lote'})[a.kind]??'trabalho registrado'}.</p>)}{data.issues.map((issue,index)=><p key={index}>{issue}</p>)}</>}
        {!data.availability.captures&&<p>Consulta de capturas indisponível.</p>}
        {data.captures?.items.map(c=><p key={c.id}>{c.message} <AdminLink href={c.href}>Conferir captura</AdminLink></p>)}
        {data.poll.nextAt&&!data.poll.active&&<p>Próxima consulta após o prazo registrado: {new Date(data.poll.nextAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.</p>}
      </>}
      {error&&data&&<p role="alert">A leitura está incompleta. Os últimos dados acima não comprovam que a operação terminou.</p>}
      {paused&&<p>A fila não mudou nas últimas consultas e não há execução confirmada. O acompanhamento automático está em pausa; atualize a situação para consultar novamente.</p>}
      <button type="button" onClick={refresh} disabled={loading}>Atualizar situação</button>
    </div>
    <div><p className="eyebrow">Pauta por canal</p>{(['whatsapp','stories'] as const).map(channel=>{
      const state=data?.pauta[channel];return <div key={channel} className={styles.channel}><p><strong>{channel==='whatsapp'?'WhatsApp':'Stories'}</strong> · {data&&!data.availability[channel]?'Consulta indisponível':state===undefined?'Consultando…':state===null?'Seleção preparada ainda não consultável; abra a Pauta para conferir':!state.active?'Canal inativo':`${state.count} ofertas na seleção consultada`}</p>
        <AdminLink href={`/pauta?conta=${account}&canal=${channel}`}>Abrir {channel==='whatsapp'?'WhatsApp':'Stories'}</AdminLink>
        {!!state?.products?.length&&<details><summary>Ver situação dos produtos neste canal</summary>{state.products.map(product=><p key={product.id}><strong>{product.title}</strong>: {product.selected?'Está na seleção deste canal.':product.reasons.join(' ')}</p>)}</details>}
      </div>;})}
      <AdminLink href={`/admin/curadoria?aba=problemas&conta=${account}`}>Problemas para resolver</AdminLink>
      <AdminLink href={`/admin/capturas?conta=${account}`}>Histórico de recebimentos</AdminLink>
    </div>
  </section>;
}
