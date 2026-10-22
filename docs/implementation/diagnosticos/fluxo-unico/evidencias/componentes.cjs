const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=process.cwd(),ts=require(path.join(root,'packages/web/node_modules/typescript'));
const jsx=(type,props)=>({type,props});
const hooks={useState:v=>[typeof v==='function'?v():v,()=>{}],useTransition:()=>[false,f=>f()]};
function load(file,modules){const src=fs.readFileSync(file,'utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;const ctx={exports:{},require:k=>{if(k==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};if(k==='react')return hooks;if(k==='next/navigation')return {useRouter:()=>({refresh(){}}),redirect:u=>{throw Error('redirect:'+u)}};if(k in modules)return modules[k];return new Proxy({},{get:(_,name)=>()=>null});},URLSearchParams,Date,console,encodeURIComponent,crypto};vm.runInNewContext(js,ctx);return ctx.exports;}
function flatten(t){if(!t)return [];if(Array.isArray(t))return t.flatMap(flatten);if(typeof t!=='object')return [];return [t,...flatten(t.props?.children)];}
(async()=>{
const opp={id:'opportunity_fixture',productId:'product_fixture',audienceKey:'cozinha',channel:'telegram_channel',state:'prioritized',class:'good_buy',reasons:['Motivo original'],title:'Produto sintético',priceCents:10000,validUntil:'2099-01-01T00:00:00Z'};
const radar=load('packages/web/app/admin/direcionamento/radar-view.tsx',{}).default({tenantId:'tenant_fixture',initialOpportunities:[opp]});
const href=flatten(radar).find(x=>x.type==='a'&&x.props.href.startsWith('/admin/campanhas')).props.href;
let submitted;
const kitActions={createCommercialKitDraftAction:async x=>{submitted=x;return {ok:true}}};
const campaign=load('packages/web/app/admin/campanhas/workspace.tsx',{'../marketing/kit-actions':kitActions}).default({accounts:[],tenantId:'tenant_fixture',owner:true,initialProductId:'product_fixture',desk:{campaigns:[{id:'campaign_fixture',status:'active',name:'Campanha'}],products:[{id:'product_fixture',title:'Produto sintético'}],publications:[]}});
const form=flatten(campaign).find(x=>x.type==='form'&&flatten(x).some(y=>y.type==='select'&&y.props.name==='product'));
await form.props.action(new Map([['campaign','campaign_fixture'],['product','product_fixture'],['channel','telegram_channel'],['reason','Motivo digitado novamente']]));
const emptySummary={awaiting:0,held:0,deferred:0,approved:0};let selectedRead=0,radarRead=0;
const page=load('packages/web/app/admin/curadoria/page.tsx',{
 '../../../lib/page-account.ts':{pageAccount:async()=>({tenantId:'tenant_fixture'})},
 '../../../lib/account-scope.ts':{inAccountScope:async(c,f)=>f(),currentAccount:()=>({tenantId:'tenant_fixture'}),scopedTenantId:()=> 'tenant_fixture'},
 '../../../lib/auth.ts':{getPageAuth:async()=>({id:'user_fixture'})},
 '../../../lib/curation-db.ts':{curationSummary:async()=>emptySummary,automatedTriageAvailability:async()=>3},
 '../../../lib/editorial-compass.ts':{getAuditDesk:async()=>({progress:{remaining:0,reviewed:0,target:0},products:[]})},
 '../../../lib/editorial-selection-db.ts':{getEditorialSelectionDesk:async()=>({candidates:[]}),getPublishedEditorialSelection:async()=>{selectedRead++;return {schemaReady:true,mode:'catalog',products:[]}}},
 '../../../lib/admin-query-aliases.ts':load('packages/web/lib/admin-query-aliases.ts',{}),
 '../../../lib/curation-workflow.ts':load('packages/web/lib/curation-workflow.ts',{}),
 '../../../lib/opportunity-db.ts':{getRadarOpportunities:async()=>{radarRead++;return []}},
 '../../../lib/tenant-db.ts':{withAccountDb:async(c,f)=>f({})},
});
const tree=await page.default({searchParams:Promise.resolve({aba:'radar'})});
const result={fixture:'Synthetic components with hooks/services stubbed; real TSX logic, no network/DB',radarLink:href,submittedDraft:submitted,contextPreserved:{productId:submitted.productId===opp.productId,opportunityId:submitted.opportunityId===opp.id,audienceKey:submitted.audienceKey===opp.audienceKey},pageRequestedRadar:{selectedRead,radarRead,headings:flatten(tree).filter(x=>['h1','h2'].includes(x.type)).map(x=>x.props.children)}};
fs.writeFileSync('/tmp/bizuminer-fluxo-unico/componentes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
