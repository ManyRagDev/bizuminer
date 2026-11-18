import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as contract from '../lib/capture-activity.ts';
import {curationOfferHref} from '../lib/curation-navigation.ts';
const Anchor=({children,...props})=>React.createElement('a',props,children);
const time='2026-11-15T22:00:00.000Z',reference='manual:device-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const account={tenantId:'conta-a'};
let model={version:1,available:true,consultedAt:time,items:[{reference,origin:'manual',purpose:'capture',stores:['aliexpress'],startedAt:time,state:'saved',counts:{products:46,observationsSaved:46}}],nextCursor:'pagina-seguinte'};
let detailModel={version:1,available:true,consultedAt:time,activity:{...model.items[0],receiptVersion:1,receivedAt:time,finishedAt:time,clientCapturedAt:null,
  counts:{received:null,valid:null,rejected:null,duplicates:null,observationsSaved:null,products:46,productsCreated:null,productsUpdated:null}},historicalComplete:false,linkedProducts:0,sourceUrl:null,validation:[],searchSummary:null,
  products:{items:[{id:'produto-a',title:'Título atual',original:null,current:{priceCents:1000,currency:'BRL',priceType:'from',priceMaxCents:null,observedAt:time}}],nextCursor:'produtos-seguintes'},searches:{items:[],nextCursor:null}};
function load(path,extra={}) {
  const exports={},code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,URLSearchParams,Response,require(id){
    if(id==='react/jsx-runtime')return jsx;
    if(id.endsWith('.css'))return {};
    if(id.includes('capture-activity-db'))return {readCaptureActivities:async()=>model,readCaptureActivity:async()=>detailModel};
    if(id.includes('capture-activity.ts'))return contract;
    if(id.includes('curation-navigation'))return {curationOfferHref};
    if(id.includes('page-account'))return {pageAccount:async tenant=>tenant===account.tenantId?account:null};
    if(id.includes('account-scope'))return {inAccountScope:(_context,work)=>work()};
    if(id==='next/navigation')return {notFound(){throw new Error('404');}};
    if(id.includes('platform-gates'))return {captureEnabled:()=>false};
    if(id.includes('marketplaces'))return {MARKETPLACES:[{slug:'aliexpress',label:'AliExpress'}],marketplaceDef:()=>({label:'AliExpress'})};
    if(id.includes('admin-link'))return {default:Anchor};
    if(id.includes('today-operation-status'))return {default:()=>React.createElement('p',null,'Andamento destes produtos')};
    if(extra[id])return extra[id];
    throw new Error(`Unexpected dependency ${id}`);
  }});
  return exports;
}
const ActivityList=load('../app/admin/capturas/activity-list.tsx').default;
const ListPage=load('../app/admin/capturas/page.tsx',{'./activity-list.tsx':{default:ActivityList}}).default;
const DetailPage=load('../app/admin/capturas/[reference]/page.tsx').default;
const renderList=query=>ListPage({searchParams:Promise.resolve({conta:account.tenantId,...query})}).then(renderToStaticMarkup);
const renderDetail=query=>DetailPage({params:Promise.resolve({reference}),searchParams:Promise.resolve({conta:account.tenantId,...query})}).then(renderToStaticMarkup);

test('filtros e cursores rejeitam entrada inválida e não cruzam conta/filtro',()=>{
  assert.equal(contract.captureFilters().limit,30);assert.equal(contract.captureFilters({},50).limit,50);
  for(const input of [{loja:'invasora'},{limite:'101'},{limite:'NaN'},{de:'2026-02-30'},{de:'2026-11-16',ate:'2026-11-15'}])assert.throws(()=>contract.captureFilters(input),/invalid_capture_filter/);
  assert.throws(()=>contract.captureQuery(new URLSearchParams('conta=a&conta=b')),/invalid_capture_filter/);
  const cursor=contract.captureCursor(['a','amazon'],{id:'p1'});
  assert.equal(contract.decodeCaptureCursor(cursor,['a','amazon']).id,'p1');
  assert.throws(()=>contract.decodeCaptureCursor(cursor,['b','amazon']),/invalid_capture_filter/);
  assert.throws(()=>contract.decodeCaptureCursor(cursor,['a','shopee']),/invalid_capture_filter/);
  assert.equal(contract.captureReference(reference).id,'device-a');
  assert.throws(()=>contract.captureReference('https://unsafe.invalid'),/invalid_capture_filter/);
});

