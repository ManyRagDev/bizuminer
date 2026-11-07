"use client";
import { useAdminDraftState } from "../draft-provider.tsx";
import { useEffect,useRef,useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EditorialCandidate } from "../../../lib/editorial-selection.ts";
import { confirmOfferAction } from "./recommendation-actions.ts";
import {optionIdentity} from '../../../lib/offer-option.ts';

function ConditionField({name,label,value,initialState}:{name:string;label:string;value:string;initialState?:string}){
 const [state,setState]=useState(initialState??(value==='NA'?'na':value?'known':'unknown'));
 return <div><label>{label}<select name={name+'State'} aria-label={`${label}: situação`} value={state} onChange={e=>setState(e.target.value)}><option value="unknown">Ainda não sei</option><option value="known">Conferi a informação</option><option value="na">Confirmei que não se aplica</option></select></label>{state==='known'?<label>Informação conferida: {label}<input name={name} defaultValue={value==='NA'?'':value} required minLength={2} maxLength={1000}/></label>:<input type="hidden" name={name} value={state==='na'?'NA':''}/>}</div>;
}

export default function OfferConfirmation({candidate,onOpen}:{candidate:EditorialCandidate;onOpen?:()=>void}) {
  const evidence=(candidate.offerEvidence ?? {}) as any;
  const known=(key:string)=>evidence.fieldStates?.[key]==='not_applicable' ? 'NA' : String(evidence.conditions?.[key] ?? evidence[key] ?? '');
  const [open,setOpen]=useState(false),[message,setMessage]=useState("");
  const [draft,setDraft]=useAdminDraftState<Record<string,string>>(`offer-confirmation:${candidate.id}`,{});
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(open && form.current)for(const [key,value] of Object.entries(draft)){
    const field=form.current.elements.namedItem(key);if(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)field.value=value;
  }},[open]);
  const [pending,start]=useTransition(),router=useRouter();
  return <section className="offer-confirmation">
    <button type="button" onClick={()=>{if(!open)onOpen?.();setOpen(!open);}}>{candidate.offerOptionKey ? "✏️ Editar opção e preço conferidos" : "🔍 Conferir opção e fixar preço na loja (Opcional)"}</button>
    {open && <form ref={form} onChange={event=>{
      const values=Object.fromEntries([...new FormData(event.currentTarget)].map(([k,v])=>[k,String(v)]));
      setDraft({...values,expectedObservationId:draft.expectedObservationId ?? candidate.latestObservationId ?? ""});
    }} onSubmit={event=>{
      event.preventDefault();const data=new FormData(event.currentTarget);
      if(['sellerId','dimensions','payment','coupon','region','shipping'].some(key=>!String(data.get(key)??'').trim())){setMessage('Confira as condições que ainda estão como “Ainda não sei” antes de registrar esta opção.');return;}
      start(async()=>{
        const result=await confirmOfferAction({expectedTenantId:candidate.tenantId ?? "",productId:candidate.id,expectedObservationId:draft.expectedObservationId ?? candidate.latestObservationId ?? "",
          variantKey:String(data.get('variantLabel'))===candidate.offerOptionLabel ? evidence.variantIdentity?.key??optionIdentity(String(data.get('variantLabel'))) : optionIdentity(String(data.get('variantLabel'))),variantLabel:String(data.get("variantLabel")),priceCents:Math.round(Number(data.get("price"))*100),
          quantity:Number(data.get("quantity")),contents:String(data.get("contents")),dimensions:String(data.get("dimensions")),sellerId:String(data.get("sellerId")),
          payment:String(data.get("payment")),coupon:String(data.get("coupon")),region:String(data.get("region")),shipping:String(data.get("shipping")),confirmation:String(data.get("confirmation"))});
        setMessage(result.ok ? ("preparationFailed" in result ? "Opção registrada. A preparação precisa ser tentada novamente." : "Opção registrada e seleções reavaliadas com sucesso!") : `Não foi possível salvar: ${result.error}. Atualize os dados e tente novamente.`);
        if(result.ok){setDraft({});setOpen(false);router.refresh();}
      });
    }}>
      {draft.expectedObservationId && draft.expectedObservationId!==candidate.latestObservationId && <p role="alert">O anúncio recebeu novos dados. Seu rascunho foi preservado; inicie uma nova conferência antes de salvar.</p>}
      <button type="button" onClick={()=>{setDraft({});setOpen(false);}}>Descartar rascunho e fechar</button>
      <p style={{ margin: "10px 0 6px", fontSize: "14px", fontWeight: 600 }}>Conferir e fixar a variante real da oferta na loja</p>
      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>Abra o link da loja externa para conferir se o anúncio tem variações (ex: kit, voltagem, cor) e registre o preço exato da opção recomendada.</p>
      <div style={{ marginBottom: "14px" }}><a href={candidate.productUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "inline-block", padding: "6px 12px", background: "var(--paper-deep, #f4f4f5)", borderRadius: "6px", textDecoration: "none", fontSize: "13px", fontWeight: 500 }}>🔗 Abrir anúncio na loja oficial ↗</a></div>
      <label>Opção indicada (ex: Azul, 110V, Kit com 2)<input name="variantLabel" required minLength={2} defaultValue={candidate.offerOptionLabel}/></label>
      <label>Preço confirmado em reais (ex: 49.90)<input name="price" type="number" min="0.01" max="1000000" step="0.01" defaultValue={candidate.offerOptionKey ? (candidate.priceCents/100).toFixed(2):undefined} required/></label>
      <label>Quantidade de itens nesta opção<input name="quantity" type="number" min="1" max="10000" defaultValue={(candidate.offerEvidence as any)?.packageQuantity ?? 1} required/></label>
      <label>O que vem nesta opção (conteúdo da embalagem)<textarea name="contents" required minLength={2} defaultValue={(candidate.offerEvidence as any)?.packageContents?.join("; ")}/></label>
      {([["sellerId","Vendedor na loja"],["dimensions","Dimensões ou tamanho"],["payment","Forma de pagamento exigida"],["coupon","Cupom e condições de uso"],["region","Região da oferta"],["shipping","Frete: valor ou informação conhecida"]] as const).map(([key,label])=><ConditionField key={key} name={key} label={label} value={draft[key]??known(key)} initialState={draft[key+'State']}/>)}
      <label>Onde e como conferiu a opção, preço, foto e conteúdo<textarea name="confirmation" required minLength={10} maxLength={1000} placeholder="Ex: Conferi na página da Shopee selecionando a cor azul no checkout"/></label>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", margin: "12px 0" }}><input type="checkbox" required/> Conferi esta opção e seu preço em reais na loja agora, incluindo a correspondência da foto e as condições acima.</label>
      <button type="submit" disabled={pending} style={{ padding: "10px", width: "100%", fontWeight: 600 }}>{pending ? "Registrando…":"Registrar conferência e salvar"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
