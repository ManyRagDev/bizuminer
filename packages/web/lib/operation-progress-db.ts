import { readCaptureActivities,readCaptureStoreSummary } from './capture-activity-db.ts';
import { captureEnabled } from './platform-gates.ts';
import { extensionCaptureEnabled,extensionBatchMarketplaceEnabled } from './flags.ts';
import { db } from './db.ts';
import {readProcessingProgress,readAccountProgressSnapshot as read} from './operation-processing-db.ts';
export {readProcessingProgress} from './operation-processing-db.ts';
import type { AccountContext } from './account-context.ts';
import { captureCursor,decodeCaptureCursor } from './capture-activity.ts';
import { curationOfferHref } from './curation-navigation.ts';
import { diagnosticLabel } from './curation-diagnostic.ts';
import { readPautaProgress,readPautaLinkProgress } from './pauta-db.ts';
import { progressProductIds,progressScope,type OperationProgress,type ProgressProblem } from './operation-progress.ts';
const iso=(v:Date|string|null|undefined)=>v ? new Date(v).toISOString() : null;
const earliest=(dates:Array<string|null>)=>dates.filter((v):v is string=>!!v).sort()[0]??null;

async function captureProgress(account:AccountContext,factory:typeof db){return read(account,factory,async(tx,now)=>{
  const batches=await tx<Array<{id:string;status:string;phase:string|null;deadline:string|null;next_at:string|null}>>`select id::text,status,
    metadata#>>'{execution,phase}' as phase,metadata#>>'{execution,deadline}' as deadline,metadata#>>'{execution,nextAttemptAt}' as next_at
    from garimpa.capture_batch where tenant_id=${account.tenantId} and (status='running' or status in ('partial','error') and coalesce(finished_at,started_at)>${new Date(+now-86_400_000)})
    order by (status='running') desc,started_at desc,id desc limit 100`;
  const runs=await tx<Array<{id:string;status:string;phase:string|null;deadline:string|null;next_at:string|null}>>`select id,status,
    case when parameters->>'captureMode'='monitoring' then 'monitoring' else 'capturing' end as phase,
    (started_at+interval '30 minutes')::text as deadline,null::text as next_at from garimpa.capture_run where tenant_id=${account.tenantId} and status='running'
      and not exists(select 1 from garimpa.capture_batch b where b.tenant_id=${account.tenantId} and b.id::text=parameters->>'operationBatchId')
    order by started_at desc,id desc limit 100`;
  let active=0;const dates:Array<string|null>=[];
  const items=[...batches.map(b=>({...b,ref:`batch:${b.id}`})),...runs.map(r=>({...r,ref:`run:${r.id}`}))].map(r=>{
    const deadline=r.deadline && Number.isFinite(Date.parse(r.deadline)) ? iso(r.deadline):null;
    const nextAt=r.next_at && Number.isFinite(Date.parse(r.next_at)) ? iso(r.next_at):null;
    const waiting=['awaiting_browser','awaiting_authorization','awaiting_reconciliation','retry_wait'].includes(r.phase??'');
    const expired=r.status==='running' && (!deadline||Date.parse(deadline)<=+now);
    if(r.status==='running' && !waiting && !expired)active++;
    if(r.status==='running' && r.phase==='retry_wait' && nextAt && Date.parse(nextAt)>+now)dates.push(nextAt);
    return {id:r.ref,state:r.status,phase:r.phase,deadline,nextAt,href:`/admin/capturas/${encodeURIComponent(r.ref)}?conta=${encodeURIComponent(account.tenantId)}`,
      message:r.status==='partial'?'Recebimento concluído com pendências; consulte o resultado de cada busca e vínculo.':r.status==='error'?'A captura registrou falha; fatos já salvos permanecem no histórico.':expired?'Execução sem confirmação dentro do prazo registrado.':waiting?'A captura aguarda uma ação ou prazo registrado.':r.phase==='queued'?'Captura na fila; início não confirmado.':'Captura com execução registrada.'};
  });return {items,active,nextAt:earliest(dates)};
});}

