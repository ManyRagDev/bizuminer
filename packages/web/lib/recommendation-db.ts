import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { db } from "./db.ts";
import { currentAccount, scopedTenantId } from "./account-scope.ts";
import { withAccountDb, withTenantDb } from "./tenant-db.ts";
import { withPublicDb } from "./public-offer-db.ts";
import { composeRecommendations, defaultChannelPolicy, RECOMMENDATION_CHANNELS, RECOMMENDATION_POLICY_VERSION,
  validateChannelPolicy,recommendationBlockers, type RecommendationChannel, type ChannelPolicy } from "./recommendation-policy.ts";
import { homepageFamily } from "./homepage-policy.ts";
import { getEditorialSelectionDesk, validateSuperiorityClaimsInBatch } from "./editorial-selection-db.ts";
import { hasSuperiorityClaim, type EditorialAssessment, type EditorialCandidate, type PublishedEditorialSelection } from "./editorial-selection.ts";

export async function recommendationSchemaReady(sql: Pick<ReturnType<typeof db>,"unsafe">) {
  const [row]=await sql.unsafe<{ready:boolean}[]>("select to_regprocedure('garimpa.read_recommendation_edition(text,text)') is not null as ready");
  return row?.ready===true;
}
function transactionFactory(tx:any):typeof db {
  return (() => Object.assign((...args:any[])=>tx(...args),{unsafe:tx.unsafe.bind(tx),json:tx.json.bind(tx),
    begin:async(...args:any[])=>args.at(-1)(tx),end:async()=>{}})) as typeof db;
}
async function readRecommendationEditions(channels:readonly RecommendationChannel[],tenantId:string,sqlFactory:typeof db=db):Promise<Map<string,PublishedEditorialSelection>> {
  if (!process.env.DATABASE_URL) return new Map();
  return withPublicDb(async tx=>{
    if (!await recommendationSchemaReady(tx)) return new Map<string,PublishedEditorialSelection>();
    const rows=await tx<{channel:string;value:PublishedEditorialSelection|null}[]>`select channel,
      garimpa.read_recommendation_edition(${tenantId},channel) as value from unnest(${[...channels]}::text[]) as channel`;
    return new Map(rows.flatMap(row=>row.value ? [[row.channel,row.value] as const]:[]));
  },sqlFactory);
}
export async function readRecommendationEdition(channel:RecommendationChannel,tenantId:string,sqlFactory:typeof db=db) {
  return (await readRecommendationEditions([channel],tenantId,sqlFactory)).get(channel) ?? null;
}
function publishProduct(c:EditorialCandidate) {
  const { productUrl:_url,lastSeenAt:_seen,curationStatus:_status,evidenceFingerprint:_fingerprint,offerEvidence:_evidence,
    tenantId:_tenant,assessment,selectionBlockers:_blockers,offerMaterialInvalid:_invalid,latestObservationId:_latest,evidenceObservationId:_observation,...product }=c;
  const withdrawn=assessment?.presentation?.status==='withdrawn';
  return {...product,benefit:withdrawn ? undefined:assessment?.benefit ?? product.benefit,audience:withdrawn ? undefined:assessment?.audience ?? product.audience,
    purchaseContents:c.offerOptionKey ? `${(c.offerEvidence as any)?.packageQuantity} un. · ${(c.offerEvidence as any)?.packageContents?.join("; ")}` : product.purchaseContents,editorialRationale:withdrawn ? "Produto aprovado para exploração.":assessment?.publicRationale ?? "Produto aprovado para exploração.",
    editorialPurchaseContents:withdrawn ? "":assessment?.purchaseContents ?? "",editorialContext:"",selectionItemId:`recommendation:${c.id}`};
}
export async function recommendationDesk(tenantId=scopedTenantId(),sqlFactory:typeof db=db) {
  if(currentAccount() && currentAccount()!.tenantId!==tenantId)throw new Error("forbidden_account_scope");
  const visiblePairs:string[]=[];
  const editions=await readRecommendationEditions(RECOMMENDATION_CHANNELS,tenantId,sqlFactory);
  for(const channel of RECOMMENDATION_CHANNELS){
    const selection=editions.get(channel);
    visiblePairs.push(...(selection?.products ?? []).map(p=>`${channel}:${p.id}`));
  }
  return withTenantDb(tenantId,async tx=>{
    if (!await recommendationSchemaReady(tx)) return {ready:false,channels:[],coverage:[],confirmationQueue:[]};
    const channels=await tx<any[]>`select c.*,e.id as edition_id,e.version as edition_version,e.renewed_at,
      jsonb_array_length(e.selection->'products') as prepared_count from garimpa.recommendation_channel c
      left join garimpa.recommendation_edition e using(tenant_id,channel) where c.tenant_id=${tenantId}`;
    const coverage=await tx<any[]>`select e.channel,count(*)::int as prepared,
      count(*) filter(where (e.channel||':'||(i->>'productId'))=any(${visiblePairs}::text[]))::int as shown,
      count(*) filter(where h.comparable_count>=2 and h.distinct_days>=2 and (e.channel||':'||(i->>'productId'))=any(${visiblePairs}::text[]))::int as with_series,
      count(*) filter(where latest.observed_at<now()-interval '48 hours')::int as stale,
      count(*) filter(where garimpa.offer_configuration_key(latest.offer_evidence) is null)::int as configuration_unknown,
      min(latest.observed_at) as oldest_observation,min(h.first_at) as first_history_observation,max(h.distinct_days) as distinct_days,max(h.maximum_gap_hours) as maximum_gap_hours
      from garimpa.recommendation_edition e cross join lateral jsonb_array_elements(e.inputs) i
      join lateral(select o.* from garimpa.price_observation o where o.tenant_id=e.tenant_id and o.product_id=i->>'productId'
        and (i->>'optionKey' is null or o.option_key=i->>'optionKey') order by observed_at desc,id desc limit 1) latest on true
      cross join lateral(select count(*)::int as comparable_count,count(distinct (o.observed_at at time zone 'America/Sao_Paulo')::date)::int as distinct_days
        ,min(o.observed_at) as first_at,max(o.gap_hours) as maximum_gap_hours
        from (select o.*,extract(epoch from(o.observed_at-lag(o.observed_at) over(order by o.observed_at)))/3600 as gap_hours
          from garimpa.price_observation o where o.tenant_id=e.tenant_id and o.product_id=i->>'productId'
            and o.observed_at>=now()-interval '90 days' and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
            and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)) o where o.tenant_id=e.tenant_id and o.product_id=i->>'productId'
        and o.observed_at>=now()-interval '90 days' and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
        and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)) h
      where e.tenant_id=${tenantId} group by e.channel`;
    const confirmationQueue=await tx<any[]>`select p.id,p.title,choice.option_key,max(o.observed_at) as observed_at
      from garimpa.editorial_offer_choice choice join garimpa.product p on p.tenant_id=choice.tenant_id and p.id=choice.product_id
      join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id and c.status in ('approved','held')
      join garimpa.price_observation o on o.tenant_id=p.tenant_id and o.product_id=p.id and o.option_key=choice.option_key
      where choice.tenant_id=${tenantId} group by p.id,p.title,choice.option_key having max(o.observed_at)<now()-interval '24 hours'
      order by max(o.observed_at),p.id limit 30`;
    return {ready:true,channels,coverage,confirmationQueue};
  },sqlFactory);
}
export interface ConfigureChannelInput { expectedTenantId:string;channel:RecommendationChannel;expectedVersion:number|null;enabled:boolean;policy:ChannelPolicy;manualOrder:string[]|null;validUntil:string|null }
export async function configureRecommendationChannel(input:ConfigureChannelInput,sqlFactory:typeof db=db) {
  const account=currentAccount();
  if (!account || account.actor!=="human" || account.membershipRole!=="owner" || input.expectedTenantId!==account.tenantId) return {ok:false as const,error:"forbidden"};
  if (!RECOMMENDATION_CHANNELS.includes(input.channel) || !validateChannelPolicy(input.policy) || typeof input.enabled!=="boolean"
    || (input.manualOrder!==null && (!Array.isArray(input.manualOrder) || input.manualOrder.length>24 || new Set(input.manualOrder).size!==input.manualOrder.length
      || input.manualOrder.some(id=>typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(id))))
    || (input.validUntil!==null && (!Number.isFinite(Date.parse(input.validUntil)) || Date.parse(input.validUntil)<=Date.now()
      || Date.parse(input.validUntil)>Date.now()+7*86400000))) return {ok:false as const,error:"invalid_channel_policy"};
  return withAccountDb(account,async tx=>{
    if (!await recommendationSchemaReady(tx)) return {ok:false as const,error:"migration_required"};
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${account.tenantId}`},0))`;
    const [before]=await tx<any[]>`select version from garimpa.recommendation_channel where tenant_id=${account.tenantId} and channel=${input.channel}`;
    if ((before?.version ?? null)!==input.expectedVersion) return {ok:false as const,error:"channel_conflict"};
    if (input.manualOrder?.length) {
      const products=await tx`select id from garimpa.product where tenant_id=${account.tenantId} and id=any(${input.manualOrder})`;
      if (products.length!==input.manualOrder.length) return {ok:false as const,error:"invalid_products"};
    }
    await tx`insert into garimpa.recommendation_channel(tenant_id,channel,version,policy_version,enabled,policy,manual_order,valid_until)
      values(${account.tenantId},${input.channel},${(before?.version ?? 0)+1},${RECOMMENDATION_POLICY_VERSION},${input.enabled},
        ${tx.json(input.policy as any)},${input.manualOrder===null ? null:tx.json(input.manualOrder)},${input.validUntil})
      on conflict(tenant_id,channel) do update set version=excluded.version,policy_version=excluded.policy_version,
        enabled=excluded.enabled,policy=excluded.policy,manual_order=excluded.manual_order,valid_until=excluded.valid_until,updated_at=now()`;
    return {ok:true as const};
  },sqlFactory);
}
/** Background preparation is atomic across channels, bounded by 24 per channel. */
export async function refreshRecommendationEditions(tenantId=scopedTenantId(),sqlFactory:typeof db=db,dryRun=false,now=new Date()) {
  return withTenantDb(tenantId,async tx=>{
    if (!await recommendationSchemaReady(tx)) return {ready:false,configured:false,channels:[]};
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${tenantId}`},0))`;
    const configs=await tx<any[]>`select * from garimpa.recommendation_channel where tenant_id=${tenantId}`;
    if (!configs.length) return {ready:true,configured:false,channels:[]};
    const factory=transactionFactory(tx),desk=await getEditorialSelectionDesk(tenantId,factory);
    const assessments=desk.candidates.flatMap(c=>c.assessment ? [c.assessment] : []) as EditorialAssessment[];
    const claims=await validateSuperiorityClaimsInBatch(tx,tenantId,assessments,now);
    const candidates=desk.candidates.filter(c=>desk.publishedProductIds.includes(c.id)
      && (!c.assessment || !hasSuperiorityClaim(c.assessment.publicRationale) || claims.get(c.assessment.id)===true));
    const publications=await tx<any[]>`select distinct on(product_id) product_id,slug from garimpa.publication
      where tenant_id=${tenantId} and channel='web' and status='active' order by product_id,published_at desc,id`;
    const slugs=new Map(publications.map(p=>[p.product_id,p.slug]));
    const channels=[];
    for (const config of configs) {
      const channel=config.channel as RecommendationChannel;
      if (!config.enabled || config.policy_version!==RECOMMENDATION_POLICY_VERSION || config.valid_until && new Date(config.valid_until)<=now) {
        channels.push({channel,count:0,changed:false,blocked:"channel_disabled"}); continue;
      }
      const policy=validateChannelPolicy(config.policy);
      if (!policy) throw new Error("invalid_stored_channel_policy");
      const exposures=await tx<any[]>`select product_id as "productId",option_key as "optionKey",price_cents as "priceCents",confirmed_at as "confirmedAt"
        from garimpa.recommendation_exposure where tenant_id=${tenantId} and channel=${channel}
          and confirmed_at>=${now}-interval '30 days'`;
      const {selected,excluded}=composeRecommendations(candidates,channel,policy,exposures.map(e=>({...e,confirmedAt:new Date(e.confirmedAt).toISOString()})),now,config.manual_order ?? undefined);
      const products=selected.map(c=>({...publishProduct(c),slug:slugs.get(c.id)!}));
      const inputs=selected.map(c=>({productId:c.id,productUrl:c.productUrl,observationId:c.evidenceObservationId,
        optionKey:c.offerOptionKey ?? null,assessmentId:c.assessment?.id ?? null,
        validUntil:new Date(Math.min(Date.parse(String(c.evidenceObservedAt))+48*3_600_000,
          Date.parse(c.lastSeenAt)+7*86400000,config.valid_until ? +new Date(config.valid_until):Infinity,
          c.assessment?.comparativeBasis?.checkedAt ? Date.parse(c.assessment.comparativeBasis.checkedAt)+48*3_600_000:Infinity)).toISOString()}));
      const dependencies=[];
      for (const c of selected) {
        const alternatives=c.assessment?.comparativeBasis?.alternativeProductIds ?? [];
        if (!alternatives.length) continue;
        const facts=await tx<any[]>`select p.id,p.title,p.product_url,p.image_url,o.id as observation_id from garimpa.product p
          join lateral(select id from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id order by observed_at desc,id desc limit 1) o on true
          where p.tenant_id=${tenantId} and p.id=any(${alternatives})`;
        dependencies.push(...facts.map(f=>({ownerProductId:c.id,productId:f.id,title:f.title,productUrl:f.product_url,imageUrl:f.image_url,observationId:f.observation_id})));
      }
      const [before]=await tx<any[]>`select * from garimpa.recommendation_edition where tenant_id=${tenantId} and channel=${channel}`;
      const changed=!before || before.config_version!==config.version || !isDeepStrictEqual(before.selection.products,JSON.parse(JSON.stringify(products)))
        || !isDeepStrictEqual(before.inputs,JSON.parse(JSON.stringify(inputs)));
      const id=changed ? randomUUID():before.id,version=(before?.version ?? 0)+(changed ? 1:0);
      const validUntil=inputs.length ? inputs.map(i=>i.validUntil).sort()[0]:null;
      const selection:PublishedEditorialSelection={schemaReady:true,homepageReady:true,mode:"editorial",id,version,validUntil,
        homepageEditionId:id,products,heroProductIds:channel==='home' ? selected.filter(c=>!recommendationBlockers(c,'whatsapp',now).length).filter((c,i,list)=>list.findIndex(other=>homepageFamily(other)===homepageFamily(c))===i).slice(0,3).map(c=>c.id):[],heroValidUntil:validUntil,
        renewedAt:changed ? now.toISOString():new Date(before.renewed_at).toISOString()};
      channels.push({channel,count:products.length,changed,excluded,products:products.map(p=>({id:p.id,title:p.title,optionKey:p.offerOptionKey}))});
      if (dryRun || !changed) continue;
      await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
        values(${id},${tenantId},${channel},${version},${config.version},${now},${tx.json(selection as any)},${tx.json(inputs)})`;
      await tx`insert into garimpa.recommendation_edition(tenant_id,channel,id,version,config_version,policy_version,renewed_at,valid_until,selection,inputs,dependencies)
        values(${tenantId},${channel},${id},${version},${config.version},${RECOMMENDATION_POLICY_VERSION},${now},${validUntil},${tx.json(selection as any)},${tx.json(inputs)},${tx.json(dependencies)})
        on conflict(tenant_id,channel) do update set id=excluded.id,version=excluded.version,config_version=excluded.config_version,policy_version=excluded.policy_version,
          renewed_at=excluded.renewed_at,valid_until=excluded.valid_until,selection=excluded.selection,inputs=excluded.inputs,dependencies=excluded.dependencies`;
    }
    return {ready:true,configured:true,channels};
  },sqlFactory);
}
export async function confirmRecommendationExposure(channel:RecommendationChannel,editionId:string,productId:string,sqlFactory:typeof db=db) {
  const account=currentAccount();
  if (!account || account.actor!=="human" || !account.actorAppUserId || !RECOMMENDATION_CHANNELS.includes(channel)) return {ok:false as const,error:"forbidden"};
  return withAccountDb(account,async tx=>{
    const [edition]=await tx<any[]>`select selection from garimpa.recommendation_edition_archive where tenant_id=${account.tenantId}
      and channel=${channel} and id=${editionId}::uuid and prepared_at>now()-interval '7 days'`;
    const product=edition?.selection?.products?.find((p:any)=>p.id===productId);
    if (!product) return {ok:false as const,error:"edition_changed"};
    await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by)
      values(${account.tenantId},${channel},${editionId},${product.id},${product.offerOptionKey ?? null},${product.priceCents},${account.actorAppUserId})
      on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    return {ok:true as const};
  },sqlFactory);
}
