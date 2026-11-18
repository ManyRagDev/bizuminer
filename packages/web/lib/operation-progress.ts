export type ProgressProblem={id:string;productId?:string;title:string;category:string;message:string;href:string;at:string|null};
export type EvaluationProgress={queued:number;running:number;uncertain:number;expiredLease:number;failed:number;outdated:number;waiting:number;quota:number;
  recorded:number;compatible:number;reused:number;exceptions:number;eligible:number;nextAt:string|null};
export type PreparationProgress={products:number;pending:number;running:number;unconfirmed:number;browser:number;auth:number;quota:number;retry:number;expired:number;shopeeAuthRequests:number;authAsOf:string;nextAt:string|null};
export type CaptureProgress={items:Array<{id:string;state:string;phase:string|null;deadline:string|null;nextAt:string|null;href:string;message:string}>;active:number;nextAt:string|null};
export type RecentCapture={reference:string;stores:string[];origin:string;state:string;startedAt:string;products:number|null;observations:number|null};
export type OperationStore={store:string;reference:string|null;lastActivityAt:string|null;lastObservedAt:string|null;recentProducts:number;approvedRecentProducts?:number;connection?:string;manual:boolean;api:boolean};
export type OperationProgress={version:2;tenantId:string;scope:string;consultedAt:string;mode:'v2'|'legacy'|'unknown';
  evaluation:EvaluationProgress|null;preparation:PreparationProgress|null;captures:CaptureProgress|null;links:{missing:number}|null;
  recent?:RecentCapture[]|null;stores?:OperationStore[]|null;
  pauta:Record<'whatsapp'|'stories',{active:boolean;count:number;byStore?:Record<string,number>;products?:Array<{id:string;title:string;selected:boolean;reasons:string[]}>}|null>;
  problems:ProgressProblem[];problemsNext:string|null;availability:{processing:boolean;captures:boolean;whatsapp:boolean;stories:boolean;links:boolean;recent?:boolean;stores?:boolean};
  poll:{active:boolean;nextAt:string|null};activities:Array<{kind:string;marketplaces:string[]}>;issues:string[]};
export const progressScope=(ids?:readonly string[],filter?:{category?:string;after?:string})=>filter?.category||filter?.after
  ? JSON.stringify({products:ids?[...new Set(ids)].sort():null,category:filter.category??null,after:filter.after??null})
  : ids ? JSON.stringify([...new Set(ids)].sort()) : 'account';
export function progressProductIds(raw:unknown):string[]|undefined {
  if(raw===undefined || raw===null) return undefined;
  let ids:unknown=raw;
  if(typeof raw==='string') {try{ids=JSON.parse(raw);}catch{throw new Error('invalid_progress_input');}}
  if(!Array.isArray(ids) || ids.length<1 || ids.length>100 || ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(id))) throw new Error('invalid_progress_input');
  return [...new Set(ids as string[])].sort();
}
/** Runtime validation before a response can replace the last account snapshot. */
export function validOperationProgress(value:unknown,tenantId:string,scope:string):value is OperationProgress {
  if(!value || typeof value!=='object') return false;
  const v=value as OperationProgress;
  const counts=(x:unknown,keys:string[])=>x===null || !!x && typeof x==='object' && keys.every(key=>Number.isSafeInteger((x as any)[key])&&(x as any)[key]>=0);
  return v.version===2 && v.tenantId===tenantId && v.scope===scope && Number.isFinite(Date.parse(v.consultedAt))
    && ['v2','legacy','unknown'].includes(v.mode) && counts(v.evaluation,['queued','running','uncertain','expiredLease','failed','outdated','waiting','quota','recorded','compatible','reused','exceptions','eligible'])
    && counts(v.preparation,['products','pending','running','unconfirmed','browser','auth','quota','retry','expired','shopeeAuthRequests'])
    && (v.preparation===null||typeof v.preparation.authAsOf==='string'&&Number.isFinite(Date.parse(v.preparation.authAsOf)))
    && counts(v.links,['missing'])
    && (v.captures===null || !!v.captures && Array.isArray(v.captures.items) && Number.isSafeInteger(v.captures.active) && v.captures.active>=0
      && v.captures.items.every(c=>c&&typeof c.id==='string'&&typeof c.message==='string'&&typeof c.href==='string'&&/^\/admin\//.test(c.href)))
    && !!v.pauta && ['whatsapp','stories'].every(channel=>{const s=v.pauta[channel as 'whatsapp'];return s===null || !!s && typeof s.active==='boolean' && Number.isSafeInteger(s.count)&&s.count>=0
      && (s.byStore===undefined||!!s.byStore&&typeof s.byStore==='object'&&Object.values(s.byStore).every(n=>Number.isSafeInteger(n)&&n>=0))
      && (s.products===undefined||Array.isArray(s.products)&&s.products.every(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&typeof p.selected==='boolean'&&Array.isArray(p.reasons)&&p.reasons.every(r=>typeof r==='string')));})
    && Array.isArray(v.problems) && v.problems.every(p=>p && typeof p.id==='string' && typeof p.title==='string' && typeof p.message==='string' && typeof p.href==='string' && /^\/(?:admin|pauta)(?:[/?]|$)/.test(p.href))
    && Array.isArray(v.activities)&&v.activities.every(a=>a&&typeof a.kind==='string'&&Array.isArray(a.marketplaces)&&a.marketplaces.every(s=>typeof s==='string'))
    && Array.isArray(v.issues)&&v.issues.every(i=>typeof i==='string')
    && (v.recent===undefined||v.recent===null||Array.isArray(v.recent)&&v.recent.every(r=>r&&typeof r.reference==='string'&&Array.isArray(r.stores)&&r.stores.every(s=>typeof s==='string')&&typeof r.origin==='string'&&typeof r.state==='string'&&Number.isFinite(Date.parse(r.startedAt))&&counts(r,['products','observations'].filter(k=>(r as any)[k]!==null))))
    && (v.stores===undefined||v.stores===null||Array.isArray(v.stores)&&v.stores.every(s=>s&&typeof s.store==='string'&&typeof s.manual==='boolean'&&typeof s.api==='boolean'&&counts(s,['recentProducts'])&&(s.approvedRecentProducts===undefined||counts(s,['approvedRecentProducts']))&&(s.connection===undefined||typeof s.connection==='string')) )
    && !!v.availability && ['processing','captures','whatsapp','stories','links'].every(k=>typeof (v.availability as any)[k]==='boolean') && Object.values(v.availability).every(s=>typeof s==='boolean')
    && !!v.poll && typeof v.poll.active==='boolean' && (v.poll.nextAt===null || Number.isFinite(Date.parse(v.poll.nextAt)));
}
