import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import { createCampaign, createCommercialKitDraft, reserveCampaignLink, type Sql } from "./commerce-db.ts";
import { calculateContentDigest, calculateKitContentDigest, VALID_CHANNEL_TYPES, type KitSnapshot, type KitMaterial } from "./commerce-contract.ts";
import { calculatePriceEvidence, DEFAULT_PRICE_EVIDENCE_POLICY, type PriceEvidencePolicyConfig, type OfferEvidence } from "./price-evidence.ts";
import { validateCommercialKitRevision, revalidateKitBeforeExport } from "./kit-validator.ts";
import { reserveOperationQuota } from "./saas-entitlement-db.ts";
import { selectedOptionFacts } from './offer-option-db.ts';
import {kitMessage} from './kit-message.ts';

const text = (value: string, max = 4000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("invalid_input");
  return value.trim();
};
const author = (context: AccountContext) => {
  if (context.actor !== "human" || !context.actorAppUserId || !context.membershipRole) throw new Error("forbidden");
  return context.actorAppUserId;
};

async function event(tx: Sql, context: AccountContext, kind: string, id: string, version: number, key: string, payload: unknown) {
  await tx`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload)
    values(${context.tenantId},${kind},${id},${version},${kind},${author(context)},${context.requestId},${key},${tx.json(payload as never)})`;
}

/** Idempotency is scoped to account+operation and compares the complete input. */
async function command<T>(context: AccountContext, name: string, requestId: string, input: unknown, work: (tx: Sql) => Promise<T>, factory: typeof db): Promise<T> {
  author(context); text(requestId,128);
  const digest = calculateContentDigest(input);
  return withAccountDb(context, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${name}:${requestId}`},0))`;
    const [previous] = await tx<{ payload: { digest: string; result: T } }[]>`select payload from garimpa.domain_event
      where tenant_id=${context.tenantId} and aggregate_type='commercial_command' and aggregate_id=${name} and idempotency_key=${requestId}`;
    if (previous) {
      if (previous.payload.digest !== digest) throw new Error("idempotency_conflict");
      return previous.payload.result;
    }
    const result = await work(tx);
    await event(tx,context,"commercial_command",name,1,requestId,{ digest,result });
    return result;
  },factory);
}

interface CurrentFacts {
  productId: string; title: string; productUrl: string; imageUrl: string | null;
  observationId: string; observedAt: string; priceCents: number; originalPriceCents: number | null;
  currency: string; sourceDigest: string; offerEvidence: OfferEvidence & { imageRights?: { status: string } };
  webPublicationId: string | null; slug: string | null;
  optionKey?:string; optionLabel?:string; purchaseContents?:string; conditions?:string;
}
export async function currentFacts(tx: Sql, tenant: string, productId: string, optionKey?:string): Promise<CurrentFacts> {
  const [row] = await tx<{
    id: string; title: string; product_url: string; image_url: string | null; observation_id: string;
    observed_at: string; price_cents: number; original_price_cents: number | null; offer_evidence: CurrentFacts["offerEvidence"];
    web_publication_id: string | null; slug: string | null;
  }[]>`select p.id,p.title,p.product_url,p.image_url,o.id as observation_id,o.observed_at::text,o.price_cents,o.original_price_cents,o.offer_evidence,
      pub.id as web_publication_id,pub.slug
    from garimpa.product p join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id and c.status='approved'
    join lateral(select * from garimpa.price_observation where product_id=p.id and tenant_id=p.tenant_id order by observed_at desc,id desc limit 1) o on true
    left join lateral(select * from garimpa.publication where product_id=p.id and tenant_id=p.tenant_id and status='active' and channel='web' order by published_at desc,id limit 1) pub on true
    where p.id=${productId} and p.tenant_id=${tenant} and p.last_seen_at>=now()-interval '7 days'`;
  if (!row || !Number.isSafeInteger(row.price_cents) || row.price_cents <= 0 || !Number.isFinite(new Date(row.observed_at).getTime()) || new Date(row.observed_at).getTime()>Date.now()) throw new Error("offer_unavailable");
  let option:any;
  if(optionKey){
    option=(await selectedOptionFacts(tx,tenant,[productId])).get(productId);
    if(!option || option.option_key!==optionKey || option.option_material_invalid)throw new Error('option_changed');
    if(Date.parse(option.observed_at)>Date.now() || Date.parse(option.observed_at)<Date.now()-48*3600000)throw new Error('offer_unavailable');
    row.price_cents=option.price_cents;row.original_price_cents=option.original_price_cents;row.observed_at=option.observed_at;
    row.observation_id=option.observation_id;row.offer_evidence=option.offer_evidence;
  }
  const evidence = row.offer_evidence ?? {};
  // A new observation with identical material facts can refresh verification;
  // the approved snapshot still retains its original timestamp/observation id.
  const { source: rawSource,verification:_verification, ...materialEvidence } = evidence as typeof evidence & { source?: Record<string,unknown>;verification?:unknown };
  const source = rawSource ? Object.fromEntries(Object.entries(rawSource).filter(([k]) => k!=="capturedAt")) : null;
  return { productId:row.id,title:row.title,productUrl:row.product_url,imageUrl:row.image_url,
    observationId:row.observation_id,observedAt:row.observed_at,priceCents:row.price_cents,originalPriceCents:row.original_price_cents,
    currency:evidence.currency ?? "UNKNOWN",offerEvidence:evidence,webPublicationId:row.web_publication_id,slug:row.slug,
    ...(option ? {optionKey,optionLabel:(evidence as any).variantLabel,purchaseContents:`${(evidence as any).packageQuantity} un. · ${(evidence as any).packageContents?.join('; ')}`,conditions:option.conditions_label} : {}),
    sourceDigest:calculateContentDigest({title:row.title,url:row.product_url,image:row.image_url,price:row.price_cents,evidence:materialEvidence,source}) };
}

