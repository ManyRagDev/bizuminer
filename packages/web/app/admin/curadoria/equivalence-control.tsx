"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EquivalenceGroup, EquivalenceOption } from "../../../lib/curation-equivalence-db.ts";
import type { EquivalenceSuggestion } from "../../../lib/curation-equivalence-suggestions.ts";
import { addEquivalenceMemberAction, createEquivalenceAction, revokeEquivalenceAction } from "./actions.ts";

export default function EquivalenceControl({options,groups,suggestions,canManage}:{options:EquivalenceOption[];groups:EquivalenceGroup[];suggestions:EquivalenceSuggestion[];canManage:boolean}) {
  const router=useRouter();
  const [first,setFirst]=useState(""); const [second,setSecond]=useState(""); const [reason,setReason]=useState("");
  const [groupId,setGroupId]=useState(""); const [extraId,setExtraId]=useState(""); const [extraReason,setExtraReason]=useState("");
  const [confirmed,setConfirmed]=useState(false); const [extraConfirmed,setExtraConfirmed]=useState(false);
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null);
  const a=options.find(item=>item.productId===first),b=options.find(item=>item.productId===second);
  async function create() {
    if(!a || !b || a.productId===b.productId || reason.trim().length<3 || !confirmed) {setMessage("Escolha dois anúncios, informe a justificativa e confirme a conferência da identidade.");return;}
    setBusy(true);setMessage(null);
    try {
      const result=await createEquivalenceAction({members:[a,b].map(x=>({productId:x.productId,observationId:x.observationId})),reason,identityConfirmed:confirmed});
      if(result.ok) {setFirst("");setSecond("");setReason("");setConfirmed(false);setMessage("Equivalência registrada.");router.refresh();}
      else setMessage("Não foi possível registrar. Uma opção pode ter mudado ou já pertencer a outro grupo; recarregue e confira.");
    } catch {setMessage("Não foi possível registrar a equivalência.");} finally {setBusy(false);}
  }
  async function revoke(id:string) {
    setBusy(true);setMessage(null);
    try {const result=await revokeEquivalenceAction(id);setMessage(result.ok ? "Equivalência desfeita." : "Não foi possível desfazer a equivalência.");if(result.ok)router.refresh();}
    catch {setMessage("Não foi possível desfazer a equivalência.");} finally {setBusy(false);}
  }
  async function addMember() {
    const option=options.find(item=>item.productId===extraId);
    if(!groupId || !option || extraReason.trim().length<3 || !extraConfirmed) {setMessage("Escolha um grupo e um anúncio, justifique e confirme a conferência da identidade.");return;}
    setBusy(true);setMessage(null);
    try {
      const result=await addEquivalenceMemberAction({groupId,productId:option.productId,observationId:option.observationId,reason:extraReason,identityConfirmed:extraConfirmed});
      if(result.ok) {setExtraId("");setExtraReason("");setExtraConfirmed(false);setMessage("Anúncio incluído no grupo.");router.refresh();}
      else setMessage("Não foi possível incluir. O grupo ou a opção pode ter mudado; recarregue e confira.");
    } catch {setMessage("Não foi possível incluir o anúncio.");} finally {setBusy(false);}
  }
  const describe=(item:EquivalenceOption|undefined)=>item && <p>
    {/^https?:\/\//i.test(item.productUrl) && <a href={item.productUrl} target="_blank" rel="noopener noreferrer">Conferir anúncio</a>}
    {" · "}{item.marketplace} · {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(item.priceCents/100)}
    <br />Opção: {item.variant ? JSON.stringify(item.variant) : "identidade registrada sem descrição"}
    <br />Quantidade: {item.quantity == null ? "não informada" : JSON.stringify(item.quantity)} · Conteúdo: {item.contents == null ? "não informado" : JSON.stringify(item.contents)}
    <br />Dimensões: {item.dimensions == null ? "não informadas" : JSON.stringify(item.dimensions)}
    {item.fieldStates ? <> · Estados dos campos: {JSON.stringify(item.fieldStates)}</> : null}
    {item.conditions ? <> · Condições: {JSON.stringify(item.conditions)}</> : null}
  </p>;
  return <details><summary>Equivalência entre anúncios</summary>
    <p>Relacione apenas a mesma marca, modelo, capacidade e conteúdo. Confira os anúncios quando algum dado estiver ausente; sem evidência suficiente, mantenha-os separados. Preços e históricos continuam separados.</p>
    {canManage && <>
      {suggestions.length>0 && <details><summary>Sugestões para conferência ({suggestions.length})</summary>
        <p>Entre até 300 opções recentes sem grupo, mostramos até 30 pares com títulos parecidos. Isso não confirma que os produtos ou opções sejam iguais; confira marca, modelo, capacidade e conteúdo nos anúncios.</p>
        <ul>{suggestions.map(pair=>{
          const left=options.find(option=>option.productId===pair.firstId),right=options.find(option=>option.productId===pair.secondId);
          if(!left || !right)return null;
          return <li key={`${pair.firstId}:${pair.secondId}`}>
            {left.title} ({left.marketplace}) ↔ {right.title} ({right.marketplace}) · semelhança de palavras {Math.round(pair.similarity*100)}%{" "}
            <button type="button" onClick={()=>{setFirst(left.productId);setSecond(right.productId);setReason("");setConfirmed(false);setMessage("Confira as opções abaixo antes de reconhecer a equivalência.");}}>Conferir par</button>
          </li>;
        })}</ul>
      </details>}
      <label>Primeiro anúncio <select value={first} onChange={e=>{setFirst(e.target.value);setReason("");setConfirmed(false);}}><option value="">Selecione</option>{options.map(o=><option key={o.productId} value={o.productId}>{o.title} · {o.marketplace}</option>)}</select></label>{describe(a)}
      <label>Segundo anúncio <select value={second} onChange={e=>{setSecond(e.target.value);setReason("");setConfirmed(false);}}><option value="">Selecione</option>{options.map(o=><option key={o.productId} value={o.productId}>{o.title} · {o.marketplace}</option>)}</select></label>{describe(b)}
      <label>O que confirma a equivalência? <textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} /></label>{" "}
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Conferi marca, modelo, capacidade, quantidade e conteúdo; há evidência suficiente para relacionar as opções.</label>{" "}
      <button type="button" disabled={busy} onClick={create}>Reconhecer equivalência</button>
      {groups.length>0 && <details><summary>Acrescentar anúncio a um grupo</summary>
        <label>Grupo <select value={groupId} onChange={e=>{setGroupId(e.target.value);setExtraConfirmed(false);}}><option value="">Selecione</option>
          {groups.map(group=><option key={group.id} value={group.id}>{group.members.map(member=>`${member.title} (${member.marketplace})`).join(" ↔ ")}</option>)}
        </select></label>
        <label>Anúncio a incluir <select value={extraId} onChange={e=>{setExtraId(e.target.value);setExtraReason("");setExtraConfirmed(false);}}><option value="">Selecione</option>
          {options.map(option=><option key={option.productId} value={option.productId}>{option.title} · {option.marketplace}</option>)}
        </select></label>{describe(options.find(item=>item.productId===extraId))}
        <label>O que confirma a equivalência com o grupo? <textarea maxLength={1000} value={extraReason} onChange={e=>setExtraReason(e.target.value)} /></label>{" "}
        <label><input type="checkbox" checked={extraConfirmed} onChange={e=>setExtraConfirmed(e.target.checked)}/> Conferi marca, modelo, capacidade, quantidade e conteúdo; há evidência suficiente para relacionar a opção ao grupo.</label>{" "}
        <button type="button" disabled={busy} onClick={addMember}>Incluir no grupo</button>
      </details>}
    </>}
    {message && <p role="status">{message}</p>}
    {groups.length ? <ul>{groups.map(group=><li key={group.id}>{group.members.map(m=>`${m.title} (${m.marketplace})`).join(" ↔ ")} · {group.reason}{" "}
      <details><summary>Justificativas por anúncio</summary><ul>{group.members.map(member=><li key={`${member.marketplace}:${member.optionKey}`}>{member.title}: {member.recognitionReason}</li>)}</ul></details>{" "}
      {canManage && <button type="button" disabled={busy} onClick={()=>revoke(group.id)}>Desfazer</button>}</li>)}</ul> : <p>Nenhuma equivalência reconhecida.</p>}
  </details>;
}
