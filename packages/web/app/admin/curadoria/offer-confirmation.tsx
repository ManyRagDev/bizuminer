"use client";
import { useAdminDraftState } from "../draft-provider.tsx";
import { useEffect,useRef,useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EditorialCandidate } from "../../../lib/editorial-selection.ts";
import { confirmOfferAction } from "./recommendation-actions.ts";

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
    <button type="button" onClick={()=>{if(!open)onOpen?.();setOpen(!open);}}>{candidate.offerOptionKey ? "Reconfirmar opção e preço" : "Confirmar opção de compra"}</button>
    {open && <form ref={form} onChange={event=>{
      const values=Object.fromEntries([...new FormData(event.currentTarget)].map(([k,v])=>[k,String(v)]));
      setDraft({...values,expectedObservationId:draft.expectedObservationId ?? candidate.latestObservationId ?? ""});
    }} onSubmit={event=>{
      event.preventDefault();const data=new FormData(event.currentTarget);
      start(async()=>{
        const result=await confirmOfferAction({expectedTenantId:candidate.tenantId ?? "",productId:candidate.id,expectedObservationId:draft.expectedObservationId ?? candidate.latestObservationId ?? "",
          variantKey:String(data.get("variantKey")),variantLabel:String(data.get("variantLabel")),priceCents:Math.round(Number(data.get("price"))*100),
          quantity:Number(data.get("quantity")),contents:String(data.get("contents")),dimensions:String(data.get("dimensions")),sellerId:String(data.get("sellerId")),
          payment:String(data.get("payment")),coupon:String(data.get("coupon")),region:String(data.get("region")),shipping:String(data.get("shipping")),confirmation:String(data.get("confirmation"))});
        setMessage(result.ok ? ("preparationFailed" in result ? "Opção registrada. A preparação precisa ser tentada novamente." : "Opção registrada e seleções reavaliadas. Confira o mérito com os dados confirmados.") : `Não foi possível salvar: ${result.error}. Atualize os dados e tente novamente.`);
        if(result.ok){setDraft({});setOpen(false);router.refresh();}
      });
    }}>
      {draft.expectedObservationId && draft.expectedObservationId!==candidate.latestObservationId && <p role="alert">O anúncio recebeu novos dados. Seu rascunho foi preservado; inicie uma nova conferência antes de salvar.</p>}
      <button type="button" onClick={()=>{setDraft({});setOpen(false);}}>Descartar rascunho e iniciar nova conferência</button>
      <p>Confira a opção na loja e registre os fatos observados. A faixa do anúncio não confirma esta compra. Isso não aprova o produto nem cria preços de dias anteriores.</p>
      <p>Nos campos de condições, escreva <b>NA</b> somente quando tiver confirmado que não se aplicam. Se forem desconhecidos, mantenha a oferta pendente.</p>
      <a href={candidate.productUrl} target="_blank" rel="noopener noreferrer nofollow">Abrir anúncio para conferência ↗</a>
      <label>Identificador estável da opção (ID da loja ou rótulo sem espaços)<input name="variantKey" required maxLength={120} pattern="[a-zA-Z0-9_.:\-]+" defaultValue={(candidate.offerEvidence as any)?.variantIdentity?.key ?? ""}/></label>
      <label>Opção indicada (cor, modelo, tamanho)<input name="variantLabel" required minLength={2} defaultValue={candidate.offerOptionLabel}/></label>
      <label>Preço confirmado em reais<input name="price" type="number" min="0.01" max="1000000" step="0.01" defaultValue={candidate.offerOptionKey ? (candidate.priceCents/100).toFixed(2):undefined} required/></label>
      <label>Quantidade da compra<input name="quantity" type="number" min="1" max="10000" defaultValue={(candidate.offerEvidence as any)?.packageQuantity ?? 1} required/></label>
      <label>O que vem nesta opção<textarea name="contents" required minLength={2} defaultValue={(candidate.offerEvidence as any)?.packageContents?.join("; ")}/></label>
      {([["sellerId","Identificação do vendedor"],["dimensions","Dimensões ou tamanho"],["payment","Forma de pagamento exigida"],["coupon","Cupom e condições de uso"],["region","Região da oferta"],["shipping","Frete: valor ou informação conhecida"]] as const).map(([key,label])=><label key={key}>{label}<input name={key} defaultValue={known(key)} required minLength={2} maxLength={1000}/></label>)}
      <label>Onde e como conferiu a opção, preço, foto e conteúdo<textarea name="confirmation" required minLength={10} maxLength={1000}/></label>
      <label><input type="checkbox" required/> Conferi esta opção e seu preço em reais na loja agora, incluindo a correspondência da imagem e as condições acima.</label>
      <button type="submit" disabled={pending}>{pending ? "Registrando…":"Registrar conferência"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
