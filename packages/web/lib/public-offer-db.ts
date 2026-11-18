import { db } from "./db.ts";
import type { CatalogPresentation, DealDetail, DealsPage } from "./db.ts";

export type PublicCatalogPage = DealsPage & Partial<CatalogPresentation>;

export async function publicProjectionReady(sqlFactory: typeof db = db): Promise<boolean> {
  if (sqlFactory === db && !process.env.DATABASE_URL) return false;
  if (sqlFactory === db) {
    const registryKey = Symbol.for("bizuminer.public-projection-ready.v1");
    const registry = globalThis as typeof globalThis & { [registryKey]?: Promise<boolean> };
    if (!registry[registryKey]) {
      registry[registryKey] = inspectPublicProjection(sqlFactory).catch((error) => {
        delete registry[registryKey];
        throw error;
      });
    }
    return registry[registryKey];
  }
  return inspectPublicProjection(sqlFactory);
}

async function inspectPublicProjection(sqlFactory: typeof db): Promise<boolean> {
  const sql = sqlFactory();
  try {
    // Select the restricted path only once its whole consumer surface exists,
    // including click recording installed after the read projections.
    // Inspect catalogue entries; never invoke mint/click functions as a probe.
    const [row] = await sql<{ ready: boolean }[]>`select exists (
      select 1 from pg_roles runtime where runtime.rolname='garimpa_public_runtime'
      and not runtime.rolsuper and not runtime.rolbypassrls and not runtime.rolcanlogin
      and not runtime.rolcreaterole and not runtime.rolcreatedb and not runtime.rolreplication
      and pg_has_role(current_user,runtime.oid,'MEMBER')
      and pg_has_role(current_user,runtime.oid,'SET')
      and not exists(select 1 from pg_auth_members m where m.member=runtime.oid)
      and has_schema_privilege(runtime.oid,'garimpa','USAGE')
      and not exists(select 1 from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
        where namespace.nspname='garimpa' and relation.relkind in ('r','p','v','m','f')
        and (has_table_privilege(runtime.oid,relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(runtime.oid,relation.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      and not exists (
      select 1 from unnest(array[
        'garimpa.public_deal_detail(text)',
        'garimpa.public_catalog(text,jsonb)',
        'garimpa.public_campaign_link(text,text)',
        'garimpa.public_monetized_target(text)',
        'garimpa.public_short_link(text,text)',
        'garimpa.public_catalog_stats(text,integer)',
        'garimpa.public_mint_short_link(text,text,text)',
        'garimpa.public_hero_candidates(text)',
        'garimpa.record_public_click(text,text,text,text,text)'
      ]::text[]) required(signature)
      where to_regprocedure(required.signature) is null
        or not has_function_privilege(runtime.oid,to_regprocedure(required.signature),'EXECUTE')
        or has_function_privilege('anon',to_regprocedure(required.signature),'EXECUTE')
        or has_function_privilege('authenticated',to_regprocedure(required.signature),'EXECUTE')
        or not exists(select 1 from pg_proc p where p.oid=to_regprocedure(required.signature)
          and p.prosecdef and 'search_path=pg_catalog, garimpa'=any(p.proconfig))
      )
    ) as ready`;
    return row?.ready === true;
  } finally { await sql.end(); }
}

export async function withPublicDb<T>(run: (tx: ReturnType<typeof db>) => Promise<T>, sqlFactory: typeof db = db): Promise<T> {
  const sql = sqlFactory();
  try {
    return await sql.begin(async tx => {
      await tx`set local role garimpa_public_runtime`;
      return run(tx as unknown as ReturnType<typeof db>);
    }) as unknown as T;
  } finally { await sql.end(); }
}

export async function publicDealDetail(slug: string, sqlFactory: typeof db = db): Promise<DealDetail | null> {
  const detail = await withPublicDb(async tx => {
    const [schema] = await tx<{ready:boolean}[]>`select to_regprocedure('garimpa.public_offer_deadline(text)') is not null as ready`;
    if (!schema?.ready) {
      const [legacy]=await tx<{value:DealDetail|null}[]>`select garimpa.public_deal_detail(${slug}) as value`;
      return legacy?.value ?? null;
    }
    const [row] = await tx<{ value: DealDetail | null; valid_until:Date|string|null }[]>`
      select garimpa.public_deal_detail(${slug}) as value,garimpa.public_offer_deadline(${slug}) as valid_until`;
    if (!row?.value) return null;
    return {...row.value,deal:{...row.value.deal,
      offerValidUntil:row.valid_until ? new Date(row.valid_until).toISOString() : undefined}};
  }, sqlFactory);
  return detail;
}