type FactualSnapshot = KitSnapshot & { sourceDigest: string; observationId: string };
function snapshot(facts: CurrentFacts, reasons: readonly string[]): FactualSnapshot {
  return { productId:facts.productId,title:facts.title,priceCents:facts.priceCents,
    ...(facts.originalPriceCents ? {originalPriceCents:facts.originalPriceCents} : {}),currency:facts.currency,
    observedAt:new Date(facts.observedAt).toISOString(),validUntil:new Date(new Date(facts.observedAt).getTime()+48*3600000).toISOString(),
    productUrl:facts.productUrl,...(facts.imageUrl ? {imageUrl:facts.imageUrl} : {}),reasons,
    ...(facts.optionKey?{optionKey:facts.optionKey,optionLabel:facts.optionLabel,purchaseContents:facts.purchaseContents,conditions:facts.conditions}:{}),
    sourceDigest:facts.sourceDigest,observationId:facts.observationId };
}

export async function priceEvidence(tx: Sql, tenant: string, facts: CurrentFacts) {
  const rows = await tx<{ id:string;price_cents:number;original_price_cents:number|null;observed_at:string;offer_evidence:OfferEvidence }[]>`
    select id,price_cents,original_price_cents,observed_at::text,offer_evidence from garimpa.price_observation
    where tenant_id=${tenant} and product_id=${facts.productId}
      and (${facts.optionKey??null}::text is null or option_key=${facts.optionKey??null}) order by observed_at,id`;
  const [policy] = await tx<{ config:PriceEvidencePolicyConfig;version:string }[]>`select config,version from garimpa.effective_price_evidence_policy
    where tenant_id=${tenant} and status='approved' order by created_at desc,id desc limit 1`;
  return calculatePriceEvidence({tenantId:tenant,productId:facts.productId,currentObservationId:facts.observationId,
    observations:rows.map(o=>({id:o.id,priceCents:o.price_cents,originalPriceCents:o.original_price_cents,observedAt:o.observed_at,offerEvidence:o.offer_evidence,currency:o.offer_evidence?.currency})),
    policy:policy?.config ?? DEFAULT_PRICE_EVIDENCE_POLICY,policyVersion:policy?.version,policyStatus:policy ? "approved" : "draft"});
}

interface KitRow {
  id:string;version:number;status:string;current_revision:number;revision_id:string;campaign_id:string|null;opportunity_id:string;
  snapshot:FactualSnapshot;claims:unknown[];materials:KitMaterial[];content_digest:string;
}
export async function lockedKit(tx: Sql, tenant: string, id: string, expectedVersion: number): Promise<KitRow> {
  const [kit] = await tx<KitRow[]>`select k.*,r.id as revision_id,r.snapshot,r.claims,r.materials,r.content_digest
    from garimpa.commercial_kit k join garimpa.commercial_kit_revision r on r.kit_id=k.id and r.tenant_id=k.tenant_id and r.revision=k.current_revision
    left join garimpa.campaign c on c.id=k.campaign_id and c.tenant_id=k.tenant_id
    where k.id=${id} and k.tenant_id=${tenant} and (k.campaign_id is null or c.status<>'archived') for update of k`;
  if (!kit) throw new Error("not_found");
  if (kit.version!==expectedVersion) throw new Error("conflict");
  return kit;
}

