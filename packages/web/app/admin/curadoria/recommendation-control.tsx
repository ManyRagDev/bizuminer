"use client";
import { useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminDraftState } from "../draft-provider.tsx";
import { RECOMMENDATION_CHANNELS,defaultChannelPolicy,type RecommendationChannel } from "../../../lib/recommendation-policy.ts";
import { configureChannelAction,previewChannelsAction } from "./recommendation-actions.ts";

const labels={home:"Página inicial",whatsapp:"WhatsApp",stories:"Stories"};
interface Choice {id:string;title:string;displayTitle?:string;offerOptionLabel?:string}
function ChannelForm({channel,current,canManage,tenantId,candidates}:{tenantId:string;channel:RecommendationChannel;current:any;canManage:boolean;candidates:Choice[]}) {
  const [message,setMessage]=useState("");const [pending,start]=useTransition(),router=useRouter(),picker=useRef<HTMLSelectElement>(null);
  const draftKey=`channel-choice:${channel}:${current?.version ?? 0}`;
  const [manual,setManual]=useAdminDraftState(draftKey+":manual",current?.manual_order!=null);
  const [chosen,setChosen]=useAdminDraftState<string[]>(draftKey+":order",current?.manual_order ?? []);
  const title=(id:string)=>{const p=candidates.find(c=>c.id===id);return p?.displayTitle ?? p?.title ?? "Produto indisponível nesta revisão";};
  const policy=current?.policy ?? defaultChannelPolicy(channel);
  function move(index:number,direction:number){const next=[...chosen];[next[index],next[index+direction]]=[next[index+direction],next[index]];setChosen(next);}
  return <form className="recommendation-channel" onSubmit={event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);
    start(async()=>{
      try{
        const result=await configureChannelAction({expectedTenantId:tenantId,channel,expectedVersion:current?.version ?? null,enabled:data.get("enabled")==="on",
          policy:{limit:Number(data.get("limit")),repeatHours:Number(data.get("repeatHours")),familyLimit:Number(data.get("familyLimit")),improvementPercent:Number(data.get("improvementPercent"))},
          manualOrder:manual ? chosen:null,validUntil:data.get("until") ? new Date(String(data.get("until"))).toISOString():null});
        setMessage(result.ok ? ("preparationFailed" in result ? "Escolha salva. A preparação falhou; tente reavaliar novamente." : "Escolha salva. A lista preparada foi reavaliada.")
          : result.error==='channel_conflict' ? "Outra sessão alterou este canal. Atualize a página antes de salvar." : "Não foi possível atualizar. Confira os valores e a conta em operação.");
        if(result.ok)router.refresh();
      }catch{setMessage("Não foi possível concluir agora. Seu rascunho foi preservado.");}
    });
  }}>
    <h3>{labels[channel]}</h3><p>{channel==='home' ? "Exploração mais ampla de produtos aprovados." : "Indicações fortes, com opção e preço confirmados. Pode haver poucos ou nenhum item apto."}</p>
    <fieldset disabled={!canManage || pending}>
      <label><input name="enabled" type="checkbox" defaultChecked={current?.enabled ?? false}/> Preparar seleção deste canal</label>
      <label><input type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)}/> Escolher produtos e ordem</label>
      {manual && <div>
        <label>Adicionar um produto<select ref={picker} defaultValue=""><option value="">Escolha o produto</option>{candidates.filter(c=>!chosen.includes(c.id)).map(c=><option key={c.id} value={c.id}>{c.displayTitle ?? c.title}</option>)}</select></label>
        <button type="button" disabled={chosen.length>=24} onClick={()=>{const id=picker.current?.value;if(id&&!chosen.includes(id))setChosen([...chosen,id]);}}>Adicionar à escolha</button>
        {chosen.length ? <ol className="recommendation-order">{chosen.map((id,index)=><li key={id}><span>{title(id)}</span><div>
          <button type="button" disabled={index===0} aria-label={`Subir ${title(id)}`} onClick={()=>move(index,-1)}>↑</button>
          <button type="button" disabled={index===chosen.length-1} aria-label={`Descer ${title(id)}`} onClick={()=>move(index,1)}>↓</button>
          <button type="button" aria-label={`Remover ${title(id)}`} onClick={()=>setChosen(chosen.filter(item=>item!==id))}>Remover</button>
        </div></li>)}</ol>:<p>Esta escolha está vazia. Ao salvar, o canal ficará sem indicações até você escolher produtos ou voltar à seleção automática.</p>}
        <p>A escolha preserva sua ordem entre os produtos ainda aptos. Pendências e ofertas vencidas continuam impedidas.</p>
      </div>}
      <details><summary>Ajustar limites, repetição e validade</summary>
        <label>Máximo de produtos (sem preenchimento obrigatório)<input name="limit" type="number" min="1" max="24" defaultValue={policy.limit}/></label>
        <label>Intervalo após divulgação confirmada, em horas<input name="repeatHours" type="number" min="0" max="720" defaultValue={policy.repeatHours}/></label>
        <label>Queda mínima para antecipar nova indicação (%)<input name="improvementPercent" type="number" min="1" max="50" defaultValue={policy.improvementPercent}/></label>
        <label>Máximo por família<input name="familyLimit" type="number" min="1" max="4" defaultValue={policy.familyLimit}/></label>
        <label>Validade opcional da escolha<input name="until" type="datetime-local" defaultValue={current?.valid_until ? new Date(new Date(current.valid_until).getTime()-new Date(current.valid_until).getTimezoneOffset()*60000).toISOString().slice(0,16):""}/></label>
      </details>
      <button type="submit">{pending ? "Reavaliando…":"Salvar escolha do canal"}</button>
    </fieldset>
    <p>Versão {current?.version ?? "ainda não criada"} · {current?.prepared_count ?? 0} preparados</p>
    {message && <p role="status">{message}</p>}
  </form>;
}
export default function RecommendationControl({desk,canManage,tenantId,candidates}:{tenantId:string;candidates:Choice[];desk:{ready:boolean;channels:any[];coverage:any[];confirmationQueue:any[]};canManage:boolean}) {
  const [preview,setPreview]=useState<any>(null),[error,setError]=useState("");const [pending,start]=useTransition();
  const title=(id:string)=>candidates.find(c=>c.id===id)?.displayTitle ?? candidates.find(c=>c.id===id)?.title ?? "Produto indisponível nesta revisão";
  return <section className="recommendation-control">
    <p className="eyebrow">Pauta por canal</p><h2>Preparar as melhores indicações para cada destino</h2>
    <p>Preparar não envia mensagens. Copiar ou abrir links também não comprova divulgação ou compra. A configuração antiga de renovação não ativa estes critérios.</p>
    {!desk.ready ? <p>A atualização do banco precisa ser integrada antes de habilitar esta mesa.</p> : <>
      <div className="recommendation-channels">{RECOMMENDATION_CHANNELS.map(channel=><ChannelForm key={`${tenantId}:${channel}:${desk.channels.find(c=>c.channel===channel)?.version ?? 0}`} tenantId={tenantId} candidates={candidates} channel={channel} current={desk.channels.find(c=>c.channel===channel)} canManage={canManage}/>)}</div>
      <button type="button" disabled={pending} onClick={()=>start(async()=>{try{setPreview(await previewChannelsAction(tenantId));setError("");}catch{setError("Não foi possível simular agora.");}})}>Simular sem alterar a seleção</button>
      {error && <p role="alert">{error}</p>}
      {preview && <div role="status">{!preview.configured ? <p>Configure os canais para simular sua escolha.</p> : preview.channels.map((c:any)=><details key={c.channel}><summary>{labels[c.channel as RecommendationChannel]}: {c.count} aptos</summary><ul>{c.excluded?.slice(0,30).map((e:any)=><li key={e.productId}>{title(e.productId)}: {e.reasons.join(" · ")}</li>)}</ul></details>)}</div>}
      <h3>Histórico dos produtos preparados</h3><p>A cobertura considera somente as indicações ainda visíveis. Preços vencidos e configurações incompletas são contados separadamente na última preparação.</p>
      {desk.coverage.length ? <ul>{desk.coverage.map(c=><li key={c.channel}>{labels[c.channel as RecommendationChannel]}: {c.with_series}/{c.shown} com observações comparáveis em ao menos dois dias; {c.configuration_unknown} com configuração incompleta; {c.stale} com preço vencido. Maior lacuna entre observações comparáveis: {c.maximum_gap_hours==null ? "sem série":`${Number(c.maximum_gap_hours).toFixed(0)} horas`}.</li>)}</ul>:<p>A cobertura aparecerá após a primeira preparação.</p>}
      <h3>Opções que precisam de nova conferência</h3><p>As APIs podem atualizar somente o anúncio. As opções abaixo continuam com a data real da conferência específica.</p>
      <ul>{desk.confirmationQueue.map(p=><li key={p.id}><a href={`/admin/curadoria?aba=selecao&revisar=${encodeURIComponent(p.id)}`}>{p.title}</a></li>)}</ul>
    </>}
  </section>;
}
