import assert from 'node:assert/strict';
import test from 'node:test';
import {createOperationObserver} from '../lib/operation-observer.ts';
import {validOperationProgress} from '../lib/operation-progress.ts';
const base=(changes={})=>({version:2,tenantId:'a',scope:'account',consultedAt:'2026-11-16T12:00:00.000Z',mode:'v2',evaluation:null,preparation:null,captures:null,
  links:{missing:0},pauta:{whatsapp:{active:true,count:2},stories:null},problems:[],problemsNext:null,availability:{processing:true,captures:true,whatsapp:true,stories:true,links:true},poll:{active:false,nextAt:null},activities:[],issues:[],...changes});
function browser(responses){
  let time=Date.parse('2026-11-16T12:00:00Z'),serial=0,calls=0;const timers=new Map(),win=new EventTarget(),doc=Object.assign(new EventTarget(),{hidden:false});
  const env={window:win,document:doc,now:()=>time,setTimeout(fn,ms){const id=++serial;timers.set(id,{at:time+ms,fn});return id;},clearTimeout(id){timers.delete(id);},
    fetch:async()=>{const value=responses[Math.min(calls++,responses.length-1)];if(value instanceof Error)throw value;const body=typeof value==='function'?await value():value;return {ok:true,json:async()=>body};}};
  const observer=createOperationObserver(env),flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  return {observer,win,doc,get calls(){return calls;},async advance(ms){await flush();const until=time+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=until;await flush();}};
}
test('dois consumidores compartilham uma consulta, fazem leitura final e repousam',async()=>{
  const b=browser([base({poll:{active:true,nextAt:null}}),base()]),values=[];
  const one=b.observer.subscribe('a',undefined,v=>values.push(v)),two=b.observer.subscribe('a',undefined,()=>{});
  await b.advance(0);assert.equal(b.calls,1);await b.advance(20_000);assert.equal(b.calls,2);
  await b.advance(3_600_000);assert.equal(b.calls,2);assert.equal(values.at(-1).data.pauta.whatsapp.count,2);
  one.unsubscribe();two.refresh();await b.advance(0);assert.equal(b.calls,3);two.unsubscribe();
  b.win.dispatchEvent(new Event('focus'));await b.advance(3_600_000);assert.equal(b.calls,3);
});
test('aba oculta pausa; retorno e foco coalescem; espera futura só consulta no prazo',async()=>{
  const b=browser([base({poll:{active:true,nextAt:null}}),base({poll:{active:false,nextAt:'2026-11-16T12:10:00Z'}}),base()]);
  const sub=b.observer.subscribe('a',undefined,()=>{});await b.advance(0);b.doc.hidden=true;b.doc.dispatchEvent(new Event('visibilitychange'));
  await b.advance(60_000);assert.equal(b.calls,1);b.doc.hidden=false;b.doc.dispatchEvent(new Event('visibilitychange'));b.win.dispatchEvent(new Event('focus'));
  await b.advance(100);assert.equal(b.calls,2);await b.advance(500_000);assert.equal(b.calls,2);await b.advance(40_000);assert.equal(b.calls,3);sub.unsubscribe();
});
test('falha preserva dado conhecido e interrompe consultas automáticas',async()=>{
  const b=browser([base({poll:{active:true,nextAt:null}}),new Error('network')]),values=[];
  const sub=b.observer.subscribe('a',undefined,v=>values.push(v));await b.advance(20_000);
  assert.equal(values.at(-1).error,true);assert.equal(values.at(-1).data.pauta.whatsapp.count,2);
  await b.advance(3_600_000);assert.equal(b.calls,2);sub.unsubscribe();
});
test('resposta tardia da conta encerrada não chega ao novo escopo',async()=>{
  let resolve;const late=new Promise(r=>resolve=r),b=browser([()=>late,base({tenantId:'b'})]),old=[],fresh=[];
  const first=b.observer.subscribe('a',undefined,v=>old.push(v));await b.advance(0);first.unsubscribe();
  const second=b.observer.subscribe('b',undefined,v=>fresh.push(v));await b.advance(0);resolve(base());await b.advance(0);
  assert.equal(old.at(-1).data,null);assert.equal(fresh.at(-1).data.tenantId,'b');second.unsubscribe();
});
test('validação nega outra conta, contagens inválidas e destinos externos',()=>{
  assert.equal(validOperationProgress(base(),'a','account'),true);assert.equal(validOperationProgress(base(),'b','account'),false);
  assert.equal(validOperationProgress(base({pauta:{whatsapp:{active:true,count:-1},stories:null}}),'a','account'),false);
  assert.equal(validOperationProgress(base({problems:[{id:'1',message:'x',href:'https://elsewhere.invalid'}]}),'a','account'),false);
});
test('fila estável sem execução confirmada não mantém consulta ociosa permanente',async()=>{
  const b=browser([base({poll:{active:true,nextAt:null}})]),values=[];
  const sub=b.observer.subscribe('a',undefined,v=>values.push(v));await b.advance(3_600_000);
  assert.equal(b.calls,4);assert.equal(values.at(-1).paused,true);
  sub.refresh();await b.advance(0);assert.equal(b.calls,5);assert.equal(values.at(-1).paused,false);sub.unsubscribe();
});
