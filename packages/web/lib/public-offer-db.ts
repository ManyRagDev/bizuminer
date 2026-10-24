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
  return withPublicDb(async tx => {
    const [row] = await tx<{ value: DealDetail | null }[]>`select garimpa.public_deal_detail(${slug}) as value`;
    return row?.value ?? null;
  }, sqlFactory);
}

export async function publicCatalog(tenantId: string, query: Record<string, unknown>, sqlFactory: typeof db = db): Promise<PublicCatalogPage> {
  return withPublicDb(async tx => {
    const [row] = await tx<{ value: PublicCatalogPage }[]>`select garimpa.public_catalog(${tenantId},${tx.json(query as never)}) as value`;
    return row!.value;
  }, sqlFactory);
}

export async function publicCampaignLink(code: string, slug?: string | null, sqlFactory: typeof db = db) {
  return withPublicDb(async tx => {
    const [row] = await tx<{ code: string; slug: string; tenant_id: string; link_id: string; social_publication_id: string; web_publication_id: string }[]>`
      select * from garimpa.public_campaign_link(${code},${slug ?? null})`;
    return row ?? null;
  }, sqlFactory);
}

export async function publicMonetizedTarget(slug: string, sqlFactory: typeof db = db) {
  return withPublicDb(async tx => {
    const [row] = await tx<{ url: string; publication_id: string; tenant_id: string }[]>`select * from garimpa.public_monetized_target(${slug})`;
    if (!row) return null;
    const url = new URL(row.url);
    const allowed = ["mercadolivre.com.br", "shopee.com.br", "shope.ee", "aliexpress.com"];
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
 return withPublicDb(async tx=>{const [r]=await tx<{value:import('./db.ts').DealRow[]}[]>`select garimpa.public_hero_candidates(${tenantId}) as value`;return r!.value;},sqlFactory);
}
