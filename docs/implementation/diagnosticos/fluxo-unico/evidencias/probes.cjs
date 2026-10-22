const fs=require('fs'), path=require('path'),vm=require('vm');
const root=process.cwd(),ts=require(path.join(root,'packages/web/node_modules/typescript'));
function fn(file,name){const src=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true);const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!node)throw Error('function missing '+name);const js=ts.transpile(node.getText(ast).replace(/^export\s+/,''),{target:ts.ScriptTarget.ES2022});return vm.runInNewContext(js+'\n'+name,{URLSearchParams,Date,Set,Map,console});}
const canonicalSrc=fs.readFileSync('packages/web/lib/admin-query-aliases.ts','utf8');
const js=ts.transpileModule(canonicalSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const ctx={exports:{},URLSearchParams,Set};vm.runInNewContext(js,ctx);
const resolve=fn('packages/web/app/_components/admin-shell.tsx','resolveActiveId');
const routeResults=['selecao','excecoes','radar','auditoria','bussola','pipeline'].map(aba=>({input:aba,...ctx.exports.canonicalAdminQuery({aba})}));
const navResults=['/admin','/admin/onboarding','/admin/governanca','/admin/campanhas'].map(route=>({route,active:resolve(route,'')}));
const graph=JSON.parse(fs.readFileSync('/tmp/bizuminer-fluxo-unico/inventario.json'));
const consumers=graph.entries.filter(e=>e.imports.some(i=>i.target==='packages/web/lib/cockpit-view-model.ts')).map(e=>e.file);
const radar=fs.readFileSync('packages/web/app/admin/direcionamento/radar-view.tsx','utf8');
const link=radar.match(/href=\{`(\/admin\/campanhas[^`]+)`\}/)[1];
const findings={routeResults,navResults,cockpitViewModelProductionImportConsumers:consumers,radarCampaignHrefTemplate:link,radarPassesOpportunityId:link.includes('opportunityId'),browser:{requested:'http://localhost:3100/admin/curadoria?aba=radar',observed:'http://localhost:3100/entrar?next=%2Fadmin%2Fcuradoria',authenticated:false}};
fs.writeFileSync('/tmp/bizuminer-fluxo-unico/probes.json',JSON.stringify(findings,null,2));console.log(JSON.stringify(findings,null,2));
