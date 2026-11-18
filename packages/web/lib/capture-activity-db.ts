import type postgres from "postgres";
import { db } from "./db.ts";
import { currentAccount, authorizeAccountTransaction, releaseAccountTransaction } from "./account-scope.ts";
import type { AccountContext } from "./account-context.ts";
import { captureFilters, captureReference, captureCursor, decodeCaptureCursor, CaptureInputError,
  record, count, instant, captureIssue, captureValidationLabels, type CaptureOrigin } from "./capture-activity.ts";
import { sourcePageUrl } from "../../capture/src/source-page-url.ts";

type Tx = postgres.TransactionSql;
type Row = {ref:string;kind:CaptureOrigin;purpose:string;stores:string[];at:Date;cursor_at:string;ended:Date|null;status:string;data:unknown};
export type CaptureActivity = ReturnType<typeof present>;
function present(row: Row) {
  const data=record(row.data), result=record(data.result), counts=record(result.counts), execution=record(data.execution);
  const ids=Array.isArray(result.productIds) ? [...new Set(result.productIds.filter(id=>typeof id==='string'))] : [];
  return { reference:row.ref, origin:row.kind, purpose:row.purpose, stores:row.stores,
    purposeLabel:row.purpose==='internal' ? data.mode==='verification' ? 'Conferência de oferta' : 'Acompanhamento de preço' : null,
    startedAt:instant(row.at)!, receivedAt:row.kind==='manual' ? instant(row.at) : null, finishedAt:instant(row.ended),
    clientCapturedAt:instant(result.clientCapturedAt ?? data.clientCapturedAt), state:row.status,
    phase:typeof execution.phase==='string' && ['queued','capturing','awaiting_browser','retry_wait','awaiting_authorization','awaiting_reconciliation','publishing','affiliating','triaging','finished'].includes(execution.phase) ? execution.phase : null,
    deadline:instant(execution.deadline), nextAttemptAt:instant(execution.nextAttemptAt),
    issue:captureIssue(execution.error ?? data.error), receiptVersion:row.kind==='manual' ? count(result.version) ?? 1 : null,
    counts:{received:count(counts.received),valid:count(counts.valid),rejected:count(counts.rejected),duplicates:count(counts.duplicates),
      products:row.kind==='manual' ? ids.length : row.kind==='individual' ? 1 : null,
      observationsSaved:row.kind==='manual' ? count(counts.observationsSaved) : row.kind==='individual' ? 1 : null,
      productsCreated:count(counts.productsCreated),productsUpdated:count(counts.productsUpdated),
      itemsReported:count(data.itemsCaptured), searches:count(data.searches)},
  };
}