export async function readOperationProgress(account:AccountContext,options:{productIds?:string[];after?:string;category?:string}={},factory:typeof db=db):Promise<OperationProgress>{
  const ids=progressProductIds(options.productIds),scope=progressScope(ids,options),cursorScope=[account.tenantId,'problems',progressScope(ids),options.category??null];
  const after=decodeCaptureCursor(options.after,cursorScope);
  if(after && (typeof after.id!=='string'||after.id.length>300))throw new Error('invalid_progress_input');
  if(options.category && !['uncertain','failed','lease','outdated','auth','quota','browser','retry','pending','expired','unconfirmed','configuration','link'].includes(options.category))throw new Error('invalid_progress_input');
  const results=await Promise.allSettled([readProcessingProgress(account,ids,factory),captureProgress(account,factory),
    readPautaProgress(account,'whatsapp',ids,factory),readPautaProgress(account,'stories',ids,factory),readPautaLinkProgress(account,ids,factory),
    ids?Promise.resolve(null):readCaptureActivities(account,{limite:6},factory),ids?Promise.resolve(null):readCaptureStoreSummary(account,factory)]);
  const processing=results[0].status==='fulfilled'?results[0].value:null,captures=results[1].status==='fulfilled'?results[1].value:null;
  const whatsapp=results[2].status==='fulfilled'?results[2].value:null,stories=results[3].status==='fulfilled'?results[3].value:null;
  const evaluation=processing?.evaluation??null,preparation=processing?.preparation??null;
  const links=results[4].status==='fulfilled'?results[4].value:null;
  let problems:ProgressProblem[]=[...(processing?.problems??[]),...(links?.items.map(p=>({id:`link:${p.id}`,productId:p.id,title:p.title,category:'link',
    message:'Não há destino afiliado disponível para esta oferta nesta consulta. Confira o vínculo e a configuração; uma nova captura não substitui essa conferência.',
    href:curationOfferHref(p.id,account.tenantId,{optionKey:p.optionKey}),at:null}))??[])];
  problems=problems.filter(p=>(!options.category||p.category===options.category)&&(!after||p.id>after.id)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const page=problems.slice(0,30),error=results.some(r=>r.status==='rejected');
  const active=!!(captures?.active||evaluation?.queued||evaluation?.running||preparation?.pending||preparation?.running);
  const now=new Date();
  const nextAt=earliest([evaluation?.nextAt??null,preparation?.nextAt??null,captures?.nextAt??null].filter(d=>d!==null&&Date.parse(d)>+now));
  return {version:2,tenantId:account.tenantId,scope,consultedAt:now.toISOString(),mode:processing?.mode??'unknown',evaluation,preparation,captures,
    recent:results[5].status==='fulfilled'&&results[5].value?.available?results[5].value.items.map(r=>({reference:r.reference,stores:r.stores,origin:r.origin,state:r.state,startedAt:r.startedAt,products:r.counts.products,observations:r.counts.observationsSaved})):null,
    stores:results[6].status==='fulfilled'&&results[6].value?results[6].value.map(s=>({...s,
      manual:extensionCaptureEnabled()&&['mercadolivre','amazon','aliexpress'].includes(s.store)&&extensionBatchMarketplaceEnabled(s.store as 'amazon'),
      api:captureEnabled(s.store)})):null,
    links:links?{missing:links.missing}:null,pauta:{whatsapp,stories},problems:page,problemsNext:problems.length>30?captureCursor(cursorScope,{id:page.at(-1)!.id}):null,
    availability:{processing:!!processing,captures:!!captures,whatsapp:results[2].status==='fulfilled',stories:results[3].status==='fulfilled',links:results[4].status==='fulfilled',...(ids?{}:{recent:results[5].status==='fulfilled'&&!!results[5].value?.available,stores:results[6].status==='fulfilled'&&!!results[6].value})},
    poll:{active:!error&&active,nextAt:error?null:nextAt},
    activities:[...(captures?.active?[{kind:'capture',marketplaces:[]}]:[]),...(evaluation?.queued||evaluation?.running?[{kind:'triage',marketplaces:[]}]:[])],
    issues:[...(evaluation?.uncertain?[`${evaluation.uncertain} avaliações com resultado incerto.`]:[]),...(!processing?['Consulta do processamento indisponível.']:[])]};
}

export async function readOperationHistory(account:AccountContext,afterInput?:string,factory:typeof db=db){
  const scope=[account.tenantId,'curation-history-v2'],after=decodeCaptureCursor(afterInput,scope);
  if(after && (typeof after.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(after.at)||!Number.isFinite(Date.parse(after.at))||typeof after.ref!=='string'||after.ref.length>150))throw new Error('invalid_progress_input');
  return read(account,factory,async(tx,now)=>{
    const [ready]=await tx<{ready:boolean;diagnostic:boolean;operation_reader:boolean}[]>`select to_regclass('garimpa.curation_attribute_job') is not null and to_regclass('garimpa.curation_selection_event') is not null as ready,
      exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_attribute_job' and column_name='diagnostic') as diagnostic,to_regclass('garimpa.curation_operation_job') is not null as operation_reader`;
    if(!ready.ready||account.membershipRole==='operator'&&!ready.operation_reader)return {available:false,consultedAt:now.toISOString(),items:[],next:null as string|null};
    const rows=await tx<Array<{ref:string;at:Date;cursor_at:string;product_id:string|null;title:string;state:string;diagnostic:unknown;entries:number|null;exits:number|null}>>`
      with history as (
        select 'job:'||j.id::text as ref,j.updated_at as at,j.product_id,p.title,j.status as state,${tx.unsafe(ready.diagnostic?'j.diagnostic':'null::jsonb')} as diagnostic,null::int as entries,null::int as exits
        from ${tx.unsafe(ready.operation_reader?'garimpa.curation_operation_job':'garimpa.curation_attribute_job')} j join garimpa.product p on p.tenant_id=j.tenant_id and p.id=j.product_id
        where j.tenant_id=${account.tenantId} and j.status in ('completed','superseded','failed','reconciliation')
        union all select 'selection:'||e.edition_id::text,e.created_at,null,'Seleção da vitrine','selection',null,jsonb_array_length(e.entries),jsonb_array_length(e.exits)
        from garimpa.curation_selection_event e where e.tenant_id=${account.tenantId}
        union all select 'release:'||r.id::text,r.created_at,r.product_id,p.title,'released',null,null,null
        from garimpa.curation_attribute_reconciliation r join garimpa.product p on p.tenant_id=r.tenant_id and p.id=r.product_id
        where r.tenant_id=${account.tenantId})
      select *,to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at from history
        where (${after?.at??null}::timestamptz is null or (at,ref)<(${after?.at??null}::timestamptz,${after?.ref??null}::text)) order by at desc,ref desc limit 31`;
    const page=rows.slice(0,30),last=page.at(-1);
    return {available:true,consultedAt:now.toISOString(),items:page.map(r=>({id:r.ref,title:r.title,at:iso(r.at),state:r.state,
      message:r.state==='released'?'Nova tentativa liberada pelo dono após conferência e justificativa. A liberação não confirma que outra chamada já começou.':r.state==='selection'?`${r.entries} entradas e ${r.exits} saídas registradas nesta edição.`:r.state==='completed'?'Avaliação registrada; sua compatibilidade atual é consultada no andamento.':r.state==='superseded'?'Revisão substituída; não representa trabalho pendente atual.':r.state==='reconciliation'?`${diagnosticLabel(r.diagnostic)}. Resultado incerto, sem repetição automática.`:'Falha registrada na avaliação.',
      href:r.product_id?curationOfferHref(r.product_id,account.tenantId):`/admin/curadoria?aba=selecao&conta=${encodeURIComponent(account.tenantId)}`})),
      next:rows.length>30&&last?captureCursor(scope,{at:last.cursor_at,ref:last.ref}):null};
  });
}