test('lista oferece filtros e preserva conta/filtros entre detalhe e próximas páginas',async()=>{
  const html=await renderList({loja:'aliexpress',de:'2026-11-15',depois:'anterior'});
  assert.match(html,/Capturas e importações/);assert.match(html,/Conferências e acompanhamento/);assert.match(html,/46 produtos distintos/);
  assert.match(html,/loja=aliexpress&amp;de=2026-11-15&amp;depois=anterior/);
  assert.match(html,/depois=pagina-seguinte/);assert.match(html,/conta=conta-a/);assert.match(html,/Atualizar consulta/);
  const save=model;model={...model,available:false,items:[],nextCursor:null};
  const unavailable=await renderList({});assert.match(unavailable,/não significa ausência de capturas/);assert.doesNotMatch(unavailable,/Nenhum recebimento encontrado/);
  model=save;
  await assert.rejects(renderList({conta:'outra-conta'}),/404/);
});

test('detalhe separa lacuna histórica do preço atual e preserva produto/conta/retorno',async()=>{
  const html=await renderDetail({loja:'aliexpress',depois:'anterior'});
  assert.match(html,/Observação histórica não comprovada/);assert.match(html,/Último preço observado do produto: A partir de R\$/);
  assert.match(html,/Contagens|contagens/);assert.match(html,/Não registrado/);
  assert.match(html,/origem=capturas&amp;captura=manual/);assert.match(html,/conta=conta-a/);assert.match(html,/produtosDepois=produtos-seguintes/);
  assert.match(html,/loja=aliexpress&amp;depois=anterior/);
  const save=detailModel;detailModel=null;await assert.rejects(renderDetail({}),/404/);detailModel=save;
});

test('APIs mantêm 401/403/404, filtros 400 e indisponibilidade 503 sem consultar outro escopo',async()=>{
  let auth={kind:'no_session'};
  const authModule={checkAffiliateUser:async()=>auth,sinkJson:(_sink,body,init)=>Response.json(body,init)};
  const list=load('../app/api/admin/capturas/route.ts',{'../../../../lib/api-auth.ts':authModule}).GET;
  const detail=load('../app/api/admin/capturas/[reference]/route.ts',{'../../../../../lib/api-auth.ts':authModule}).GET;
  const request=(query='')=>({nextUrl:new URL('https://fixture.invalid/api/admin/capturas?'+query)});
  assert.equal((await list(request())).status,401);auth={kind:'forbidden'};assert.equal((await list(request())).status,403);
  auth={kind:'ok',context:account,sink:{}};
  const good=await list(request());assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'no-store');
  assert.equal((await list(request('loja=amazon&loja=shopee'))).status,400);
  const save=model;model={...model,available:false};assert.equal((await list(request())).status,503);model=save;
  const savedDetail=detailModel;detailModel=null;assert.equal((await detail(request(),{params:Promise.resolve({reference})})).status,404);detailModel=savedDetail;
});

if(process.env.CAPTURE_UI_PREVIEW_DIR) {
  const path=process.env.CAPTURE_UI_PREVIEW_DIR;
  mkdirSync(path,{recursive:true});
  const css=readFileSync(new URL('../app/admin/capturas/captures.css',import.meta.url),'utf8');
  const frame=body=>`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Capturas · ensaio isolado</title><style>body{font:16px system-ui;color:#19312d;background:#f6f5f0;margin:0;padding:24px}main{max-width:1100px;margin:auto}.admin-section{padding:24px;background:white;border:1px solid #dadbd4;border-radius:14px;margin:20px 0}a{color:#075e53}h1{font-size:2.1rem}h2{font-size:1.4rem}${css}</style><main>${body}</main></html>`;
  // Visual preview of the actual server components, synthetic data only.
  writeFileSync(`${path}/lista.html`,frame(await renderList({})));
  writeFileSync(`${path}/detalhe.html`,frame(await renderDetail({})));
}

test('referência do path aceita params brutos ou decodificados e recusa dupla codificação',()=>{
  const ref='manual:device-a:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(contract.capturePathReference(ref),ref);assert.equal(contract.capturePathReference(encodeURIComponent(ref)),ref);
  for(const bad of ['%zz',encodeURIComponent(encodeURIComponent(ref)),'https://foreign.invalid','manual:../foreign:invalid'])assert.throws(()=>contract.capturePathReference(bad),/invalid_capture_filter/);
});
