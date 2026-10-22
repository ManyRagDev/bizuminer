// Offline diagnostic: real page/DAL/db factory, synthetic driver/auth/UI; no SQL, Supabase session, or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.cwd(),web=path.join(root,'packages/web');
const ts=require(path.join(web,'node_modules/typescript'));
const context={tenantId:'synthetic',affiliateId:'aff_synthetic',actor:'human',actorAppUserId:'u_synthetic',authenticatedAuthUserId:'auth_synthetic',membershipRole:'owner',requestId:'offline'};
let active=0,peak=0,created=0,ended=0,rejected=0,limit=Infinity,poolCount=0;
const open=new Set();let sharedGlobal;
function postgres(_url,opts){
 poolCount++;const slots=[],waiting=[];
 async function acquire(){
  const free=slots.find(s=>!s.busy);if(free){free.busy=true;clearTimeout(free.timer);return free;}
  if(slots.length<opts.max){
   if(active>=limit){rejected++;throw Error('(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15');}
   const slot={id:++created,busy:true,timer:null};slots.push(slot);open.add(slot.id);active++;peak=Math.max(peak,active);return slot;
  }
  return new Promise(resolve=>waiting.push(resolve));
 }
 function close(slot){const i=slots.indexOf(slot);if(i>=0){slots.splice(i,1);open.delete(slot.id);active--;ended++;}}
 function release(slot){if(waiting.length){waiting.shift()(slot);return;}slot.busy=false;slot.timer=setTimeout(()=>close(slot),10);}
 async function query(text){
  await new Promise(r=>setTimeout(r,2));
  if(text.includes("to_regprocedure('garimpa.resolve_actor_accounts(text)')"))return[{ready:true}];
  if(text.includes('from garimpa.resolve_actor_accounts('))return[{affiliate_id:context.affiliateId}];
  if(text.includes('as products')&&text.includes('as observations'))return[{products:0,observations:0,runs:0,clicks_7d:0,publications:0,subscribers:0,members:0,favorites:0,active_watches:0,profiles:0,last_ok_run_at:null,last_discovery_at:null}];
  if(text.includes('as ready'))return[{ready:false}];return [];
 }
 function scoped(run){const sql=(parts,...values)=>run(parts.join('?'));sql.json=x=>JSON.stringify(x);sql.unsafe=s=>({toString:()=>s,then:(a,b)=>run(s).then(a,b)});return sql;}
 const sql=scoped(async text=>{const slot=await acquire();try{return await query(text);}finally{release(slot);}});
 sql.begin=async(...args)=>{const slot=await acquire();try{return await args.at(-1)(scoped(query));}finally{release(slot);}};
 sql.end=async()=>{for(const slot of [...slots]){clearTimeout(slot.timer);close(slot);}};return sql;
}
const noop=()=>null,jsx=(type,props)=>({type,props});
let modules;
let baseline=false;
function load(file){
 if(modules.has(file))return modules.get(file).exports;
 const m={exports:{}};modules.set(file,m);
 let source=fs.readFileSync(file,'utf8');
 // Reconstruct only the diagnosed legacy factory, keeping the real current page/DAL unchanged.
 // This keeps the regression self-contained after the original /tmp snapshot is removed.
 if(baseline&&file===path.join(web,'lib/db.ts')){
  const a=source.indexOf('export function db() {'),b=source.indexOf('/** A seleção editorial',a);
  assert.ok(a>=0&&b>a);
  source=source.slice(0,a)+`export function db(){
   const client=require('postgres')('postgres://synthetic',{prepare:false,max:1,ssl:false});
   const context=currentAccount();
   if(context){const begin=client.begin.bind(client);client.begin=(...args)=>{const callback=args.pop();return begin(...args,async tx=>{await require('./account-scope.ts').authorizeAccountTransaction(tx,context);return callback(tx);});};}
   return client;
  }\n`+source.slice(b);
 }
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
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
 vm.runInNewContext(code,{exports:m.exports,require:req,module:m,process:{env:{DATABASE_URL:'postgres://synthetic',NODE_ENV:'test'}},console,URL,Date,Error,setTimeout,clearTimeout,Buffer,globalThis:sharedGlobal,crypto:require('node:crypto').webcrypto},{filename:file});
 return m.exports;
}
async function run(requests,budget,before=false,polling=false){
 modules=new Map();sharedGlobal={};baseline=before;active=peak=created=ended=rejected=poolCount=0;open.clear();limit=budget;
 const page=load(path.join(web,'app/admin/page.tsx')).default;
 const tasks=Array.from({length:requests},()=>page({searchParams:Promise.resolve({})}));
 if(polling){const {captureBatches}=load(path.join(web,'lib/capture-batch-db.ts'));for(let i=0;i<6;i++)tasks.push(captureBatches.publicStatus());}
 const results=await Promise.allSettled(tasks);await new Promise(r=>setTimeout(r,100));
 const poolsBeforeReload=poolCount;
 if(!before){modules.delete(path.join(web,'lib/database-pool.ts'));modules.delete(path.join(web,'lib/db.ts'));await load(path.join(web,'lib/db.ts')).db().end();assert.equal(poolCount,poolsBeforeReload,'HMR created another pool');}
 const out={version:before?'before':'after',requests,polling,syntheticSessionBudget:budget,peakPhysicalClients:peak,poolCount,created,ended,remainingOpen:active,poolRejections:rejected,results:results.map(r=>r.status==='fulfilled'?'ok':r.reason.message)};
 console.log(JSON.stringify(out));assert.equal(active,0,'physical client leaked in measured path');return out;
}
(async()=>{
 const one=await run(1,15,true);assert.equal(one.peakPhysicalClients,14);assert.deepEqual(one.results,['ok']);
 const before=await run(2,15,true);assert.ok(before.poolRejections>0);
 const after=await run(2,15,false,true);assert.ok(after.peakPhysicalClients<=3);assert.equal(after.poolCount,1);assert.equal(after.poolRejections,0);assert.ok(after.results.every(x=>x==='ok'));
 console.log('PASS actual AdminPage + DAL with modelled session budget: before14/exhaustion, after<=3 and2pages+6polls complete; module reload reuses pool. Native suite separately verifies physical sessions/RLS.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