export async function validateStored(tx: Sql, context: AccountContext, kit: KitRow) {
  const facts = await currentFacts(tx,context.tenantId,kit.snapshot.productId,kit.snapshot.optionKey);
  const evidence = await priceEvidence(tx,context.tenantId,facts);
  let imageRights:"allowed"|"unknown"="allowed";
  for(const material of kit.materials)for(const assetId of material.assetRefs??[]){
   const [asset]=await tx<any[]>`select rights,status from garimpa.private_artifact where id::text=${assetId} and tenant_id=${context.tenantId} and kind='kit_asset'`;
   const rights=asset?.rights;
   if(asset?.status!=='ready'||!['owned','licensed'].includes(rights?.status)||!rights?.channels?.includes(material.channel)||!rights?.sourceRef?.trim()||(rights.validUntil&&(!Number.isFinite(Date.parse(rights.validUntil))||Date.parse(rights.validUntil)<=Date.now())))imageRights='unknown';
  }
  const validation = validateCommercialKitRevision({snapshot:kit.snapshot,claims:kit.claims,materials:kit.materials,
    evidenceLevel:evidence.state,imageRights});
  const errors: string[] = validation.blockers.map(b=>b.code);
  if(kit.snapshot.optionKey){
    const {workspaceOffers,workspaceTransaction}=await import('./affiliate-workspace-db.ts');
    const {offers}=await workspaceOffers(context,kit.snapshot.productId,workspaceTransaction(tx));
    const offer=offers.find(o=>o.candidate.id===kit.snapshot.productId);
    const channel=kit.materials[0]?.channel.startsWith('whatsapp')?'whatsapp':'stories';
    if(!offer||offer.reference.optionKey!==kit.snapshot.optionKey||offer.blockers[channel].length)errors.push('EDITORIAL_REVIEW_REQUIRED');
  }
  for(const claim of kit.claims) {
    if(!evidence.allowedClaims.some(allowed=>calculateContentDigest(allowed)===calculateContentDigest(claim))) errors.push("CLAIM_NOT_CURRENT");
  }
  if (kit.snapshot.currency==="UNKNOWN" || !/^[A-Z]{3}$/.test(kit.snapshot.currency)) errors.push("CURRENCY_UNKNOWN");
  if (facts.sourceDigest!==kit.snapshot.sourceDigest || facts.currency!==kit.snapshot.currency) errors.push("FACTS_CHANGED");
  if (Date.now()>=new Date(kit.snapshot.validUntil).getTime()) errors.push("EVIDENCE_STALE");
  if (calculateKitContentDigest(kit.snapshot,kit.claims,kit.materials)!==kit.content_digest) errors.push("CONTENT_DIGEST_MISMATCH");
  for (const material of kit.materials) {
    const [link] = await tx<{ slug:string }[]>`select pub.slug from garimpa.campaign_link l
      join garimpa.campaign_publication cp on cp.id=l.publication_id and cp.tenant_id=l.tenant_id and cp.kit_id=${kit.id} and cp.kit_revision_id=${kit.revision_id}
      join garimpa.publication pub on pub.id=l.web_publication_id and pub.tenant_id=l.tenant_id
      where l.id=${material.campaignLinkId ?? null} and l.tenant_id=${context.tenantId} and l.monetization_status='valid'`;
    if (!link) { errors.push("LINK_INVALID"); continue; }
    const [target] = await tx<{ url:string }[]>`select url from garimpa.public_monetized_target(${link.slug})`;
    if (!target?.url) errors.push("LINK_INVALID");
  }
  const validUntil = new Date(Math.min(new Date(validation.validUntil).getTime(),new Date(kit.snapshot.validUntil).getTime(),new Date(evidence.validUntil).getTime())).toISOString();
  return { validation,facts,evidence,errors:[...new Set(errors)],validUntil };
}

