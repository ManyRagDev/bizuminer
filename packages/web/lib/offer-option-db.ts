import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { withAccountDb } from "./tenant-db.ts";
import { currentAccount } from "./account-scope.ts";
import { confirmedOfferEvidence, validateOfferConfirmation, type ConfirmOfferInput } from "./offer-option.ts";

export async function optionSchemaReady(sql: Pick<ReturnType<typeof db>,"unsafe">) {
  const [row]=await sql.unsafe<{ready:boolean}[]>("select to_regclass('garimpa.editorial_offer_choice') is not null as ready");
  return row?.ready===true;
}
/** One bounded batch. Aggregate recaptures do not refresh a confirmed option. */
export async function selectedOptionFacts(sql: Pick<ReturnType<typeof db>,"unsafe">,tenantId:string,ids:string[]) {
  if (!ids.length || !await optionSchemaReady(sql)) return new Map<string,any>();
  const rows=await sql.unsafe<any[]>(`select choice.product_id,o.option_key,o.id as observation_id,o.price_cents,o.original_price_cents,
    o.claimed_discount_rate,o.rating_star,o.sales_label,o.sales_count,o.observed_at,o.offer_evidence,
    stats.observation_count,stats.history_days,stats.comparable_count>0 as history_comparable,
    exists(select 1 from garimpa.price_observation newer where newer.tenant_id=choice.tenant_id and newer.product_id=choice.product_id
      and newer.observed_at>o.observed_at and newer.option_key<>o.option_key and newer.offer_evidence->>'priceType'='exact'
      and coalesce(newer.offer_evidence->'variantIdentity'->>'key',newer.offer_evidence->>'variantKey')=
        coalesce(o.offer_evidence->'variantIdentity'->>'key',o.offer_evidence->>'variantKey')) as option_material_invalid,
    concat_ws('; ','Pagamento: '||(o.offer_evidence->'conditions'->>'payment'),'Cupom: '||(o.offer_evidence->'conditions'->>'coupon'),
      'Região: '||(o.offer_evidence->'conditions'->>'region'),'Frete: '||(o.offer_evidence->'conditions'->>'shipping')) as conditions_label
    from garimpa.editorial_offer_choice choice join lateral(select * from garimpa.price_observation o
      where o.tenant_id=choice.tenant_id and o.product_id=choice.product_id and o.option_key=choice.option_key
      order by o.observed_at desc,o.id desc limit 1) o on true
    cross join lateral(select count(*)::int as observation_count,
      coalesce(floor(extract(epoch from(max(h.observed_at)-min(h.observed_at)))/86400),0)::int as history_days,
      count(*) filter(where garimpa.offer_configuration_key(h.offer_evidence)=garimpa.offer_configuration_key(o.offer_evidence)
        and h.offer_evidence->>'currency'=o.offer_evidence->>'currency')::int as comparable_count
      from garimpa.price_observation h where h.tenant_id=choice.tenant_id and h.product_id=choice.product_id
        and h.option_key=choice.option_key and h.observed_at>=now()-interval '90 days') stats
    where choice.tenant_id=$1 and choice.product_id=any($2)`,[tenantId,ids]);
  return new Map(rows.map(row=>[row.product_id,row]));
}
export async function confirmOfferOption(raw: ConfirmOfferInput,sqlFactory:typeof db=db) {
  const input=validateOfferConfirmation(raw),account=currentAccount();
  if (!input) return {ok:false as const,error:"invalid_offer_confirmation"};
  if (!account || account.actor!=="human" || !account.actorAppUserId || input.expectedTenantId!==account.tenantId) return {ok:false as const,error:"forbidden"};
  return withAccountDb(account,async tx=>{
    if (!await optionSchemaReady(tx)) return {ok:false as const,error:"migration_required"};
    const [product]=await tx<any[]>`select p.*,c.status,c.reason_code from garimpa.product p
      join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
      where p.tenant_id=${account.tenantId} and p.id=${input.productId} for update of p`;
    if (!product || product.status==='rejected') return {ok:false as const,error:"product_not_eligible"};
    const [latest]=await tx<any[]>`select id from garimpa.price_observation where tenant_id=${account.tenantId}
      and product_id=${input.productId} order by observed_at desc,id desc limit 1`;
    if (latest?.id!==input.expectedObservationId) return {ok:false as const,error:"evidence_changed"};
    const now=new Date(),evidence=confirmedOfferEvidence(input,product.marketplace,product.product_url,now);
    const [observation]=await tx<any[]>`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,
      title_snapshot,product_url_snapshot,image_url_snapshot,category_snapshot,offer_evidence)
      values(${randomUUID()},${account.tenantId},${product.id},${input.priceCents},${now},${product.title},${product.product_url},
        ${product.image_url},${product.category},${tx.json(evidence as any)}) returning id,option_key`;
    await tx`insert into garimpa.editorial_offer_choice(tenant_id,product_id,option_key,selected_by)
      values(${account.tenantId},${product.id},${observation.option_key},${account.actorAppUserId})
      on conflict(tenant_id,product_id) do update set option_key=excluded.option_key,selected_by=excluded.selected_by,selected_at=now()`;
    await tx`update garimpa.product set last_seen_at=${now},last_price_cents=${input.priceCents} where tenant_id=${account.tenantId} and id=${product.id}`;
    // Deliberately does not approve held/rejected products or create historic points.
    return {ok:true as const,optionKey:observation.option_key};
  },sqlFactory);
}