// Activities are paginated before any product expansion. Internal runs cannot hide
// receipts or their parent batches. Every branch carries the explicit tenant.
function activityIndex(kind?:CaptureOrigin) {
  const sources:Record<CaptureOrigin,string>={manual:`select 'manual:'||r.device_id||':'||r.request_id::text as ref,'manual'::text as kind,'capture'::text as purpose,
   case when r.result->>'marketplace' in ('mercadolivre','amazon','aliexpress') then array[r.result->>'marketplace']
   else array(select distinct p.marketplace from jsonb_array_elements_text(case when jsonb_typeof(r.result->'productIds')='array' then r.result->'productIds' else '[]'::jsonb end) ids(id)
     join garimpa.product p on p.id=ids.id and p.tenant_id=r.tenant_id) end as stores,
   r.created_at as at,r.created_at as ended,'saved'::text as status,jsonb_build_object('result',r.result) as data
 from garimpa.extension_capture_receipt r where r.tenant_id=$1 ${kind ? 'and r.device_id=$2 and r.request_id=$3::uuid' : ''}`,
 batch:`select 'batch:'||b.id::text as ref,'batch'::text as kind,'capture'::text as purpose,b.requested_marketplaces as stores,
   b.started_at as at,b.finished_at as ended,b.status::text as status,b.metadata as data
 from garimpa.capture_batch b where b.tenant_id=$1 ${kind ? 'and b.id=$2::uuid' : ''}`,
 run:`select 'run:'||r.id as ref,'run'::text as kind,case when r.parameters->>'captureMode' in ('verification','monitoring') then 'internal' else 'capture' end as purpose,
   array[r.marketplace] as stores,r.started_at as at,r.finished_at as ended,r.status,
   jsonb_build_object('error',r.error,'itemsCaptured',r.items_captured,'mode',r.parameters->>'captureMode') as data
 from garimpa.capture_run r where r.tenant_id=$1 and not exists(select 1 from garimpa.capture_batch b
   where b.tenant_id=r.tenant_id and b.id::text=r.parameters->>'operationBatchId')
   ${kind ? 'and r.id=$2' : ''}`,
 individual:`select 'individual:'||o.id as ref,'individual'::text as kind,'capture'::text as purpose,array[p.marketplace] as stores,
   o.observed_at as at,null::timestamptz as ended,'saved'::text as status,jsonb_build_object('clientCapturedAt',o.client_captured_at) as data
 from garimpa.price_observation o join garimpa.product p on p.tenant_id=o.tenant_id and p.id=o.product_id
 where o.tenant_id=$1 and o.capture_run_id is null and not exists (
   select 1 from garimpa.extension_capture_receipt r where r.tenant_id=o.tenant_id and r.device_id=o.extension_device_id
     and (r.result->'productIds') @> jsonb_build_array(o.product_id)
     and ((r.result->>'version'='2' and (r.result->'items') @> jsonb_build_array(jsonb_build_object('productId',o.product_id,'observationId',o.id)))
       or (r.result->>'version' is distinct from '2'
         and o.client_request_id=garimpa.manual_extension_item_request_id(r.device_id,r.request_id,p.marketplace,p.external_id))))
   ${kind ? 'and o.id=$2' : ''}`};
  return `with activities as (${kind ? sources[kind] : Object.values(sources).join(' union all ')}) `;
}

async function snapshot<T>(context: AccountContext, work:(tx:Tx)=>Promise<T>, factory:typeof db) {
  if(currentAccount() && currentAccount()!.tenantId!==context.tenantId) throw new Error('forbidden_account_scope');
  const sql=factory();
  try { return await sql.begin('isolation level repeatable read read only',async tx=>{
    try { await authorizeAccountTransaction(tx,context);return await work(tx); }
    finally {releaseAccountTransaction(tx);}
  }) as T; } finally {await sql.end();}
}
async function ready(tx:Tx) {
  const [row]=await tx<{ready:boolean}[]>`select to_regprocedure('garimpa.manual_extension_item_request_id(text,uuid,text,text)') is not null
    and exists(select 1 from pg_policies where schemaname='garimpa' and tablename='extension_capture_receipt'
      and policyname='extension_capture_receipt_history_read') as ready`;
  return row?.ready===true;
}

export async function readCaptureActivities(context: AccountContext,input:Record<string,unknown>={},factory:typeof db=db) {
  const filters=captureFilters(input), scope=[context.tenantId,'activities',filters];
  const after=decodeCaptureCursor(input.depois,scope);
  if(after && (typeof after.at!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(after.at)
    || !Number.isFinite(Date.parse(after.at)) || !captureReference(after.ref))) throw new CaptureInputError();
  return snapshot(context,async tx=>{
    const [{now}]=await tx<{now:Date}[]>`select statement_timestamp() as now`;
    if(!await ready(tx)) return {version:1 as const,available:false,consultedAt:now.toISOString(),items:[] as CaptureActivity[],nextCursor:null as string|null};
    const rows=await tx.unsafe<Row[]>(activityIndex()+`select *,to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at from activities
      where ($2::text is null or $2=any(stores)) and ($3::text is null or kind=$3)
      and ($4='todas' or purpose=case when $4='internas' then 'internal' else 'capture' end)
      and ($5::text is null or status=$5) and ($6::text is null or ref=$6 or right(ref,length($6)+1)=':'||$6)
      and ($7::date is null or at>=($7::date::timestamp at time zone 'America/Sao_Paulo'))
      and ($8::date is null or at<(($8::date+1)::timestamp at time zone 'America/Sao_Paulo'))
      and ($9::text is null or (at,ref)<($9::timestamptz,$10::text))
      order by at desc,ref desc limit $11`,[context.tenantId,filters.store,filters.origin,filters.purpose,filters.state,filters.reference,
        filters.from,filters.to,after?.at??null,after?.ref??null,filters.limit+1]);
    const page=rows.slice(0,filters.limit),last=page.at(-1);
    return {version:1 as const,available:true,consultedAt:now.toISOString(),items:page.map(present),
      nextCursor:rows.length>filters.limit && last ? captureCursor(scope,{at:last.cursor_at,ref:last.ref}) : null};
  },factory);
}

