import type { AccountContext } from "./account-context.ts";
import { db } from "./db.ts";
import { withAccountDb } from "./tenant-db.ts";
import { suggestEquivalentPairs, type EquivalenceSuggestion } from "./curation-equivalence-suggestions.ts";

export type EquivalenceOption = {productId:string;observationId:string;title:string;marketplace:string;optionKey:string;priceCents:number;productUrl:string;
  variant:unknown;conditions:unknown;quantity:unknown;contents:unknown;dimensions:unknown;fieldStates:unknown};
export type EquivalenceGroup = {id:string;reason:string;members:Array<{title:string;marketplace:string;optionKey:string;recognitionReason:string}>};

export async function readEquivalenceDesk(account:AccountContext,sqlFactory:typeof db=db):Promise<{options:EquivalenceOption[];groups:EquivalenceGroup[];suggestions:EquivalenceSuggestion[];available:boolean}> {
  try {
    return await withAccountDb(account,async tx=>{
      const options=await tx<EquivalenceOption[]>`select p.id as "productId",o.id as "observationId",p.title,p.marketplace,
          o.option_key as "optionKey",o.price_cents as "priceCents",p.product_url as "productUrl",
          o.offer_evidence->'variantIdentity' as variant,o.offer_evidence->'conditions' as conditions,
          coalesce(o.offer_evidence->'packageQuantity',o.offer_evidence#>'{conditions,quantity}') as quantity,
          o.offer_evidence->'packageContents' as contents,o.offer_evidence->'dimensions' as dimensions,
          o.offer_evidence->'fieldStates' as "fieldStates"
        from garimpa.product p join lateral (select id,option_key,price_cents,observed_at,offer_evidence from garimpa.price_observation o
          where o.tenant_id=p.tenant_id and o.product_id=p.id order by o.observed_at desc,o.id desc limit 1) o on true
        where p.tenant_id=${account.tenantId} and o.option_key<>'listing'
          and not exists(select 1 from garimpa.curation_equivalence_member m where m.tenant_id=p.tenant_id
            and m.product_id=p.id and m.active)
        order by o.observed_at desc,p.id limit 300`;
      const rows=await tx<{id:string;reason:string;title:string;marketplace:string;option_key:string;recognition_reason:string}[]>`
        select g.id::text,g.reason,p.title,p.marketplace,m.option_key,m.recognition_reason from garimpa.curation_equivalence_group g
        join garimpa.curation_equivalence_member m on m.tenant_id=g.tenant_id and m.group_id=g.id and m.active
        join garimpa.product p on p.tenant_id=m.tenant_id and p.id=m.product_id
        where g.tenant_id=${account.tenantId} and g.revoked_at is null order by g.created_at desc,g.id,p.id`;
      const groups:EquivalenceGroup[]=[];
      for(const row of rows) {
        let group=groups.find(item=>item.id===row.id);
        if(!group) {group={id:row.id,reason:row.reason,members:[]};groups.push(group);}
        group.members.push({title:row.title,marketplace:row.marketplace,optionKey:row.option_key,recognitionReason:row.recognition_reason});
      }
      return {options,groups,suggestions:suggestEquivalentPairs(options),available:true};
    },sqlFactory);
  } catch {return {options:[],groups:[],suggestions:[],available:false};}
}
