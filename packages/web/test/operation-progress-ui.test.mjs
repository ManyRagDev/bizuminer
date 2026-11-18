import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import {progressProductIds,validOperationProgress} from '../lib/operation-progress.ts';
import {captureQuery,CaptureInputError} from '../lib/capture-activity.ts';
import {curationDiagnostic,diagnosticLabel} from '../lib/curation-diagnostic.ts';
let value={version:2,tenantId:'a',scope:'account',mode:'v2',consultedAt:'2026-11-16T14:00:00Z',
  evaluation:{queued:1,running:0,waiting:0,quota:0,recorded:20,compatible:5,reused:2,uncertain:13,expiredLease:1,failed:0,outdated:1,exceptions:0,eligible:20},
  preparation:{products:1,pending:0,running:0,unconfirmed:0,browser:1,auth:0,quota:0,retry:0,expired:0,shopeeAuthRequests:0,authAsOf:'2026-11-16T14:00:00Z'},links:{missing:2},
  captures:{items:[],active:0,nextAt:null},pauta:{whatsapp:{active:true,count:2},stories:null},
  availability:{processing:true,captures:true,whatsapp:true,stories:false,links:true},poll:{active:false,nextAt:null},activities:[],issues:[],problems:[],problemsNext:null};
let error=true,auth={kind:'no_session'},calls=0;
const link=({children,...props})=>React.createElement('a',props,children);
function load(path,stubs={},permissive=false){const exports={},code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Intl,Date,URL,URLSearchParams,Response,Error,require(id){
    if(stubs[id])return stubs[id];
    if(id==='react/jsx-runtime')return jsx;
    if(id.endsWith('.css'))return {default:{}};
    if(id.includes('use-operation-progress'))return {useOperationProgress:()=>({data:value,error,loading:false,refresh(){}})};
    if(id.includes('admin-link'))return {default:link};
    if(id.includes('api-auth'))return {checkAffiliateUser:async()=>auth,sinkJson:(_sink,body,init)=>Response.json(body,init)};
    if(id.includes('account-scope'))return {inAccountScope:(_ctx,fn)=>fn()};
    if(id.includes('operation-progress-db'))return {readOperationProgress:async()=>{calls++;return value;}};
    if(id.includes('operation-progress.ts'))return {progressProductIds};
    if(id.includes('capture-activity.ts'))return {captureQuery,CaptureInputError};
    if(id.includes('today-operation-db'))return {readTodayOperations:async()=>({activities:[],issues:[]})};
    if(permissive)return {};
    throw new Error('Unexpected dependency '+id);
  }});return exports;}
