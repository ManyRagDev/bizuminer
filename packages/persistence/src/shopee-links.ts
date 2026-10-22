/** Account-owned publication; provider effects are always outside the SQL transaction. */
import postgres from 'postgres';
import { ShopeeAdapter } from '../../capture/src/adapters/shopee/index.ts';
import type { CaptureAdapter, CaptureContext, Credential } from '../../capture/src/types.ts';
import { withMonitoringDb } from './monitoring-db.ts';
import { assertAccountActive, withAccountCredential } from './account-credentials.ts';
export interface GenerateShopeeLinksOptions {
  readonly connectionString:string; readonly tenantId:string;
  readonly credential?:Credential; readonly affiliateId?:string;
  readonly sqlFactory?:()=>postgres.Sql; readonly adapter?:CaptureAdapter;
}
export interface GenerateShopeeLinksSummary {readonly candidates:number;readonly generated:number;readonly failed:number;}
export async function ensureShopeeAffiliateLinks(opts:GenerateShopeeLinksOptions,ctx:CaptureContext):Promise<GenerateShopeeLinksSummary> {
  const sql=opts.sqlFactory?.()??postgres(opts.connectionString,{prepare:false,max:1,ssl:opts.connectionString.includes('localhost')?false:{rejectUnauthorized:false}});
  const scoped=<T>(work:(tx:postgres.Sql)=>Promise<T>)=>withMonitoringDb(sql,opts.tenantId,async tx=>{await assertAccountActive(opts.tenantId,tx);return work(tx);});
  const adapter=opts.adapter??new ShopeeAdapter(); let generated=0,failed=0;
  try {
    const account=await scoped(async tx=>{const [a]=await tx<{id:string;public_slug:string}[]>`select id,public_slug from garimpa.affiliate_account where tenant_id=${opts.tenantId}`;if(!a || (opts.affiliateId && opts.affiliateId!==a.id))throw new Error('affiliate_account_mismatch');return a;});
    const products=await scoped(tx=>tx<{id:string;external_id:string;product_url:string}[]>`
      select p.id,p.external_id,p.product_url from garimpa.product p where p.tenant_id=${opts.tenantId} and p.marketplace='shopee'
      and not exists(select 1 from garimpa.publication pub where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.affiliate_id=${account.id} and pub.channel='web' and pub.affiliate_url is not null)`);
    for(const product of products) {
      try {
        const slug=(opts.tenantId==='local'?'':account.public_slug+'-')+'shp-'+product.external_id;
        const pub=await scoped(async tx=>{const [p]=await tx<{id:string;affiliate_url:string|null}[]>`
          insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
          values(gen_random_uuid()::text,${opts.tenantId},${product.id},${account.id},'web',${slug})
          on conflict(affiliate_id,product_id,channel) do update set slug=excluded.slug returning id,affiliate_url`;return p;});
        if(!pub || pub.affiliate_url)continue;
        const link=await withAccountCredential(sql,opts.tenantId,'shopee',credential=>adapter.buildAffiliateLink!(credential,product.product_url,{marketplace:'shopee',trackingId:account.id,subIds:[pub.id.replace(/-/g,'')]},ctx));
        await scoped(tx=>tx`update garimpa.publication set affiliate_url=${link},affiliate_url_generated_at=now() where tenant_id=${opts.tenantId} and id=${pub.id} and affiliate_url is null`);
        generated++;
      }catch{failed++;ctx.log({level:'error',msg:'shopee_link_generation_failed',data:{productId:product.id}});}
    }
    return {candidates:products.length,generated,failed};
  }finally {await sql.end();}
}