export async function createCampaignForAccount(context: AccountContext, input:{name:string;objective:string;audience:string;requestId:string}, factory:typeof db=db) {
  return command(context,"createCampaign",input.requestId,input,async tx=>{
    if (context.membershipRole!=="owner") throw new Error("owner_required");
    await reserveOperationQuota(tx, context, "create_campaign", input.requestId);
    const name=text(input.name,200), objective=text(input.objective), audience=text(input.audience,1000);
    const [policy] = await tx<{id:string}[]>`insert into garimpa.audience_policy(tenant_id,name,status) values(${context.tenantId},${audience},'draft') returning id`;
    const [version] = await tx<{id:string}[]>`insert into garimpa.audience_policy_version(policy_id,tenant_id,version,config)
      values(${policy!.id},${context.tenantId},'manual-1',${tx.json({schemaVersion:1,audience,mode:"manual",rubricStatus:"not_homologated"})}) returning id`;
    const id=await createCampaign(tx,{tenantId:context.tenantId,name,objective,audiencePolicyVersionId:version!.id,createdBy:author(context)});
    await event(tx,context,"CampaignCreated",id,1,input.requestId,{name,audience,mode:"manual"});
    return {campaignId:id,version:1};
  },factory);
}

export async function createKitForAccount(context:AccountContext,input:{campaignId?:string|null;audiencePolicyVersionId?:string;workspaceAuthorId?:string;optionKey?:string;assetIds?:string[];productId:string;channel:string;reason:string;copy?:string;requestId:string;opportunityId?:string},factory:typeof db=db) {
  return command(context,"createKit",input.requestId,input,async tx=>{
    if (!(VALID_CHANNEL_TYPES as readonly string[]).includes(input.channel)) throw new Error("invalid_channel");
    await reserveOperationQuota(tx, context, "create_kit", input.requestId);
    if(input.workspaceAuthorId && input.workspaceAuthorId!==author(context))throw new Error('forbidden');
    const workspaceAuthorId=input.workspaceAuthorId??(!input.campaignId?author(context):undefined);
    const [campaign]=await tx<{id:string;audience_policy_version_id:string}[]>`select id,audience_policy_version_id from garimpa.campaign where id=${input.campaignId??null} and tenant_id=${context.tenantId} and status<>'archived'`;
    const policyId=campaign?.audience_policy_version_id??input.audiencePolicyVersionId;
    if (!policyId || input.campaignId&&!campaign) throw new Error("campaign_policy_required");
    const [policy]=await tx`select id from garimpa.audience_policy_version where id=${policyId} and tenant_id=${context.tenantId}`;
    if(!policy)throw new Error('policy_required');
    const facts=await currentFacts(tx,context.tenantId,input.productId,input.optionKey);
    if (!facts.webPublicationId || !facts.slug) throw new Error("link_unavailable");
    const reason=text(input.reason); const evidence=await priceEvidence(tx,context.tenantId,facts);
    let chosenOpportunityId = input.opportunityId;
    if (chosenOpportunityId) {
      const [opp] = await tx<{id:string;product_id:string}[]>`select id,product_id from garimpa.opportunity where id=${chosenOpportunityId} and tenant_id=${context.tenantId} and state<>'archived'`;
      if (!opp) throw new Error("opportunity_not_found");
      if (opp.product_id !== input.productId) throw new Error("opportunity_product_mismatch");
    } else {
      const [opportunity]=await tx<{id:string}[]>`insert into garimpa.opportunity(tenant_id,product_id,policy_version_id,audience_key,channel,state,class,price_evidence_snapshot,reasons,valid_until)
        values(${context.tenantId},${input.productId},${policyId},'manual',${input.channel},'prioritized','unclassified',${tx.json(evidence as never)},${[reason]},${evidence.validUntil})
        on conflict(tenant_id,product_id,policy_version_id,audience_key,channel) where state<>'archived' do update set updated_at=clock_timestamp(),revision=garimpa.opportunity.revision+1 returning id`;
      chosenOpportunityId = opportunity!.id;
    }
    const snap={...snapshot(facts,[reason]),audiencePolicyVersionId:policyId};
    const copy=input.copy ? text(input.copy) : `${facts.title}\n${reason}${facts.currency!=="UNKNOWN" ? `\nPreço observado: ${(facts.priceCents/100).toFixed(2)} ${facts.currency}.` : ""}`;
    const materials:KitMaterial[]=[{channel:input.channel,shortCopy:copy,cta:"Ver oferta",disclosure:"Link de afiliado. Podemos receber comissão pela compra.",assetRefs:input.assetIds??[]}];
    const kit=await createCommercialKitDraft(tx,{tenantId:context.tenantId,campaignId:campaign?.id??null,opportunityId:chosenOpportunityId,snapshot:snap,claims:[],materials,createdBy:author(context),contentDigest:calculateKitContentDigest(snap,[],materials),audiencePolicyVersionId:policyId,workspaceAuthorId});
    const [destination]=await tx<{id:string}[]>`insert into garimpa.destination(tenant_id,channel,label,automation_mode) values(${context.tenantId},${input.channel},${input.channel},'assisted') returning id`;
    const [publication]=await tx<{id:string}[]>`insert into garimpa.campaign_publication(tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,created_by)
      values(${context.tenantId},${campaign?.id??null},${kit.kitId},${kit.revisionId},${destination!.id},${input.channel},${author(context)}) returning id`;
    const link=await reserveCampaignLink(tx,{tenantId:context.tenantId,publicationId:publication!.id,webPublicationId:facts.webPublicationId});
    const [target]=await tx<{url:string}[]>`select url from garimpa.public_monetized_target(${facts.slug})`;
    await tx`update garimpa.campaign_link set monetization_status=${target?.url ? "valid" : "invalid"},validated_at=clock_timestamp() where id=${link.id} and tenant_id=${context.tenantId}`;
    const linkedMaterials=materials.map(m=>({...m,campaignLinkId:link.id}));
    const [revision]=await tx<{id:string}[]>`insert into garimpa.commercial_kit_revision(tenant_id,kit_id,revision,snapshot,claims,materials,created_by,content_digest)
      values(${context.tenantId},${kit.kitId},2,${tx.json(snap as never)},'[]'::jsonb,${tx.json(linkedMaterials as never)},${author(context)},${calculateKitContentDigest(snap,[],linkedMaterials)}) returning id`;
    await tx`update garimpa.commercial_kit set current_revision=2,version=2 where id=${kit.kitId} and tenant_id=${context.tenantId}`;
    await tx`update garimpa.campaign_publication set kit_revision_id=${revision!.id} where id=${publication!.id} and tenant_id=${context.tenantId}`;
    await event(tx,context,"KitRevisionCreated",kit.kitId,2,input.requestId,{publicationId:publication!.id,revisionId:revision!.id});
    return {kitId:kit.kitId,kitVersion:2,publicationId:publication!.id,publicationVersion:1,code:link.code};
  },factory);
}

