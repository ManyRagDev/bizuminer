"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {releaseUncertainAttributeAction} from "./actions.ts";
import {curationOfferHref} from "../../../lib/curation-navigation.ts";

export default function AttributeReconcile({tenantId,items,total,expanded=false,issueReturn}:{tenantId:string;items:Array<{id:string;productId:string;title:string;updatedAt:string}>;total:number;expanded?:boolean;issueReturn?:string}) {
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const router=useRouter();
  async function release(id:string) {
    const reason=(reasons[id] ?? "").trim();
    if(reason.length<3){setMessage("Informe o que você conferiu antes de liberar a nova tentativa.");return;}
    setBusy(id);setMessage("");
    try {
      const result=await releaseUncertainAttributeAction({tenantId,jobId:id,reason});
      setMessage(result.ok ? "A avaliação foi liberada para a fila, sujeita ao limite diário." :
        result.error==='already_resolved' ? "Esta pendência já mudou. Atualize a página." : "Não foi possível liberar a avaliação.");
      if(result.ok) {window.dispatchEvent(new CustomEvent('bm:operation-changed',{detail:{tenantId}}));router.refresh();}
    } catch {setMessage("Não foi possível liberar a avaliação.");}
    finally {setBusy(null);}
  }
  if(!total) return null;
  return <details open={expanded}><summary>{total} avaliação(ões) de IA aguardando conferência</summary>
    <p>A resposta anterior não foi confirmada e pode ter consumido orçamento. Confira antes de liberar outra tentativa; ela poderá gerar novo custo.</p>
    <ul>{items.map(item=><li key={item.id}>
      <a href={curationOfferHref(item.productId,tenantId,{origin:"avaliacoes",issueReturn})}>{item.title}</a> · aguardando desde {new Date(item.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}
      <label> O que foi conferido <input value={reasons[item.id] ?? ""} maxLength={1000}
        onChange={event=>setReasons(current=>({...current,[item.id]:event.target.value}))}/></label>{" "}
      <button type="button" disabled={busy!==null} onClick={()=>void release(item.id)}>{busy===item.id ? 'Liberando…' : 'Liberar nova tentativa'}</button>
    </li>)}</ul>
    {total>items.length && <p>Exibindo as primeiras {items.length} pendências.</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