function membersSql(kind:CaptureOrigin) {
  if(kind==='manual') return `select distinct ids.product_id,o.id as observation_id
    from garimpa.extension_capture_receipt r
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(r.result->'productIds')='array' then r.result->'productIds' else '[]'::jsonb end) ids(product_id)
    left join garimpa.product p on p.tenant_id=r.tenant_id and p.id=ids.product_id
    left join lateral (select item->>'observationId' as observation_id from jsonb_array_elements(
      case when jsonb_typeof(r.result->'items')='array' then r.result->'items' else '[]'::jsonb end) item
      where item->>'productId'=ids.product_id limit 1) saved on true
    left join garimpa.price_observation o on o.tenant_id=r.tenant_id and o.product_id=ids.product_id and o.extension_device_id=r.device_id
      and ((r.result->>'version'='2' and o.id=saved.observation_id) or (r.result->>'version' is distinct from '2'
        and o.client_request_id=garimpa.manual_extension_item_request_id(r.device_id,r.request_id,p.marketplace,p.external_id)))
    where r.tenant_id=$1 and r.device_id=$2 and r.request_id=$3::uuid`;
  if(kind==='batch') return `select o.product_id,o.id as observation_id from garimpa.price_observation o
    join garimpa.capture_run r on r.tenant_id=o.tenant_id and r.id=o.capture_run_id
    where o.tenant_id=$1 and r.parameters->>'operationBatchId'=$2`;
  if(kind==='run') return `select product_id,id as observation_id from garimpa.price_observation where tenant_id=$1 and capture_run_id=$2`;
  return `select product_id,id as observation_id from garimpa.price_observation where tenant_id=$1 and id=$2`;
}
function safeSource(value:unknown,store:unknown):string|null {
  if(typeof value!=='string' || !['mercadolivre','amazon','aliexpress'].includes(String(store))) return null;
  try {const url=new URL(value),domain=store==='amazon' ? 'amazon.com.br' : store==='mercadolivre' ? 'mercadolivre.com.br' : 'aliexpress.com';
    if(url.protocol!=='https:' || url.username || url.password || url.port || !(url.hostname===domain || url.hostname.endsWith('.'+domain))) return null;
    return sourcePageUrl(url,store as 'amazon');
  } catch{return null;}
}