export async function validateKitForAccount(context:AccountContext,input:{kitId:string;expectedVersion:number;requestId:string},factory:typeof db=db) {
  return command(context,"validateKit",input.requestId,input,async tx=>{
    const kit=await lockedKit(tx,context.tenantId,input.kitId,input.expectedVersion);
    const checked=await validateStored(tx,context,kit);
    const [validation]=await tx<{id:string}[]>`insert into garimpa.kit_validation(tenant_id,revision_id,input_digest,valid_until,result,blockers,validator_version)
      values(${context.tenantId},${kit.revision_id},${kit.content_digest},${checked.validUntil},${checked.errors.length ? "invalid" : "valid"},${checked.errors},${checked.validation.validatorVersion}) returning id`;
    await tx`update garimpa.commercial_kit set status=${checked.errors.length ? "needs_revision" : "validating"},version=version+1 where id=${kit.id} and tenant_id=${context.tenantId}`;
    await event(tx,context,"KitValidated",kit.id,kit.version+1,input.requestId,{validationId:validation!.id,blockers:checked.errors});
    return {kitId:kit.id,kitVersion:kit.version+1,valid:checked.errors.length===0,blockers:checked.errors};
  },factory);
}

export async function approveKitForAccount(context:AccountContext,input:{kitId:string;expectedVersion:number;requestId:string},factory:typeof db=db) {
  return command(context,"approveKit",input.requestId,input,async tx=>{
    if(context.membershipRole!=='owner')throw new Error('owner_required');
    const kit=await lockedKit(tx,context.tenantId,input.kitId,input.expectedVersion);
    const checked=await validateStored(tx,context,kit);
    if (checked.errors.length) throw new Error(`kit_invalid:${checked.errors.join(",")}`);
    const [validation]=await tx<{id:string}[]>`select id from garimpa.kit_validation where tenant_id=${context.tenantId} and revision_id=${kit.revision_id} and input_digest=${kit.content_digest} and result='valid' and valid_until>now() order by checked_at desc,id desc limit 1`;
    if (!validation) throw new Error("validation_required");
    await tx`insert into garimpa.kit_approval(tenant_id,revision_id,validation_id,approved_by) values(${context.tenantId},${kit.revision_id},${validation.id},${author(context)})`;
    await tx`update garimpa.commercial_kit set status='approved',version=version+1 where id=${kit.id} and tenant_id=${context.tenantId}`;
    await tx`update garimpa.campaign_publication set status='ready',version=version+1 where kit_id=${kit.id} and tenant_id=${context.tenantId} and status='planned'`;
    await event(tx,context,"KitApproved",kit.id,kit.version+1,input.requestId,{revisionId:kit.revision_id});
    return {kitId:kit.id,kitVersion:kit.version+1};
  },factory);
}

