"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyAuditProduct } from "../../../lib/editorial-compass.ts";
import type { RubricLevel } from "../../../lib/rubric-contract.ts";
import { saveWeeklyAuditSettings, submitHumanRubricReviewAction } from "./actions.ts";

const labels = { selected: "Selecionados", boundary: "Próximos do corte", tail: "Demais candidatos" } as const;
const levels: Array<[RubricLevel,string]> = [["unknown","Não sei"],["weak","Fraco"],["adequate","Adequado"],["strong","Forte"]];

function Review({ product }: { product: WeeklyAuditProduct }) {
  const [open,setOpen] = useState(false);
  const [done,setDone] = useState(product.reviewed);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [reason,setReason] = useState("");
  const [quality,setQuality] = useState<RubricLevel>("unknown");
  const [value,setValue] = useState<RubricLevel>("unknown");
  const [audience,setAudience] = useState<RubricLevel>("unknown");
  const [confidence,setConfidence] = useState<RubricLevel>("unknown");
  const activeMs=useRef(0),started=useRef<number|null>(null);
  const pendingRequest=useRef<{signature:string;id:string;duration:number}|null>(null);
  useEffect(()=>{
    if(!open || done) return;
    const update=()=>{
      if(document.visibilityState==='visible') {if(started.current===null) started.current=performance.now();}
      else if(started.current!==null) {activeMs.current+=performance.now()-started.current;started.current=null;}
    };
    update();document.addEventListener('visibilitychange',update);
    return ()=>{if(started.current!==null) {activeMs.current+=performance.now()-started.current;started.current=null;}
      document.removeEventListener('visibilitychange',update);};
  },[open,done]);
  async function submit() {
    if (reason.trim().length < 3) { setError("Informe o motivo da avaliação."); return; }
    setBusy(true); setError(null);
    try {
      const why = reason.trim();
      const signature=JSON.stringify([product.id,product.observationId,product.title,product.category,product.productUrl,why,quality,value,audience,confidence]);
      if(pendingRequest.current?.signature!==signature) pendingRequest.current={signature,id:crypto.randomUUID(),
        duration:Math.min(14_400_000,Math.max(0,Math.round(activeMs.current+(started.current===null ? 0 : performance.now()-started.current))))};
      const result = await submitHumanRubricReviewAction({productId:product.id,requestId:pendingRequest.current.id,notes:why,reviewDurationMs:pendingRequest.current.duration,
        expectedObservationId:product.observationId ?? undefined,expectedTitle:product.title,
        expectedCategory:product.category,expectedProductUrl:product.productUrl,
        assessment:{schemaVersion:2,quality:{level:quality,reason:why},value:{level:value,reason:why},
          audience:{level:audience,reason:why},evidenceConfidence:{level:confidence,reason:why},
          factsUsed:[],inferences:[],unknowns:[],safetyFlags:[],policyVersion:"rubric-v2",
          evidenceDigest:"",createdAt:new Date().toISOString()}});
      if (result.ok) { setDone(true); setOpen(false); }
      else setError(result.error === "audit_evidence_changed" ? "A oferta mudou desde a abertura da amostra. Recarregue e confira novamente." : "Não foi possível salvar a revisão. Confira a conta e tente novamente.");
    } catch { setError("Não foi possível salvar a revisão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <li>
    <strong>{product.title}</strong> · {product.marketplace} · {product.category || "Sem categoria"} · {product.score === null ? "sem pontuação" : `pontuação ${product.score.toFixed(1)}`}
    {product.priceCents !== null && <> · {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(product.priceCents/100)}</>}
    {product.observedAt && <> · observado em {new Date(product.observedAt).toLocaleString("pt-BR")}</>}
    {/^https?:\/\//i.test(product.productUrl) && <> · <a href={product.productUrl} target="_blank" rel="noopener noreferrer">Ver anúncio</a></>}
    {product.holdout && <> · conjunto de avaliação</>}{" · "}
    {done ? "Revisado nesta semana" : product.observedAt ? <button type="button" onClick={()=>setOpen(!open)}>{open ? "Fechar" : "Avaliar"}</button> : "Aguardando primeira observação para avaliar"}
    {open && !done && <div>
      {([["Qualidade",quality,setQuality],["Valor",value,setValue],["Público",audience,setAudience],["Confiança na evidência",confidence,setConfidence]] as const).map(([label,current,set])=>
        <label key={label}>{label} <select value={current} onChange={e=>set(e.target.value as RubricLevel)}>{levels.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select> </label>)}
      <label>Justificativa <textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={submit}>{busy ? "Salvando…" : "Salvar avaliação"}</button>
    </div>}
  </li>;
}

export default function WeeklyAudit({ products,settings,canConfigure }: { products: WeeklyAuditProduct[];
  settings:{version:number;limit:number;available:boolean};canConfigure:boolean }) {
  const router=useRouter();
  const [limit,setLimit]=useState(String(settings.limit));
  const [version,setVersion]=useState(settings.version);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  async function save() {
    const parsed=Number(limit);
    if(!/^[0-9]+$/.test(limit) || !Number.isInteger(parsed) || parsed<1 || parsed>50) {setMessage("Escolha um número de 1 a 50.");return;}
    setSaving(true);setMessage(null);
    try {
      const result=await saveWeeklyAuditSettings({version,limit:parsed});
      if(result.ok) {setVersion(result.version);setMessage("Configuração salva.");router.refresh();}
      else setMessage(result.error==='conflict' ? "A configuração mudou em outra aba. Recarregue antes de salvar." : "Não foi possível salvar a configuração.");
    } catch {setMessage("Não foi possível salvar a configuração.");}
    finally {setSaving(false);}
  }
  return <section aria-label="Amostra semanal de curadoria">
    <h3>Amostra semanal</h3>
    <p>Compare selecionados, candidatos próximos do corte e outros produtos. A avaliação é humana e não altera a publicação. O conjunto de avaliação fica separado dos exemplos enviados à IA.</p>
    {settings.available && canConfigure && <div><label>Máximo por grupo <input type="number" min="1" max="50" value={limit} onChange={e=>setLimit(e.target.value)} /></label>{" "}
      <button type="button" onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar tamanho"}</button></div>}
    {message && <p role="status">{message}</p>}
    {!settings.available ? <p>A configuração da amostra está indisponível.</p> : !products.length && <p>Nenhum produto disponível para amostragem nesta conta.</p>}
    {(["selected","boundary","tail"] as const).map(group=>{
      const items=products.filter(product=>product.group===group);
      return <details key={group}><summary>{labels[group]} ({items.length})</summary>
        {items.length ? <ul>{items.map(product=><Review key={JSON.stringify([product.id,product.observationId,product.title,product.category,product.productUrl,product.reviewed])} product={product} />)}</ul> : <p>Nenhum candidato disponível neste grupo.</p>}
      </details>;
    })}
  </section>;
}
