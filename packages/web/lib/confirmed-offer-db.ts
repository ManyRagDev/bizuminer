import { db } from "./db.ts";
import { withPublicDb } from "./public-offer-db.ts";
import type { VitrineProduct } from "./deal-view.ts";
import type { HistoryContext,HistoryPoint } from "./price-history.ts";
export interface ConfirmedOfferDetail {product:VitrineProduct;priceHistory:HistoryPoint[];historyContext:HistoryContext}
export async function confirmedOfferDetail(slug:string,key:string,sqlFactory:typeof db=db):Promise<ConfirmedOfferDetail|null> {
  if (!/^[a-f0-9]{32}$/.test(key)) return null;
  return withPublicDb(async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select to_regprocedure('garimpa.public_confirmed_offer(text,text)') is not null as ready`;
    if(!schema?.ready)return null;
    const [row]=await tx<{value:ConfirmedOfferDetail|null}[]>`select garimpa.public_confirmed_offer(${slug},${key}) as value`;
    return row?.value ?? null;
  },sqlFactory);
}