/** Resolve a bounded group in one account-free public read; null means the
 * installed schema predates deadline support, not that offers are current. */
export async function publicOfferDeadlines(slugs:string[],sqlFactory:typeof db=db):Promise<Map<string,string|null>|null> {
  const unique=[...new Set(slugs)].slice(0,24);
  if (!unique.length) return new Map();
  return withPublicDb(async tx=>{
    const [schema]=await tx<{ready:boolean}[]>`select to_regprocedure('garimpa.public_offer_deadline(text)') is not null as ready`;
    if (!schema?.ready) return null;
    const rows=await tx<{slug:string;deadline:Date|string|null}[]>`select s.slug,garimpa.public_offer_deadline(s.slug) as deadline
      from unnest(${unique}::text[]) s(slug)`;
    return new Map(rows.map(row=>[row.slug,row.deadline ? new Date(row.deadline).toISOString() : null]));
  },sqlFactory);
}

export type PublicOfferHistory = { slug:string; title:string; marketplace:string; imageUrl:string|null;
  observedAt:string|null; priceCents:number|null; priceType:"exact"|"range"|"from"|null; priceMaxCents:number|null };
export async function publicOfferHistory(slug:string,sqlFactory:typeof db=db):Promise<PublicOfferHistory|null> {
  if (!slug || slug.length>512 || /[\x00-\x20\x7f/\\?#]/.test(slug) || (sqlFactory===db && !process.env.DATABASE_URL)) return null;
  const sql=sqlFactory();
  try {
    const [ready]=await sql<{ready:boolean}[]>`select to_regprocedure('garimpa.public_offer_history_stub(text,text)') is not null as ready`;
    if (!ready?.ready) return null;
  } finally {await sql.end();}
  return withPublicDb(async tx=>{
    const [row]=await tx<{value:unknown}[]>`select garimpa.public_offer_history_stub(${slug},null) as value`;
    const value=row?.value;
    if (!value || typeof value!=="object" || Array.isArray(value)) return null;
    const raw=value as Record<string,unknown>;
    if (raw.slug!==slug || typeof raw.title!=="string" || !raw.title.trim() || typeof raw.marketplace!=="string") return null;
    const validPrice=(n:unknown):n is number=>typeof n==='number' && Number.isSafeInteger(n) && n>0;
    const priceType=raw.priceType==='exact' || raw.priceType==='range' || raw.priceType==='from' ? raw.priceType : null;
    const priceCents=priceType && validPrice(raw.priceCents) ? raw.priceCents : null;
    const priceMaxCents=priceType==='range' && validPrice(raw.priceMaxCents) && priceCents!==null && raw.priceMaxCents>priceCents ? raw.priceMaxCents : null;
    let imageUrl:string|null=null;
    try {if(typeof raw.imageUrl==='string'){const image=new URL(raw.imageUrl);if(image.protocol==='https:' && !image.username && !image.password)imageUrl=image.href;}} catch { /* Optional historical image. */ }
    const observedAt=typeof raw.observedAt==='string' && Number.isFinite(Date.parse(raw.observedAt)) ? new Date(raw.observedAt).toISOString() : null;
    return {slug,title:raw.title,marketplace:raw.marketplace,imageUrl,observedAt,
      priceCents:priceType==='range' && priceMaxCents===null ? null : priceCents,priceType,priceMaxCents};
  },sqlFactory);
}

export async function publicCatalog(tenantId: string, query: Record<string, unknown>, sqlFactory: typeof db = db): Promise<PublicCatalogPage> {
  const page = await withPublicDb(async tx => {
    const [schema]=await tx<{ready:boolean}[]>`select to_regprocedure('garimpa.public_offer_deadline(text)') is not null as ready`;
    if (!schema?.ready) {
      const [legacy]=await tx<{value:PublicCatalogPage}[]>`select garimpa.public_catalog(${tenantId},${tx.json(query as never)}) as value`;
      return legacy!.value;
    }
    // Compute each returned offer's deadline in the same statement snapshot
    // as its price, so a newer observation cannot extend an older price.
    const [row] = await tx<{ value: PublicCatalogPage }[]>`with page as materialized (
        select garimpa.public_catalog(${tenantId},${tx.json(query as never)}) as value
      ) select jsonb_set(page.value,'{deals}',coalesce((
        select jsonb_agg(item.value || jsonb_build_object('offerValidUntil',deadline.valid_until) order by item.ordinality)
        from jsonb_array_elements(page.value->'deals') with ordinality item(value,ordinality)
        cross join lateral (select garimpa.public_offer_deadline(item.value->>'slug') as valid_until) deadline
        where deadline.valid_until is not null
      ),'[]'::jsonb)) as value from page`;
    return row!.value;
  }, sqlFactory);
  return page;
}

export async function publicCampaignLink(code: string, slug?: string | null, sqlFactory: typeof db = db) {
  return withPublicDb(async tx => {
    const [row] = await tx<{ code: string; slug: string; tenant_id: string; link_id: string; social_publication_id: string; web_publication_id: string }[]>`
      select * from garimpa.public_campaign_link(${code},${slug ?? null})`;
    return row ?? null;
  }, sqlFactory);
}

export async function publicCampaignHistory(code:string,slug?:string|null,sqlFactory:typeof db=db) {
  return withPublicDb(async tx=>{
    const [schema]=await tx`select to_regprocedure('garimpa.public_campaign_history(text,text)') is not null as ready`;
    if (!schema?.ready) return null;
    const [row]=await tx<{slug:string;option_key:string|null}[]>`select * from garimpa.public_campaign_history(${code},${slug??null})`;
    return row??null;
  },sqlFactory);
}

export async function publicWorkspaceLink(code:string,slug?:string|null,sqlFactory:typeof db=db){
 return withPublicDb(async tx=>{
  const [schema]=await tx`select to_regprocedure('garimpa.public_workspace_link(text,text)') is not null as ready`;
  if(!schema?.ready)return null;
  const [r]=await tx<{slug:string;option_key:string|null;workspace:boolean;available:boolean}[]>`select * from garimpa.public_workspace_link(${code},${slug??null})`;return r??null;
 },sqlFactory);
}

export async function publicMonetizedTarget(slug: string, sqlFactory: typeof db = db, optionKey?:string|null) {
  return withPublicDb(async tx => {
    const [schema] = await tx<{ ready: boolean }[]>`
      select to_regprocedure('garimpa.public_confirmed_offer(text,text)') is not null as ready`;
    if (!schema?.ready && optionKey != null) return null;
    const [row] = schema?.ready
      ? await tx<{ url: string; publication_id: string; tenant_id: string }[]>`
          select * from garimpa.public_monetized_target(${slug}::text)
          where ${optionKey ?? null}::text is null or garimpa.public_confirmed_offer(${slug}::text,${optionKey ?? null}::text) is not null`
      : await tx<{ url: string; publication_id: string; tenant_id: string }[]>`
          select * from garimpa.public_monetized_target(${slug}::text)`;
    if (!row) return null;
    const url = new URL(row.url);
    const allowed = ["mercadolivre.com.br", "shopee.com.br", "shope.ee", "aliexpress.com", "amazon.com.br"];
    if (url.protocol !== "https:" || url.username || url.password || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return row;
  }, sqlFactory);
}

export async function recordPublicClick(slug: string, code: string | null, metadata: { agent: string | null; referer: string | null; ipHash: string }, sqlFactory: typeof db = db): Promise<boolean> {
  return withPublicDb(async tx => {
    const [row] = await tx<{ recorded: boolean }[]>`select garimpa.record_public_click(${slug},${code},${metadata.agent},${metadata.referer},${metadata.ipHash}) as recorded`;
    return row?.recorded === true;
  }, sqlFactory);
}

export async function publicShortLink(code:string,tenantId:string|null,sqlFactory:typeof db=db) {
 return withPublicDb(async tx=>{const [row]=await tx<{slug:string|null}[]>`select garimpa.public_short_link(${code},${tenantId}) as slug`;return row?.slug??null;},sqlFactory);
}
export async function publicCatalogStats(tenantId:string,days:number,sqlFactory:typeof db=db) {
 return withPublicDb(async tx=>{
  const [row]=await tx<{value:{categories:string[];marketplaces:Record<string,number>;categoryStats:import('./desirability.ts').CategoryStats[]}}[]>`select garimpa.public_catalog_stats(${tenantId},${days}) as value`;
  return row!.value;
 },sqlFactory);
}
export async function publicHeroCandidates(tenantId:string,sqlFactory:typeof db=db) {
 const rows = await withPublicDb(async tx=>{const [r]=await tx<{value:import('./db.ts').DealRow[]}[]>`select garimpa.public_hero_candidates(${tenantId}) as value`;return r!.value;},sqlFactory);
 return rows;
}
