"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {releaseShopeeCredentialAction} from "./actions.ts";

export default function ShopeeCredentialRetry({tenantId,asOf,count}:{tenantId:string;asOf:string;count:number}) {
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const router=useRouter();
  async function release() {
    if(reason.trim().length<3){setMessage("Descreva a correção ou conferência da conexão.");return;}
    setBusy(true);setMessage("");
    try {
      const result=await releaseShopeeCredentialAction({tenantId,asOf,reason});
      setMessage(result.ok ? `${result.count} pedido(s) liberado(s) para nova tentativa, sujeitos à cota.` : "Não foi possível liberar os pedidos.");
      if(result.ok) {window.dispatchEvent(new CustomEvent('bm:operation-changed',{detail:{tenantId}}));router.refresh();}
    } catch {setMessage("Não foi possível liberar os pedidos.");}
    finally {setBusy(false);}
  }
  return <details><summary>Autorizar nova tentativa após corrigir a conexão</summary>
    <p>Há {count} pedido(s) recusado(s) na consulta desta tela. A ação libera pedidos com falha registrada até esse momento; novas consultas usam a cota da conta.</p>
    <label>O que foi corrigido ou conferido <input value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label>{" "}
    <button type="button" disabled={busy} onClick={()=>void release()}>{busy ? "Liberando…" : "Liberar nova tentativa"}</button>
    {message && <p role="status">{message}</p>}
  </details>;
}