export async function readCaptureActivity(context:AccountContext,reference:string,input:Record<string,unknown>={},factory:typeof db=db) {
  const identity=captureReference(reference),{limit}=captureFilters(input,50);
  const productScope=[context.tenantId,reference,'products',limit],runScope=[context.tenantId,reference,'runs',limit];
  const after=decodeCaptureCursor(input.produtosDepois,productScope),runAfter=decodeCaptureCursor(input.buscasDepois,runScope);
  for(const cursor of [after,runAfter]) if(cursor && (typeof cursor.id!=='string' || !cursor.id || cursor.id.length>300 || /[\x00-\x1f]/.test(cursor.id))) throw new CaptureInputError();
  return snapshot(context,async tx=>{
    const [{now}]=await tx<{now:Date}[]>`select statement_timestamp() as now`;
    if(!await ready(tx)) return {version:1 as const,available:false,consultedAt:now.toISOString(),activity:null};
    const [row]=await tx.unsafe<Row[]>(activityIndex(identity.kind)+`select * from activities`,
      [context.tenantId,identity.id,...(identity.kind==='manual'?[identity.requestId!]:[])]);
    if(!row) return null;
    const data=record(row.data),result=record(data.result),values=[context.tenantId,identity.id,...(identity.kind==='manual'?[identity.requestId!]:[])];
    const members=membersSql(identity.kind),base=`with members as (${members}) `;
    const [stats]=await tx.unsafe<Array<{products:number;observations:number;linked:number}>>(base+`select count(distinct product_id)::int as products,
      count(observation_id)::int as observations,count(distinct product_id) filter(where observation_id is not null)::int as linked from members`,values);
    const cursorParam=values.length+1,limitParam=values.length+2;
    const products=await tx.unsafe<Array<{id:string;title:string|null;marketplace:string|null;current_price:number|null;current_at:Date|null;
      observation_id:string|null;observed_at:Date|null;price_cents:number|null;title_snapshot:string|null;option_key:string|null;observations:number;
      currency:string|null;price_type:string|null;price_max:string|null;current_currency:string|null;current_type:string|null;current_max:string|null}>>(base+`, grouped as (
      select m.product_id,count(m.observation_id)::int as observations,
        (array_agg(m.observation_id order by o.observed_at desc,o.id desc) filter(where m.observation_id is not null))[1] as observation_id
      from members m left join garimpa.price_observation o on o.tenant_id=$1 and o.id=m.observation_id group by m.product_id)
      select g.product_id as id,p.title,p.marketplace,latest.price_cents as current_price,latest.observed_at as current_at,
        o.id as observation_id,o.observed_at,o.price_cents,o.title_snapshot,o.option_key,g.observations,
        o.offer_evidence->>'currency' as currency,o.offer_evidence->>'priceType' as price_type,o.offer_evidence->>'priceMaxCents' as price_max,
        latest.currency as current_currency,latest.price_type as current_type,latest.price_max as current_max
      from grouped g left join garimpa.product p on p.tenant_id=$1 and p.id=g.product_id
      left join garimpa.price_observation o on o.tenant_id=$1 and o.id=g.observation_id
      left join lateral (select recent.price_cents,recent.observed_at,recent.offer_evidence->>'currency' as currency,
        recent.offer_evidence->>'priceType' as price_type,recent.offer_evidence->>'priceMaxCents' as price_max from garimpa.price_observation recent
        where recent.tenant_id=$1 and recent.product_id=g.product_id order by recent.observed_at desc,recent.id desc limit 1) latest on true
      where ($${cursorParam}::text is null or g.product_id>$${cursorParam}) order by g.product_id limit $${limitParam}`,[...values,after?.id??null,limit+1]);
    const runs=identity.kind==='batch' || identity.kind==='run' ? await tx.unsafe<Array<{id:string;marketplace:string;status:string;started_at:Date;finished_at:Date|null;items_captured:number;error:string|null;parameters:unknown}>>(`select id,marketplace,status,started_at,finished_at,items_captured,error,parameters from garimpa.capture_run
      where tenant_id=$1 and ${identity.kind==='batch' ? "parameters->>'operationBatchId'=$2" : 'id=$2'} and ($3::text is null or id>$3) order by id limit $4`,
      [context.tenantId,identity.id,runAfter?.id??null,limit+1]) : [];
    const [runStats]=identity.kind==='batch' || identity.kind==='run' ? await tx.unsafe<Array<{total:number;ok:number;error:number;running:number;reported:number}>>(`select count(*)::int total,
      count(*) filter(where status='ok')::int ok,count(*) filter(where status='error')::int error,count(*) filter(where status='running')::int running,
      coalesce(sum(items_captured),0)::int reported from garimpa.capture_run where tenant_id=$1 and ${identity.kind==='batch' ? "parameters->>'operationBatchId'=$2" : 'id=$2'}`,[context.tenantId,identity.id]) : [];
    const activity=present(row),page=products.slice(0,limit),runPage=runs.slice(0,limit),oldReceipt=identity.kind==='manual' && activity.receiptVersion!==2;
    if(identity.kind==='manual') activity.counts.observationsSaved=oldReceipt
      ? stats.linked===stats.products ? stats.observations : null : activity.counts.observationsSaved;
    else {activity.counts.products=stats.products;activity.counts.observationsSaved=stats.observations;}
    activity.counts.itemsReported=runStats?.reported??null;activity.counts.searches=runStats?.total??null;
    const validation=record(result.validation);
    return {version:1 as const,available:true,consultedAt:now.toISOString(),activity,
      sourceUrl:safeSource(record(result.page).url,activity.stores[0]),historicalComplete:stats.linked===stats.products,
      linkedProducts:stats.linked,searchSummary:runStats??null,
      validation:Array.isArray(validation.items) ? validation.items.slice(0,200).map(item=>{const d=record(item);return {index:count(d.index),
        status:d.status==='duplicate'?'duplicate':'rejected',reason:typeof d.reason==='string' && Object.hasOwn(captureValidationLabels,d.reason)?d.reason:'product_invalid'};}) : [],
      products:{items:page.map(p=>({id:p.id,title:p.title??'Produto indisponível',marketplace:p.marketplace,
        original:p.observation_id ? {observationId:p.observation_id,observedAt:instant(p.observed_at),priceCents:p.price_cents,currency:p.currency,priceType:p.price_type,
          priceMaxCents:p.price_max===null?null:count(Number(p.price_max)),title:p.title_snapshot,optionKey:p.option_key,observations:p.observations} : null,
        current:p.current_at ? {priceCents:p.current_price,currency:p.current_currency,priceType:p.current_type,
          priceMaxCents:p.current_max===null?null:count(Number(p.current_max)),observedAt:instant(p.current_at)} : null})),
        nextCursor:products.length>limit ? captureCursor(productScope,{id:page.at(-1)!.id}):null},
      searches:{items:runPage.map(r=>({id:r.id,marketplace:r.marketplace,state:r.status,startedAt:instant(r.started_at),finishedAt:instant(r.finished_at),
        itemsReported:r.items_captured,issue:captureIssue(r.error),purpose:record(r.parameters).captureMode==='verification'?'Conferência de oferta':record(r.parameters).captureMode==='monitoring'?'Acompanhamento de preço':'Busca de captura'})),
        nextCursor:runs.length>limit ? captureCursor(runScope,{id:runPage.at(-1)!.id}):null},
    };
  },factory);
}

