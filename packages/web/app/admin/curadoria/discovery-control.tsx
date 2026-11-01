"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {configureDiscoveryAction} from "./recommendation-actions.ts";
export default function DiscoveryControl({policies,canManage,tenantId}:{tenantId:string;policies:any[];canManage:boolean}){
 const [message,setMessage]=useState("");const [pending,start]=useTransition(),router=useRouter();
 return <details><summary>Descoberta contínua dentro do orçamento atual</summary>
  <p>Reserva parte dos itens de cada rodada para novos candidatos. Favoritos e alertas têm prioridade; buscar não aprova nem divulga produtos. Mercado Livre permanece no caminho humano.</p>
  <div className="recommendation-channels">{(['shopee','aliexpress'] as const).map(marketplace=>{
   const current=policies.find(p=>p.marketplace===marketplace);
   return <form key={`${marketplace}:${current?.version ?? 0}`} className="recommendation-channel" onSubmit={event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);
    start(async()=>{try{const result=await configureDiscoveryAction({expectedTenantId:tenantId,marketplace,expectedVersion:current?.version ?? null,enabled:data.get('enabled')==='on',
      itemsPerRun:Number(data.get('items')),keywords:String(data.get('keywords')).split('\n').map(k=>k.trim()).filter(Boolean)});
      setMessage(result.ok ? 'Política de descoberta salva. Será usada nas próximas rodadas autorizadas.':`Não foi possível salvar: ${result.error}.`);
      if(result.ok)router.refresh();}catch{setMessage('Não foi possível salvar agora.');}});
   }}><h4>{marketplace==='shopee'?'Shopee':'AliExpress'}</h4><fieldset disabled={!canManage||pending}>
    <label><input type="checkbox" name="enabled" defaultChecked={current?.enabled ?? false}/> Buscar novos candidatos</label>
    <label>Itens reservados por rodada (1 a 20)<input name="items" type="number" min="1" max="20" defaultValue={current?.items_per_run ?? 3}/></label>
    <label>Até 12 buscas, uma por linha<textarea name="keywords" required defaultValue={current?.keywords?.join('\n') ?? 'organização casa\nacessórios úteis\ncozinha prática'}/></label>
    <button type="submit">Salvar descoberta</button></fieldset></form>;
  })}</div>{message&&<p role="status">{message}</p>}
 </details>;
}