async function checkedPublication(tx:Sql,context:AccountContext,publicationId:string,expectedVersion:number) {
  const [pub]=await tx<{id:string;version:number;status:string;kit_id:string;kit_revision_id:string;code:string}[]>`select p.*,l.code from garimpa.campaign_publication p
    join garimpa.campaign_link l on l.publication_id=p.id and l.tenant_id=p.tenant_id and l.monetization_status='valid'
    join garimpa.destination d on d.id=p.destination_id and d.tenant_id=p.tenant_id and d.status='active'
    where p.id=${publicationId} and p.tenant_id=${context.tenantId} for update of p`;
  if (!pub) throw new Error("not_found"); if(pub.version!==expectedVersion) throw new Error("conflict");
  if(!["ready","exported"].includes(pub.status)) throw new Error("publication_not_ready");
  const [version]=await tx<{version:number}[]>`select version from garimpa.commercial_kit where id=${pub.kit_id} and tenant_id=${context.tenantId}`;
  const kit=await lockedKit(tx,context.tenantId,pub.kit_id,version!.version);
  if(kit.status!=="approved" || kit.revision_id!==pub.kit_revision_id) throw new Error("approval_required");
  const checked=await validateStored(tx,context,kit);
  const [approval]=await tx<{valid_until:string}[]>`select v.valid_until::text from garimpa.kit_approval a join garimpa.kit_validation v on v.id=a.validation_id and v.tenant_id=a.tenant_id
    where a.tenant_id=${context.tenantId} and a.revision_id=${kit.revision_id} and v.input_digest=${kit.content_digest} order by a.approved_at desc limit 1`;
  if(!approval) throw new Error("approval_required");
  const drift=revalidateKitBeforeExport({snapshot:kit.snapshot,currentObservedPriceCents:checked.facts.priceCents,validationValidUntil:approval.valid_until});
  return {pub,kit,errors:[...checked.errors,...drift.driftReasons]};
}

export async function preparePublicationExport(context:AccountContext,input:{publicationId:string;expectedVersion:number},factory:typeof db=db) {
  return withAccountDb(context,async tx=>{
    const {pub,kit,errors}=await checkedPublication(tx,context,input.publicationId,input.expectedVersion);
    if(errors.length) throw new Error(`evidence_stale:${errors.join(",")}`);
    const material=kit.materials[0]!;
    return {publicationId:pub.id,publicationVersion:pub.version,code:pub.code,text:kitMessage(kit.snapshot,material,pub.code)};
  },factory);
}

export async function markPublicationExported(context:AccountContext,input:{publicationId:string;expectedVersion:number;requestId:string},factory:typeof db=db) {
  return command(context,"exportPublication",input.requestId,input,async tx=>{
    const {pub,kit,errors}=await checkedPublication(tx,context,input.publicationId,input.expectedVersion);
    if(errors.length) {
      await tx`update garimpa.commercial_kit set status='invalidated',version=version+1 where id=${kit.id} and tenant_id=${context.tenantId}`;
      await event(tx,context,"KitInvalidated",kit.id,kit.version+1,input.requestId,{blockers:errors});
      return {exported:false,blockers:errors,publicationVersion:pub.version};
    }
    await tx`update garimpa.campaign_publication set status='exported',exported_at=coalesce(exported_at,clock_timestamp()),version=version+1 where id=${pub.id} and tenant_id=${context.tenantId}`;
    await event(tx,context,"PublicationExported",pub.id,pub.version+1,input.requestId,{revisionId:kit.revision_id,method:"manual_clipboard"});
    return {exported:true,blockers:[],publicationVersion:pub.version+1};
  },factory);
}

