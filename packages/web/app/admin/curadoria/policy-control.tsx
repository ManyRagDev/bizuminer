"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CurationPolicyView } from "../../../lib/curation-policy-db.ts";
import { isValidSelectionPolicyV2, type SelectionPolicyV2 } from "../../../lib/curation-selection-v2.ts";
import { validScoreWeights, type ScoreWeights } from "../../../lib/curation-score-v2.ts";
import { saveCurationPolicyAction } from "./actions.ts";

const fields: Array<{key:keyof SelectionPolicyV2;label:string;min:number;max:number;step:number;scale:number}> = [
  {key:"capacity",label:"Máximo na vitrine",min:1,max:24,step:1,scale:1},
  {key:"categoryShare",label:"Alvo máximo por categoria (%)",min:1,max:100,step:1,scale:100},
  {key:"marketplaceShare",label:"Alvo máximo por loja (%)",min:1,max:100,step:1,scale:100},
  {key:"challengerMargin",label:"Vantagem para substituir (%)",min:0,max:100,step:1,scale:100},
  {key:"dropFraction",label:"Queda de mérito para saída (%)",min:0,max:100,step:1,scale:100},
  {key:"domEntryHours",label:"Idade máxima DOM na entrada (horas)",min:0.1,max:12,step:0.1,scale:1},
  {key:"domStayHours",label:"Permanência máxima DOM (horas)",min:1,max:48,step:1,scale:1},
  {key:"shopeeHours",label:"Validade Shopee (horas)",min:0.1,max:1,step:0.1,scale:1},
  {key:"pendingLimit",label:"Máximo de promoções aguardando conferência",min:0,max:100,step:1,scale:1},
];
const weightFields:Array<{key:keyof ScoreWeights;label:string}>=[
  {key:'quality',label:'Qualidade e utilidade'}, {key:'popularity',label:'Popularidade'},
  {key:'discount',label:'Sinal de desconto'}, {key:'savings',label:'Economia'},
  {key:'freshness',label:'Frescor'}, {key:'store',label:'Sinais da loja'},
  {key:'whatsapp',label:'Apelo na pauta'},
];

export default function PolicyControl({initial,canManage}:{initial:CurationPolicyView;canManage:boolean}) {
  const router=useRouter();
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(field=>[field.key,String(initial.policy[field.key]*field.scale)])));
  const [enabled,setEnabled]=useState(initial.enabled);const [version,setVersion]=useState(initial.version);
  const [autoEligibility,setAutoEligibility]=useState(initial.autoEligibility);
  const [weights,setWeights]=useState<Record<string,string>>(()=>Object.fromEntries(weightFields.map(field=>[field.key,String(Math.round(initial.weights[field.key]*10000)/100)])));
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);
  async function save() {
    const parsed=Object.fromEntries(fields.map(field=>[field.key,values[field.key]?.trim() ? Number(values[field.key])/field.scale : NaN])) as SelectionPolicyV2;
    if(!isValidSelectionPolicyV2(parsed)) {setMessage("Revise os limites; a permanência DOM deve ser igual ou maior que a idade de entrada.");return;}
    const parsedWeights=Object.fromEntries(weightFields.map(field=>[field.key,weights[field.key]?.trim() ? Number(weights[field.key])/100 : NaN])) as ScoreWeights;
    if(!validScoreWeights(parsedWeights)) {setMessage("Revise os pesos: os seis pesos da vitrine devem somar 100%; o peso da pauta deve estar entre 0% e 100%.");return;}
    setBusy(true);setMessage(null);
    try {
      const result=await saveCurationPolicyAction({version,enabled,autoEligibility,policy:parsed,weights:parsedWeights});
      if(result.ok){setVersion(result.version);setMessage("Política salva.");router.refresh();}
      else setMessage(result.error==='conflict' ? "A política mudou em outra aba. Recarregue antes de salvar." : "Não foi possível salvar a política.");
    } catch {setMessage("Não foi possível salvar a política.");} finally {setBusy(false);}
  }
  if(!initial.available)return <details><summary>Política de seleção v2</summary><p>Configuração indisponível ou inválida.</p></details>;
  return <details className="curation-manual-edition"><summary>Política de seleção v2 · {initial.enabled ? "ativa" : "desativada"}</summary>
    <p>A ativação aplica os critérios de frescor e avaliação à conta e pode reduzir as ofertas exibidas até que sejam conferidas. Se os executores externos já estiverem habilitados e tiverem orçamento, a mudança poderá gerar avaliações e conferências.</p>
    <label><input type="checkbox" checked={enabled} disabled={!canManage || busy} onChange={e=>setEnabled(e.target.checked)} /> Ativar política v2 nesta conta</label>
    <p><label><input type="checkbox" checked={autoEligibility} disabled={!canManage || busy} onChange={e=>setAutoEligibility(e.target.checked)} /> Permitir que avaliações v2 sem bloqueios avancem candidatos pendentes automaticamente</label></p>
    <p>Essa opção também exige publicação automática habilitada na Bússola ({initial.autoPublishConfigured ? "habilitada" : "desabilitada"}). A nota antiga de 1 a 5 não é convertida para a escala v2; os candidatos aprovados ainda precisam passar pela seleção e pela conferência de preço.</p>
    <p>Permanência DOM acima de 24 horas é uma opção explícita que amplia a idade máxima aceita. A pauta mantém seu próprio limite por canal.</p>
    {fields.map(field=><label key={field.key} style={{display:"block"}}>{field.label}{" "}<input type="number" min={field.min} max={field.max} step={field.step}
      disabled={!canManage || busy} value={values[field.key] ?? ""} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))} /></label>)}
    <p>Pesos do score (%): os seis primeiros devem somar 100%. O apelo na pauta ajusta a mistura entre o score da vitrine e o apelo no canal.</p>
    {weightFields.map(field=><label key={field.key} style={{display:"block"}}>{field.label}{" "}<input type="number" min="0" max="100" step="0.01"
      disabled={!canManage || busy} value={weights[field.key] ?? ""} onChange={e=>setWeights(current=>({...current,[field.key]:e.target.value}))} /></label>)}
    {canManage && <button type="button" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar política"}</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}
