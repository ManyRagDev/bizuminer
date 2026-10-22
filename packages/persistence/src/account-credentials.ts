/** Shared server-only credential resolution. No SQL context, no credentials. */
import type { Sql } from 'postgres';
import { decryptSecret, type EncryptedSecretPayload } from './affiliate-secret-crypto.ts';
import { withMonitoringDb } from './monitoring-db.ts';
import { paginate, type CaptureAdapter, type Credential } from '../../capture/src/types.ts';

type ScopedSql = Sql | import('postgres').TransactionSql;
export interface AccountMarketplaceCredentials {
  tenantId: string;
  marketplace: string;
  appId?: string;
  appKey?: string;
  appSecret?: string;
  apiKey?: string;
  trackingId?: string;
}
export class AccountCredentialsError extends Error {
  readonly code: 'account_suspended' | 'account_credentials_missing' | 'credential_tampered' | 'unauthorized' | 'unsupported_marketplace';
  constructor(message: string, code: AccountCredentialsError['code']) {
    super(message); this.name = 'AccountCredentialsError'; this.code = code;
  }
}
export async function assertAccountActive(tenantId: string, sql: ScopedSql): Promise<void> {
  if (!sql || !/^[a-z0-9._-]{1,64}$/.test(tenantId)) throw new AccountCredentialsError('authorized_transaction_required','unauthorized');
  const [acc] = await sql<{status:string}[]>`select status from garimpa.affiliate_account where tenant_id=${tenantId} limit 1`;
  if (!acc) throw new AccountCredentialsError('account_unavailable','unauthorized');
  if (acc.status !== 'active') throw new AccountCredentialsError('account_suspended','account_suspended');
}
export async function resolveAccountMarketplaceCredentials(tenantId:string, marketplace:string, sql:ScopedSql):Promise<AccountMarketplaceCredentials> {
  await assertAccountActive(tenantId,sql);
  const mkt=marketplace.trim().toLowerCase();
  if (!['shopee','aliexpress'].includes(mkt)) {
    if (mkt==='mercadolivre' && tenantId==='local') return {tenantId,marketplace:mkt};
    throw new AccountCredentialsError('marketplace_account_capture_unsupported','unsupported_marketplace');
  }
  const fields:Record<string,string>={};
  const aliases:Record<string,string>={appId:'appId',app_id:'appId',appKey:'appKey',app_key:'appKey',appSecret:'appSecret',app_secret:'appSecret',apiKey:'apiKey',api_key:'apiKey',trackingId:'trackingId',tracking_id:'trackingId'};
  if (tenantId==='local') {
    Object.assign(fields,mkt==='shopee' ? {appId:process.env.SHOPEE_APP_ID??'',appSecret:process.env.SHOPEE_APP_SECRET??''} : {appKey:process.env.ALIEXPRESS_APP_KEY??'',appSecret:process.env.ALIEXPRESS_APP_SECRET??'',trackingId:process.env.ALIEXPRESS_TRACKING_ID??''});
  } else {
    const rows=await sql<{secret_id:string;key_version:string;ciphertext:string;nonce:string;tag:string}[]>`
      select secret_id,key_version,ciphertext,nonce,tag from garimpa.affiliate_secret
      where tenant_id=${tenantId} and marketplace=${mkt} and status='active' order by updated_at desc`;
    for (const r of rows) {
      let plain:string;
      try {const envelope:EncryptedSecretPayload={keyVersion:r.key_version,ciphertext:r.ciphertext,nonce:r.nonce,tag:r.tag};plain=decryptSecret(envelope,tenantId,mkt,r.secret_id);}
      catch {throw new AccountCredentialsError('credential_integrity_failed','credential_tampered');}
      if (r.secret_id==='credentials_json') {
        let object:Record<string,unknown>;
        try {object=JSON.parse(plain);if (!object || Array.isArray(object) || typeof object!=='object') throw new Error();}
        catch {throw new AccountCredentialsError('credential_payload_invalid','credential_tampered');}
        for (const [key,value] of Object.entries(object)) if(aliases[key] && typeof value==='string') fields[aliases[key]!]=value.trim();
      } else if(aliases[r.secret_id]) fields[aliases[r.secret_id]!]=plain.trim();
    }
  }
  const required=mkt==='shopee'?['appId','appSecret']:['appKey','appSecret','trackingId'];
  if(required.some(key=>!fields[key]?.trim())) throw new AccountCredentialsError('account_credentials_missing','account_credentials_missing');
  return {tenantId,marketplace:mkt,...Object.fromEntries(required.map(key=>[key,fields[key]!]))};
}
export async function assertAccountCanDispatchCapture(tenantId:string, marketplace:string|undefined, sql:ScopedSql):Promise<void> {
  if (!marketplace) {await assertAccountActive(tenantId,sql);if(tenantId!=='local') throw new AccountCredentialsError('marketplace_required','account_credentials_missing');return;}
  await resolveAccountMarketplaceCredentials(tenantId,marketplace,sql);
}
/** Trusted backend only; callers establish authorization using a persisted job or CLI operator context. */
export async function resolveWorkerCredential(sql:Sql,tenantId:string,marketplace:string):Promise<Credential> {
  const c=await withMonitoringDb(sql,tenantId,tx=>resolveAccountMarketplaceCredentials(tenantId,marketplace,tx));
  const {tenantId:_tenant,marketplace:mkt,...fields}=c;
  if(mkt==='shopee' && process.env.SHOPEE_CAPTURE_ENABLED!=='true') throw new Error('shopee_capture_disabled');
  if(mkt==='aliexpress' && process.env.ALIEXPRESS_CAPTURE_ENABLED!=='true') throw new Error('aliexpress_capture_disabled');
  return {marketplace:mkt,secret:Object.fromEntries(Object.entries(fields).filter(([,v])=>typeof v==='string')) as Record<string,string>};
}
/** Resolve immediately before a provider effect; the SQL transaction has already committed. */
export async function withAccountCredential<T>(sql:Sql,tenantId:string,marketplace:string,work:(credential:Credential)=>Promise<T>):Promise<T> {
  const credential=await resolveWorkerCredential(sql,tenantId,marketplace);
  return work(credential);
}
/** Pagination calls this wrapper again for each page, including long capture plans. */
export function accountCaptureAdapter(sql:Sql,tenantId:string,adapter:CaptureAdapter):CaptureAdapter {
  const wrapped:CaptureAdapter={marketplace:adapter.marketplace,capabilities:adapter.capabilities,
    validateCredential:(_c,ctx)=>withAccountCredential(sql,tenantId,adapter.marketplace,c=>adapter.validateCredential(c,ctx)),
    fetchOffers:(_c,params,ctx)=>withAccountCredential(sql,tenantId,adapter.marketplace,c=>adapter.fetchOffers(c,params,ctx)),
    streamOffers(c,params,ctx){return paginate(this,c,params,ctx);},
  };
  if(adapter.buildAffiliateLink) wrapped.buildAffiliateLink=(_c,url,tag,ctx)=>withAccountCredential(sql,tenantId,adapter.marketplace,c=>adapter.buildAffiliateLink!(c,url,tag,ctx));
  return wrapped;
}
