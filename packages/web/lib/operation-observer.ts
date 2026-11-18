import {progressScope,validOperationProgress,type OperationProgress} from './operation-progress.ts';
export type OperationObservation={data:OperationProgress|null;error:boolean;loading:boolean;paused:boolean};
type Listener=(value:OperationObservation)=>void;
type Environment={window:Pick<Window,'addEventListener'|'removeEventListener'>;document:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;
  fetch:typeof fetch;setTimeout:(fn:()=>void,ms:number)=>any;clearTimeout:(id:any)=>void;now:()=>number};
/** One request/timer per active account+product scope. No cache survives its last subscriber. */
export function createOperationObserver(env:Environment){
  const scopes=new Map<string,{listeners:Set<Listener>;state:OperationObservation;dispose:()=>void;refresh:()=>void}>();
  return {subscribe(tenantId:string,ids:string[]|undefined,listener:Listener,filter?:{category?:string;after?:string}){
    const scope=progressScope(ids,filter),key=JSON.stringify([tenantId,scope]);
    let entry=scopes.get(key);
    if(!entry){
      const listeners=new Set<Listener>(),controller=new AbortController();let timer:any,eventTimer:any,inFlight=false,pending=false,unchanged=0,fingerprint='';
      const state:OperationObservation={data:null,error:false,loading:true,paused:false};
      const publish=()=>{for(const fn of listeners)fn({...state});};
      const refresh=async()=>{
        if(env.document.hidden||controller.signal.aborted)return;
        if(inFlight){pending=true;return;}
        env.clearTimeout(timer);inFlight=true;state.loading=true;publish();
        try{
          const query=new URLSearchParams();if(ids)query.set('produtos',JSON.stringify(ids));
          if(filter?.category)query.set('categoria',filter.category);if(filter?.after)query.set('depois',filter.after);
          const response=await env.fetch(`/api/admin/operacao${query.size?'?'+query:''}`,{cache:'no-store',headers:{'x-bm-account':tenantId},signal:controller.signal});
          if(!response.ok)throw new Error('status_unavailable');
          const value:unknown=await response.json();
          if(!validOperationProgress(value,tenantId,scope))throw new Error('invalid_status');
          if(controller.signal.aborted)return;
          const signature=JSON.stringify([value.evaluation,value.preparation?{...value.preparation,authAsOf:undefined}:null,value.captures,value.pauta,value.links,value.problems,value.recent,value.stores]);
          const confirmed=!!(value.evaluation?.running||value.preparation?.running||value.captures?.items.some(c=>c.state==='running'&&c.phase!=='queued'&&c.deadline&&Date.parse(c.deadline)>env.now()&&!['awaiting_browser','awaiting_authorization','awaiting_reconciliation','retry_wait'].includes(c.phase??''))
            ||value.mode==='legacy'&&value.activities.some(a=>['capture','triage','monitoring','publication'].includes(a.kind)));
          unchanged=signature===fingerprint?unchanged+1:0;fingerprint=signature;
          state.data=value;state.error=!Object.values(value.availability).every(Boolean);state.loading=false;
          state.paused=value.poll.active&&!confirmed&&unchanged>=3;publish();
          if(!state.error&&!state.paused&&!env.document.hidden){
            const next=value.poll.active?20_000:value.poll.nextAt?Math.max(1000,Date.parse(value.poll.nextAt)-env.now()):null;
            if(next!==null)timer=env.setTimeout(()=>{void refresh();},Math.min(next,2_147_483_647));
          }
        }catch{if(!controller.signal.aborted){state.error=true;state.loading=false;publish();}}
        finally{inFlight=false;if(pending&&!controller.signal.aborted){pending=false;timer=env.setTimeout(()=>{void refresh();},100);}}
      };
      const visible=()=>{env.clearTimeout(timer);env.clearTimeout(eventTimer);unchanged=0;fingerprint='';if(!env.document.hidden)eventTimer=env.setTimeout(()=>{void refresh();},100);};
      const operation=(event:Event)=>{if((event as CustomEvent<{tenantId?:string}>).detail?.tenantId===tenantId)visible();};
      env.window.addEventListener('focus',visible);env.document.addEventListener('visibilitychange',visible);env.window.addEventListener('bm:operation-changed',operation);
      entry={listeners,state,refresh:()=>{unchanged=0;fingerprint='';void refresh();},dispose(){controller.abort();env.clearTimeout(timer);env.clearTimeout(eventTimer);
        env.window.removeEventListener('focus',visible);env.document.removeEventListener('visibilitychange',visible);env.window.removeEventListener('bm:operation-changed',operation);}};
      scopes.set(key,entry);entry.listeners.add(listener);listener({...state});void refresh();
    }else{entry.listeners.add(listener);listener({...entry.state});}
    return {refresh:entry.refresh,unsubscribe(){entry!.listeners.delete(listener);if(!entry!.listeners.size){entry!.dispose();scopes.delete(key);}}};
  }};
}
let observer:ReturnType<typeof createOperationObserver>|undefined;
export function observeOperation(tenantId:string,ids:string[]|undefined,listener:Listener,filter?:{category?:string;after?:string}){
  observer??=createOperationObserver({window,document,fetch:(...args)=>fetch(...args),setTimeout:(fn,ms)=>window.setTimeout(fn,ms),clearTimeout:id=>window.clearTimeout(id),now:()=>Date.now()});
  return observer.subscribe(tenantId,ids,listener,filter);
}
