import { db } from './db.ts';
import type postgres from 'postgres';
import type { AccountContext } from './account-context.ts';
import { currentAccount,authorizeAccountTransaction,releaseAccountTransaction } from './account-scope.ts';
import {curationOfferHref} from './curation-navigation.ts';
import {diagnosticLabel} from './curation-diagnostic.ts';
import type {EvaluationProgress,PreparationProgress,ProgressProblem} from './operation-progress.ts';
type Tx=postgres.TransactionSql;
const iso=(v:Date|string|null|undefined)=>v ? new Date(v).toISOString() : null;
const earliest=(dates:Array<string|null>)=>dates.filter((v):v is string=>!!v).sort()[0]??null;
export async function readAccountProgressSnapshot<T>(account:AccountContext,factory:typeof db,work:(tx:Tx,now:Date)=>Promise<T>):Promise<T> {
  if(currentAccount() && currentAccount()!.tenantId!==account.tenantId) throw new Error('forbidden_account_scope');
  const sql=factory();try{return await sql.begin('isolation level repeatable read read only',async tx=>{
    try {await authorizeAccountTransaction(tx,account);const [{now}]=await tx<{now:Date}[]>`select statement_timestamp() as now`;return await work(tx,now);}
    finally{releaseAccountTransaction(tx);}
  }) as T;}finally{await sql.end();}
}
export async function readProcessingProgress(account:AccountContext,ids?:string[],factory:typeof db=db) {
  return readAccountProgressSnapshot(account,factory,async(tx,now)=>{
    const [schema]=await tx<{ready:boolean;diagnostic:boolean;operation_reader:boolean}[]>`select to_regclass('garimpa.curation_policy_v2') is not null as ready,
      exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='curation_attribute_job' and column_name='diagnostic') as diagnostic,to_regclass('garimpa.curation_operation_job') is not null as operation_reader`;
    if(!schema.ready)return {mode:'legacy' as const,evaluation:null,preparation:null,problems:[] as ProgressProblem[]};
    const [policy]=await tx<{enabled:boolean;version:number}[]>`select enabled,version from garimpa.curation_policy_v2 where tenant_id=${account.tenantId}`;
    if(!policy?.enabled)return {mode:'legacy' as const,evaluation:null,preparation:null,problems:[] as ProgressProblem[]};
    if(account.membershipRole==='operator'&&!schema.operation_reader)throw new Error('operation_reader_unavailable');
    const [facts]=await tx<Array<{recorded:number;compatible:number;reused:number;eligible:number}>>`
      with current as materialized(select p.id,c.status,o.id as observation_id from garimpa.product p
        left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
        left join lateral(select id from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
          and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
            or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
          order by o.observed_at desc,o.id desc limit 1) o on true
        where p.tenant_id=${account.tenantId} and (${ids??null}::text[] is null or p.id=any(${ids??[]}::text[]))),
      assessed as (select c.*,a.observation_id as assessed_observation,
        c.observation_id is not null and garimpa.has_current_curation_assessment(${account.tenantId},c.id,c.observation_id) as compatible,
        exists(select 1 from garimpa.curation_attribute_assessment a where a.tenant_id=${account.tenantId} and a.product_id=c.id) as recorded
        from current c left join garimpa.curation_score_projection s on s.tenant_id=${account.tenantId} and s.product_id=c.id and s.observation_id=c.observation_id
        left join garimpa.curation_attribute_assessment a on a.tenant_id=s.tenant_id and a.product_id=s.product_id and a.id=s.assessment_id)
      select count(distinct id) filter(where recorded)::int recorded,count(distinct id) filter(where compatible)::int compatible,
        count(distinct id) filter(where compatible and observation_id<>assessed_observation)::int reused,
        count(distinct id) filter(where status='approved')::int eligible from assessed`;
    const jobs=schema.operation_reader?await tx<Array<{id:string;product_id:string;title:string;status:string;lease_until:Date|null;next_attempt_at:Date;updated_at:Date;diagnostic:unknown;applicable:boolean}>>`
      select id,product_id,title,status,lease_until,next_attempt_at,updated_at,diagnostic,applicable from garimpa.curation_operation_job
      where tenant_id=${account.tenantId} and (${ids??null}::text[] is null or product_id=any(${ids??[]}::text[]))
        and (status in ('queued','running','reconciliation') or status='failed' and observation_id=current_observation_id) order by id`
      :await tx<Array<{id:string;product_id:string;title:string;status:string;lease_until:Date|null;next_attempt_at:Date;updated_at:Date;diagnostic:unknown;applicable:boolean}>>`
      select j.id::text,j.product_id,p.title,j.status,j.lease_until,j.next_attempt_at,j.updated_at,${tx.unsafe(schema.diagnostic?'j.diagnostic':'null::jsonb')} as diagnostic,
        coalesce(j.input_snapshot#>>'{basis,policyVersion}'='attributes-policy-v2'
          and j.input_snapshot#>>'{basis,promptVersion}'='attributes-prompt-v2.4'
          and jsonb_typeof(j.input_snapshot->'materialSnapshot')='object'
          and j.input_snapshot#>>'{materialSnapshot,title}'=p.title
          and j.input_snapshot#>>'{materialSnapshot,imageUrl}' is not distinct from p.image_url
          and j.input_snapshot#>>'{materialSnapshot,category}' is not distinct from p.category
          and j.input_snapshot#>>'{materialSnapshot,productUrl}'=p.product_url
          and j.input_snapshot->>'latestEventId' is not distinct from (select e.id::text from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1)
          and j.input_snapshot->>'curationStatus' is not distinct from c.status and coalesce(c.status,'pending')<>'rejected'
          and original.option_key=latest.option_key
          and original.price_cents>0 and abs(latest.price_cents-original.price_cents)::numeric/nullif(original.price_cents,0)<0.1
          and garimpa.curation_material_evidence(original.offer_evidence)=garimpa.curation_material_evidence(latest.offer_evidence)
          and nullif(greatest(original.rating_star,0),0) is not distinct from nullif(greatest(latest.rating_star,0),0),false) as applicable
      from garimpa.curation_attribute_job j join garimpa.product p on p.tenant_id=j.tenant_id and p.id=j.product_id
      join garimpa.price_observation original on original.tenant_id=j.tenant_id and original.product_id=j.product_id and original.id=j.observation_id
      left join garimpa.product_curation c on c.tenant_id=j.tenant_id and c.product_id=j.product_id
      left join lateral(select * from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
          or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
        order by o.observed_at desc,o.id desc limit 1) latest on true
      where j.tenant_id=${account.tenantId} and (${ids??null}::text[] is null or j.product_id=any(${ids??[]}::text[]))
        and (j.status in ('queued','running','reconciliation') or j.status='failed' and j.observation_id=latest.id)
      order by j.id`;
    const [exceptions]=await tx<{total:number}[]>`select count(distinct product_id)::int total from garimpa.curation_exception
      where tenant_id=${account.tenantId} and status='open' and expires_at>${now} and (${ids??null}::text[] is null or product_id=any(${ids??[]}::text[]))`;
    const [budget]=await tx<{consumed:number;cap:number|null;reset:Date}[]>`select consumed,(to_jsonb(b)->>'configured_limit')::int as cap,
      (((statement_timestamp() at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo') as reset
      from garimpa.curation_external_budget b where tenant_id=${account.tenantId} and kind='ai' and marketplace='all'
        and local_day=(statement_timestamp() at time zone 'America/Sao_Paulo')::date`;
    const quota=budget?.cap!==null&&budget?.cap!==undefined&&budget.consumed>=budget.cap;
    const evaluation:EvaluationProgress={...facts,exceptions:exceptions.total,queued:0,running:0,uncertain:0,expiredLease:0,failed:0,outdated:0,waiting:0,quota:0,nextAt:null};
    const problems:ProgressProblem[]=[];
    const issue=(j:typeof jobs[number],category:string,message:string)=>problems.push({id:`job:${j.id}`,productId:j.product_id,title:j.title,category,message,
      href:curationOfferHref(j.product_id,account.tenantId,{origin:'avaliacoes'}),at:iso(j.updated_at)});
    for(const job of jobs){
      if(job.status==='reconciliation'){evaluation.uncertain++;issue(job,'uncertain',`${diagnosticLabel(job.diagnostic)}. Resultado incerto; pode ter consumido orçamento. Outra tentativa exige conferência e justificativa do dono.`);}
      else if(job.status==='failed'){evaluation.failed++;issue(job,'failed','Falha registrada na avaliação atual. Confira os dados antes de outra operação.');}
      else if(job.status==='running'){
        if(!job.lease_until || +job.lease_until<=+now){evaluation.expiredLease++;issue(job,'lease','A execução está sem prazo válido e sem resultado confirmado. A consulta não libera outra chamada.');}
        else{evaluation.running++;evaluation.nextAt=earliest([evaluation.nextAt,iso(job.lease_until)]);}
      }else if(!job.applicable){evaluation.outdated++;issue(job,'outdated','A fila contém uma revisão anterior ou sem compatibilidade comprovada. Não foi contada como avaliação atual em execução.');}
      else if(+job.next_attempt_at>+now){evaluation.waiting++;evaluation.nextAt=earliest([evaluation.nextAt,iso(job.next_attempt_at)]);}
      else if(quota){evaluation.quota++;evaluation.waiting++;evaluation.nextAt=earliest([evaluation.nextAt,iso(budget.reset)]);issue(job,'quota','A avaliação aguarda o limite diário registrado pelo worker. A consulta não reinicia o orçamento.');}
      else if(job.diagnostic && typeof job.diagnostic==='object' && (job.diagnostic as any).stage==='configuration' && (job.diagnostic as any).certainty==='not_started'){
        evaluation.waiting++;const next=(job.diagnostic as any).nextAt;
        if(typeof next==='string'&&Number.isFinite(Date.parse(next))&&Date.parse(next)>+now)evaluation.nextAt=earliest([evaluation.nextAt,iso(next)]);
        issue(job,'configuration','O avaliador não iniciou a chamada por falta de configuração válida. O responsável pelo sistema precisa conferir o provedor.');
      }
      else evaluation.queued++;
    }
    const promotions=await tx<Array<{id:string;product_id:string;title:string;marketplace:string;option_key:string;status:string;deadline:Date;next_attempt_at:Date;lease_until:Date|null;reason:string|null;updated_at:Date;current:boolean}>>`
      select r.id::text,r.product_id,p.title,p.marketplace,r.option_key,r.status,r.deadline,r.next_attempt_at,r.lease_until,r.result->>'reason' as reason,r.updated_at,
        r.policy_version=${policy.version} and r.requested_observation_id=(select o.id from garimpa.price_observation o
          where o.tenant_id=r.tenant_id and o.product_id=r.product_id and o.option_key=r.option_key order by o.observed_at desc,o.id desc limit 1) as current
      from garimpa.curation_promotion r join garimpa.product p on p.tenant_id=r.tenant_id and p.id=r.product_id
      where r.tenant_id=${account.tenantId} and (${ids??null}::text[] is null or r.product_id=any(${ids??[]}::text[]))
        and (r.status in ('pending','claimed') or r.status='expired' and r.updated_at>${new Date(+now-86_400_000)}) order by r.id`;
    const preparation:PreparationProgress={products:new Set(promotions.filter(r=>r.current && ['pending','claimed'].includes(r.status) && +r.deadline>+now).map(r=>r.product_id)).size,
      shopeeAuthRequests:promotions.filter(r=>r.marketplace==='shopee'&&r.status==='pending'&&r.reason==='auth'&&r.current&&+r.deadline>+now).length,authAsOf:now.toISOString(),
      pending:0,running:0,unconfirmed:0,browser:0,auth:0,quota:0,retry:0,expired:0,nextAt:null};
    const prepSets=new Map<string,Set<string>>();
    for(const r of promotions){
      const category=r.status==='expired'||+r.deadline<=+now ? 'expired' : !r.current ? 'outdated'
        : ['auth','configuration_mismatch'].includes(r.reason??'') ? 'auth' : ['quota','rate_limit'].includes(r.reason??'') ? 'quota'
        : r.status==='claimed' ? r.lease_until && +r.lease_until>+now ? 'running' : 'unconfirmed'
        : r.marketplace!=='shopee' ? 'browser' : +r.next_attempt_at>+now ? 'retry' : 'pending';
      if(category!=='outdated'){const set=prepSets.get(category)??new Set<string>();set.add(r.product_id);prepSets.set(category,set);(preparation as any)[category]=set.size;}
      if(['running','pending','retry','quota'].includes(category))preparation.nextAt=earliest([preparation.nextAt,iso(category==='running'?r.lease_until:r.next_attempt_at),iso(r.deadline)]);
      if(category!=='running')problems.push({id:`promotion:${r.id}`,productId:r.product_id,title:r.title,category,
        message:({auth:'A conexão da loja ou sua configuração precisa ser conferida.',quota:'A conferência aguarda o limite do provedor; nenhum contador foi reiniciado.',browser:'A oferta aguarda conferência no navegador.',retry:'A conferência aguarda a próxima tentativa registrada.',expired:'O prazo da conferência terminou; os fatos anteriores foram preservados.',outdated:'A conferência é de uma revisão anterior e não representa trabalho atual.',pending:'A conferência está na fila; início não confirmado.',unconfirmed:'A conferência perdeu seu prazo de execução sem resultado confirmado.'})[category]!,
        href:curationOfferHref(r.product_id,account.tenantId,{optionKey:r.option_key}),at:iso(r.updated_at)});
    }
    return {mode:'v2' as const,evaluation,preparation,problems};
  });
}

