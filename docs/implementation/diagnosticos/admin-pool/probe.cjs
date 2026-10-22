// Offline diagnostic: real page/DAL/db factory, synthetic driver/auth/UI; no SQL, Supabase session, or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.cwd(),web=path.join(root,'packages/web');
const ts=require(path.join(web,'node_modules/typescript'));
const context={tenantId:'synthetic',affiliateId:'aff_synthetic',actor:'human',actorAppUserId:'u_synthetic',authenticatedAuthUserId:'auth_synthetic',membershipRole:'owner',requestId:'offline'};
let active=0,peak=0,created=0,ended=0,rejected=0,limit=Infinity;const open=new Set();
function postgres(_url,opts){
 assert.equal(opts.max,1);const id=++created;let connected=false,closed=false;
 async function query(text){
  if(!connected){if(active>=limit){rejected++;throw Object.assign(new Error('(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15'),{code:'XX000'});}connected=true;active++;peak=Math.max(peak,active);open.add(id);}
  await new Promise(r=>setTimeout(r,5));
  if(text.includes("to_regprocedure('garimpa.resolve_actor_accounts(text)')"))return[{ready:true}];
  if(text.includes('from garimpa.resolve_actor_accounts('))return[{affiliate_id:context.affiliateId}];
  if(text.includes('as products')&&text.includes('as observations'))return[{products:0,observations:0,runs:0,clicks_7d:0,publications:0,subscribers:0,members:0,favorites:0,active_watches:0,profiles:0,last_ok_run_at:null,last_discovery_at:null}];
  if(text.includes('as ready'))return[{ready:false}];
  return [];
 }
 const sql=(parts,...values)=>query(parts.join('?'));
 sql.begin=async(...args)=>{await query('begin');return args.at(-1)(sql);};
 sql.end=async()=>{if(!closed){closed=true;ended++;if(connected){active--;open.delete(id);}}};
 sql.json=x=>JSON.stringify(x);
 sql.unsafe=(s)=>({toString:()=>s,then:(a,b)=>query(s).then(a,b)});
 return sql;
}
const noop=()=>null,jsx=(type,props)=>({type,props});
let modules;
function load(file){
 if(modules.has(file))return modules.get(file).exports;
 const m={exports:{}};modules.set(file,m);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 function req(id){
  if(id==='postgres')return postgres;
  if(id==='server-only')return {};
  if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='next/navigation')return{redirect:()=>{throw Error('redirect');}};
  if(id.startsWith('node:'))return require(id);
  if(id.startsWith('.')){
   let target=path.resolve(path.dirname(file),id);
   if(!path.extname(target))target=['.ts','.tsx','.js'].map(e=>target+e).find(fs.existsSync)||target;
   if(target===path.join(web,'lib/auth.ts'))return{getPageAuth:async()=>({id:'auth_synthetic'}),roleAccess:async()=>({appUserId:'u_synthetic'}),isAffiliate:async()=>true};
   if(target===path.join(web,'lib/page-account.ts'))return{pageAccount:async()=>context};
   if(target===path.join(web,'lib/github-monitoring.ts'))return{githubMonitoringRuns:async()=>[]};
   if(target.endsWith('.tsx'))return{default:noop};
   return load(target);
  }
  return require(require.resolve(id,{paths:[path.dirname(file),path.join(web,'node_modules')]}));
 }
 vm.runInNewContext(code,{exports:m.exports,require:req,module:m,process:{env:{DATABASE_URL:'postgres://synthetic',NODE_ENV:'test'}},console,URL,Date,Error,setTimeout,clearTimeout,Buffer,crypto:require('node:crypto').webcrypto},{filename:file});
 return m.exports;
}
async function run(requests,budget){
 modules=new Map();active=peak=created=ended=rejected=0;open.clear();limit=budget;
 const page=load(path.join(web,'app/admin/page.tsx')).default;
 const results=await Promise.allSettled(Array.from({length:requests},()=>page({searchParams:Promise.resolve({})})));
 await new Promise(r=>setTimeout(r,500));
 const out={requests,syntheticSessionBudget:Number.isFinite(budget)?budget:null,peakSimultaneousClients:peak,created,ended,remainingOpen:active,poolRejections:rejected,pageResults:results.map(r=>r.status==='fulfilled'?'ok':r.reason.message)};
 console.log(JSON.stringify(out));assert.equal(active,0,'client leaked in measured path');return out;
}
(async()=>{
 const one=await run(1,15);assert.equal(one.peakSimultaneousClients,14);assert.deepEqual(one.pageResults,['ok']);
 const two=await run(2,15);assert.ok(two.poolRejections>0);assert.ok(two.pageResults.some(x=>x.includes('EMAXCONNSESSION')));
 console.log('PASS offline actual AdminPage + actual DAL/db factory; synthetic driver models session allocation, no network or real SQL. Two overlapping requests reproduce pool exhaustion; measured path closes its clients.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