const Status=load('../app/admin/today-operation-status.tsx').default;
test('fila, resultado incerto e pauta conhecida coexistem; um canal indisponível não apaga o outro',()=>{
  const html=renderToStaticMarkup(React.createElement(Status,{tenantId:'a'}));
  assert.match(html,/1 na fila/);assert.match(html,/13 resultados incertos/);assert.match(html,/2 ofertas na seleção consultada/);
  assert.match(html,/Consulta indisponível/);assert.match(html,/leitura está incompleta/);assert.match(html,/Atualizar situação/);
  assert.doesNotMatch(html,/Tudo pronto|todas resolvidas|cron ativo/i);
  assert.match(html,/1 execuções sem confirmação/);assert.match(html,/0 em execução/);
});
test('falha da contagem conserva a navegação e não ativa a triagem antiga como fallback',async()=>{
  const account={tenantId:'a',affiliateId:'aff_a',actorAppUserId:'u_a',membershipRole:'owner'},Scope=({children})=>children;
  const Shell=load('../app/_components/account-admin-shell.tsx',{
    '../../lib/account-context.ts':{getUserMemberships:async()=>[]},
    '../../lib/affiliate-workspace-db.ts':{affiliateWorkspaceEnabled:async()=>false},
    '../../lib/curation-db.ts':{curationSummary:async()=>({awaiting:12,held:0,deferred:0})},
    '../../lib/curation-automation.ts':{readCurationAutomation:async()=>{throw new Error('counts unavailable');}},
    '../admin/draft-provider.tsx':{AdminDraftProvider:Scope},'../admin/account-switcher.tsx':{default:()=>null},
    './admin-shell.tsx':{default:({children,curationStatusAvailable})=>React.createElement('section',{'data-counts-known':curationStatusAvailable},children)},
  }).default;
  const shellHtml=renderToStaticMarkup(await Shell({account,userId:'auth',children:React.createElement('p',null,'Navegação disponível')}));
  assert.match(shellHtml,/data-counts-known="false"/);assert.match(shellHtml,/Navegação disponível/);
  const Page=load('../app/admin/curadoria/page.tsx',{
    '../../../lib/page-account.ts':{pageAccount:async()=>account},
    '../../../lib/account-scope.ts':{inAccountScope:(_account,fn)=>fn(),currentAccount:()=>account},
    '../../../lib/auth.ts':{getPageAuth:async()=>({id:'auth'})},
    '../../../lib/admin-query-aliases.ts':{canonicalAdminQuery:()=>({aba:'selecao',redirectNeeded:false})},
    '../../../lib/curation-automation.ts':{readCurationAutomation:async()=>{throw new Error('counts unavailable');}},
    '../draft-provider.tsx':{AdminDraftScope:Scope},
    '../today-operation-status.tsx':{default:()=>React.createElement('p',null,'Consulta parcial disponível')},
  },true).default;
  const pageHtml=renderToStaticMarkup(await Page({searchParams:Promise.resolve({conta:'a'})}));
  assert.match(pageHtml,/Consulta parcial disponível/);assert.match(pageHtml,/triagem anterior não foi considerada o motor ativo/);
  assert.doesNotMatch(pageHtml,/Triar.*produtos/);
});
test('diagnóstico nunca copia erro, código arbitrário ou resposta privada do provedor',()=>{
  const diagnostic=curationDiagnostic({kind:'credential',message:'SECRET',code:'SECRET',body:'SECRET'},'provider',new Date('2026-11-16T14:00:00Z'));
  assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET/);assert.equal(diagnostic.certainty,'uncertain');assert.match(diagnosticLabel(diagnostic),/conexão/);
  assert.match(diagnosticLabel(null),/não foi registrada/);
  assert.equal(curationDiagnostic(null,'configuration').certainty,'not_started');
});
test('fronteira valida produtos, conta e contagens antes de trocar o status',()=>{
  assert.deepEqual(progressProductIds('["p2","p1","p1"]'),['p1','p2']);
  for(const input of ['not json','[]','["../private"]',JSON.stringify(Array(101).fill('p'))])assert.throws(()=>progressProductIds(input),/invalid_progress_input/);
  assert.equal(validOperationProgress(value,'a','account'),true);assert.equal(validOperationProgress(value,'b','account'),false);
  assert.equal(validOperationProgress({...value,evaluation:{...value.evaluation,queued:-1}},'a','account'),false);
});
test('API preserva 401/403 e rejeita entrada duplicada; resposta parcial mantém os dados conhecidos',async()=>{
  const GET=load('../app/api/admin/operacao/route.ts').GET,request=q=>({nextUrl:new URL('https://fixture.invalid/api/admin/operacao?'+q)});
  assert.equal((await GET(request(''))).status,401);assert.equal(calls,0);
  auth={kind:'forbidden'};assert.equal((await GET(request(''))).status,403);assert.equal(calls,0);
  auth={kind:'ok',context:{tenantId:'a'},sink:{}};
  assert.equal((await GET(request('produtos=bad-json'))).status,400);
  assert.equal((await GET(request('produtos=[]&produtos=[]'))).status,400);
  const response=await GET(request(''));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).pauta.whatsapp.count,2);
  const old=value;value={...value,availability:{processing:false,captures:false,whatsapp:false,stories:false,links:false}};
  assert.equal((await GET(request(''))).status,503);value=old;
});

test('Hoje ordena tarefas, distingue recebimento de seleção e conserva conta e canais parciais',()=>{
  const saved=value;
  value={...value,recent:[{reference:'manual:device:receipt',stores:['amazon'],origin:'manual',state:'saved',startedAt:value.consultedAt,products:60,observations:60}],
    stores:['mercadolivre','amazon','aliexpress','shopee'].map(store=>({store,reference:null,lastActivityAt:null,lastObservedAt:null,recentProducts:397,manual:store!=='shopee',api:false})),
    pauta:{...value.pauta,whatsapp:{active:true,count:2,byStore:{amazon:2}}}};
  try {
    const Today=load('../app/admin/operational-today.tsx').default;
    const html=renderToStaticMarkup(React.createElement(Today,{tenantId:'a'}));
    const titles=['Processamento e pendências','Pauta para divulgar','Capturas recebidas recentemente','Lojas e novas capturas'];
    for(let i=1;i<titles.length;i++)assert.ok(html.indexOf(titles[i-1])<html.indexOf(titles[i]));
    assert.match(html,/60 produtos distintos neste recebimento/);assert.match(html,/397 produtos com preço observado/);
    assert.match(html,/WhatsApp 2/);assert.match(html,/Stories não consultável/);assert.match(html,/aprovados no catálogo/);
    assert.match(html,/conta=a#capture-start-title/);assert.doesNotMatch(html,/397 ofertas na pauta|lease|GitHub/);
    assert.ok(validOperationProgress(value,'a','account'));
  } finally {value=saved;}
});