export async function confirmPublication(context:AccountContext,input:{publicationId:string;expectedVersion:number;requestId:string;publishedAt?:string;publicationUrl?:string},factory:typeof db=db) {
  return command(context,"confirmPublication",input.requestId,input,async tx=>{
    const [pub]=await tx<{id:string;version:number;status:string;kit_revision_id:string;kit_id:string;channel:string}[]>`select id,version,status,kit_revision_id,kit_id,channel from garimpa.campaign_publication where id=${input.publicationId} and tenant_id=${context.tenantId} for update`;
    if(!pub) throw new Error("not_found"); if(pub.version!==input.expectedVersion) throw new Error("conflict");
    if(!["ready","exported"].includes(pub.status)) throw new Error("publication_not_ready");
    const publishedAt=new Date(input.publishedAt ?? Date.now());
    const [approval]=await tx<{approved_at:string;valid_until:string}[]>`select a.approved_at::text,v.valid_until::text from garimpa.kit_approval a join garimpa.kit_validation v on v.id=a.validation_id and v.tenant_id=a.tenant_id where a.revision_id=${pub.kit_revision_id} and a.tenant_id=${context.tenantId} order by a.approved_at desc limit 1`;
    if(!approval || !Number.isFinite(publishedAt.getTime()) || publishedAt.getTime()>Date.now()+1000 || publishedAt.getTime()<new Date(approval.approved_at).getTime() || publishedAt.getTime()>new Date(approval.valid_until).getTime()) throw new Error("invalid_publication_time");
    if(input.publicationUrl && new URL(input.publicationUrl).protocol!=="https:") throw new Error("invalid_publication_url");
    await tx`update garimpa.campaign_publication set status='published_confirmed',published_at=${publishedAt.toISOString()},confirmation_source='manual',publication_url=${input.publicationUrl ?? null},version=version+1 where id=${pub.id} and tenant_id=${context.tenantId}`;
    await event(tx,context,"PublicationConfirmed",pub.id,pub.version+1,input.requestId,{source:"manual",publishedAt:publishedAt.toISOString()});
    const [schema]=await tx`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='recommendation_exposure' and column_name='publication_id') as ready`;
    if(schema?.ready){
      const [revision]=await tx<{snapshot:KitSnapshot}[]>`select snapshot from garimpa.commercial_kit_revision where id=${pub.kit_revision_id} and tenant_id=${context.tenantId}`;
      const channel=pub.channel.startsWith('whatsapp')?'whatsapp':pub.channel==='instagram_stories'?'stories':null;
      if(channel&&revision?.snapshot.optionKey)await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,publication_id,product_id,option_key,price_cents,confirmed_by,confirmed_at)
        values(${context.tenantId},${channel},${pub.id},${revision.snapshot.productId},${revision.snapshot.optionKey},${revision.snapshot.priceCents},${author(context)},${publishedAt.toISOString()}) on conflict(tenant_id,publication_id) where publication_id is not null do nothing`;
      await tx`update garimpa.commercial_kit set workspace_visibility='published' where id=${pub.kit_id} and tenant_id=${context.tenantId} and workspace_author_id is not null`;
    }
    return {publicationId:pub.id,publicationVersion:pub.version+1,status:"published_confirmed"};
  },factory);
}

export async function getCommercialDesk(context:AccountContext,factory:typeof db=db) {
  return withAccountDb(context,async tx=>{
    const campaigns=await tx`select id,name,objective,status,version from garimpa.campaign where tenant_id=${context.tenantId} order by created_at desc limit 100`;
    const products=await tx`select p.id,p.title from garimpa.product p join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id and c.status='approved' where p.tenant_id=${context.tenantId} and p.last_seen_at>=now()-interval '7 days' order by p.last_seen_at desc,p.id limit 100`;
    const publications=await tx`select p.id,p.status,p.version,p.channel,p.kit_id,k.version as kit_version,k.status as kit_status,r.snapshot,r.materials,l.code
      from garimpa.campaign_publication p join garimpa.commercial_kit k on k.id=p.kit_id and k.tenant_id=p.tenant_id
      join garimpa.commercial_kit_revision r on r.id=p.kit_revision_id and r.tenant_id=p.tenant_id
      join garimpa.campaign_link l on l.publication_id=p.id and l.tenant_id=p.tenant_id
      where p.tenant_id=${context.tenantId} order by p.created_at desc,p.id limit 100`;
    return {campaigns,products,publications};
  },factory);
}

export async function reviseKitForAccount(context:AccountContext,input:{kitId:string;expectedVersion:number;copy:string;requestId:string;assetId?:string},factory:typeof db=db) {
  return command(context,"reviseKit",input.requestId,input,async tx=>{
    const kit=await lockedKit(tx,context.tenantId,input.kitId,input.expectedVersion);
    const facts=await currentFacts(tx,context.tenantId,kit.snapshot.productId,kit.snapshot.optionKey);
    if(!facts.webPublicationId || !facts.slug) throw new Error("link_unavailable");
    const [old]=await tx<{destination_id:string;channel:string}[]>`select destination_id,channel from garimpa.campaign_publication where kit_id=${kit.id} and tenant_id=${context.tenantId} order by created_at desc limit 1`;
    if(!old) throw new Error("publication_required");
    const snap={...snapshot(facts,kit.snapshot.reasons),...(kit.snapshot.audiencePolicyVersionId?{audiencePolicyVersionId:kit.snapshot.audiencePolicyVersionId}:{})};
    if(input.assetId){const [asset]=await tx<any[]>`select id,rights from garimpa.private_artifact where id::text=${input.assetId} and tenant_id=${context.tenantId} and kind='kit_asset' and status='ready'`;if(!asset||!['owned','licensed'].includes(asset.rights.status)||!asset.rights.channels?.includes(old.channel)||!asset.rights.sourceRef?.trim())throw new Error('asset_rights_required');}
    const materials=kit.materials.map(m=>({...m,shortCopy:text(input.copy),campaignLinkId:undefined,...(input.assetId?{assetRefs:[input.assetId]}:{})}));
    const revisionNumber=kit.current_revision+1;
    const [draft]=await tx<{id:string}[]>`insert into garimpa.commercial_kit_revision(tenant_id,kit_id,revision,snapshot,claims,materials,created_by,content_digest)
      values(${context.tenantId},${kit.id},${revisionNumber},${tx.json(snap as never)},'[]'::jsonb,${tx.json(materials as never)},${author(context)},${calculateKitContentDigest(snap,[],materials)}) returning id`;
    const [pub]=await tx<{id:string}[]>`insert into garimpa.campaign_publication(tenant_id,campaign_id,kit_id,kit_revision_id,destination_id,channel,created_by)
      values(${context.tenantId},${kit.campaign_id},${kit.id},${draft!.id},${old.destination_id},${old.channel},${author(context)}) returning id`;
    const link=await reserveCampaignLink(tx,{tenantId:context.tenantId,publicationId:pub!.id,webPublicationId:facts.webPublicationId});
    const [target]=await tx<{url:string}[]>`select url from garimpa.public_monetized_target(${facts.slug})`;
    await tx`update garimpa.campaign_link set monetization_status=${target?.url ? "valid" : "invalid"},validated_at=clock_timestamp() where id=${link.id} and tenant_id=${context.tenantId}`;
    const linked=materials.map(m=>({...m,campaignLinkId:link.id}));
    const [revision]=await tx<{id:string}[]>`insert into garimpa.commercial_kit_revision(tenant_id,kit_id,revision,snapshot,claims,materials,created_by,content_digest)
      values(${context.tenantId},${kit.id},${revisionNumber+1},${tx.json(snap as never)},'[]'::jsonb,${tx.json(linked as never)},${author(context)},${calculateKitContentDigest(snap,[],linked)}) returning id`;
    await tx`update garimpa.campaign_publication set status='cancelled',version=version+1 where kit_id=${kit.id} and tenant_id=${context.tenantId} and id<>${pub!.id} and status in ('planned','ready')`;
    await tx`update garimpa.campaign_publication set kit_revision_id=${revision!.id} where id=${pub!.id} and tenant_id=${context.tenantId}`;
    await tx`update garimpa.commercial_kit set status='draft',version=version+1,current_revision=${revisionNumber+1} where id=${kit.id} and tenant_id=${context.tenantId}`;
    await event(tx,context,"KitRevisionCreated",kit.id,kit.version+1,input.requestId,{publicationId:pub!.id,revisionId:revision!.id,predecessorRevisionId:kit.revision_id});
    return {kitId:kit.id,kitVersion:kit.version+1,publicationId:pub!.id,publicationVersion:1};
  },factory);
}