/** Per-store facts. A receipt is not a fresh-price count or a channel selection. */
export async function readCaptureStoreSummary(context:AccountContext,factory:typeof db=db) {
  return snapshot(context,async tx=>{
    if(!await ready(tx))return null;
    const rows=await tx.unsafe<Array<{store:string;reference:string|null;received_at:Date|null;observed_at:Date|null;recent:number;approved:number;connection:string}>>(activityIndex()+`
      select m.store,last.ref as reference,last.at as received_at,facts.observed_at,facts.recent,facts.approved,
        coalesce((select cfg.status from garimpa.affiliate_marketplace_config cfg where cfg.affiliate_id=$2 and cfg.marketplace=m.store),'missing') as connection
      from (values ('mercadolivre'),('amazon'),('aliexpress'),('shopee')) m(store)
      left join lateral (select a.ref,a.at from activities a where a.purpose='capture' and m.store=any(a.stores)
        order by a.at desc,a.ref desc limit 1) last on true
      cross join lateral (select max(o.observed_at) as observed_at,
        count(distinct o.product_id) filter(where o.observed_at between statement_timestamp()-interval '48 hours' and statement_timestamp())::int as recent,
        count(distinct o.product_id) filter(where o.observed_at between statement_timestamp()-interval '48 hours' and statement_timestamp() and c.status='approved')::int as approved
        from garimpa.price_observation o join garimpa.product p on p.tenant_id=o.tenant_id and p.id=o.product_id
        left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
        where o.tenant_id=$1 and p.marketplace=m.store) facts`,[context.tenantId,context.affiliateId]);
    return rows.map(row=>({store:row.store,reference:row.reference,lastActivityAt:instant(row.received_at),lastObservedAt:instant(row.observed_at),recentProducts:row.recent,approvedRecentProducts:row.approved,connection:row.connection}));
  },factory);
}
