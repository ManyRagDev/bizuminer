/** Persist links already attributed by the account's AliExpress request. No provider I/O. */
import postgres from 'postgres';
import type { CaptureContext } from '../../capture/src/types.ts';
import { withMonitoringDb } from './monitoring-db.ts';
import { assertAccountActive } from './account-credentials.ts';
export interface EnsureAliExpressLinksOptions {readonly connectionString:string;readonly tenantId:string;readonly affiliateId?:string;readonly sqlFactory?:()=>postgres.Sql;}
export interface EnsureAliExpressLinksSummary {readonly candidates:number;readonly linked:number;readonly skippedWithoutLink:number;}
export async function ensureAliExpressPublications(opts:EnsureAliExpressLinksOptions,ctx:CaptureContext):Promise<EnsureAliExpressLinksSummary> {
  const sql=opts.sqlFactory?.()??postgres(opts.connectionString,{prepare:false,max:1,ssl:opts.connectionString.includes('localhost')?false:{rejectUnauthorized:false}});
  const scoped=<T>(work:(tx:postgres.Sql)=>Promise<T>)=>withMonitoringDb(sql,opts.tenantId,async tx=>{await assertAccountActive(opts.tenantId,tx);return work(tx);});
  let linked=0,skippedWithoutLink=0;
  try {
    const account=await scoped(async tx=>{const [a]=await tx<{id:string;public_slug:string}[]>`select id,public_slug from garimpa.affiliate_account where tenant_id=${opts.tenantId}`;if(!a || (opts.affiliateId && opts.affiliateId!==a.id))throw new Error('affiliate_account_mismatch');return a;});
    const products=await scoped(tx=>tx<{id:string;external_id:string;product_url:string}[]>`
      select p.id,p.external_id,p.product_url from garimpa.product p where p.tenant_id=${opts.tenantId} and p.marketplace='aliexpress'
      and not exists(select 1 from garimpa.publication pub where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.affiliate_id=${account.id} and pub.channel='web' and pub.affiliate_url is not null)`);
    for(const product of products) {
      let url:URL;try{url=new URL(product.product_url);}catch{skippedWithoutLink++;continue;}
      if(url.protocol!=='https:' || url.hostname!=='s.click.aliexpress.com'){skippedWithoutLink++;continue;}
      const slug=(opts.tenantId==='local'?'':account.public_slug+'-')+'ali-'+product.external_id;
      await scoped(tx=>tx`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug,affiliate_url,affiliate_url_generated_at)
        values(gen_random_uuid()::text,${opts.tenantId},${product.id},${account.id},'web',${slug},${product.product_url},now())
        on conflict(affiliate_id,product_id,channel) do update set slug=excluded.slug,affiliate_url=coalesce(garimpa.publication.affiliate_url,excluded.affiliate_url),affiliate_url_generated_at=coalesce(garimpa.publication.affiliate_url_generated_at,now())`);
      linked++;
    }
    if(skippedWithoutLink)ctx.log({level:'error',msg:'aliexpress_link_attribution_missing',data:{skippedWithoutLink}});
    return {candidates:products.length,linked,skippedWithoutLink};
  }finally{await sql.end();}
}
