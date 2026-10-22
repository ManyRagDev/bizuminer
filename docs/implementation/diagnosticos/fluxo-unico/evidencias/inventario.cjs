const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.cwd(), ts=require(path.join(root,'packages/web/node_modules/typescript'));
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next','dist','test','release'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|tsx|js|mjs|cjs)$/.test(p)&&!p.endsWith('.d.ts'))files.push(p);}}
for(const p of ['packages/web/app','packages/web/lib','packages/web/bin','packages/capture/src','packages/capture/bin','packages/persistence/src','packages/persistence/bin','packages/extension/src'])walk(path.join(root,p));
const rel=p=>path.relative(root,p);const entries=[];
for(const f of files.sort()){
 const source=fs.readFileSync(f,'utf8'), sf=ts.createSourceFile(f,source,ts.ScriptTarget.Latest,true),imports=[],routes=[],functions=[];
 function visit(n){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
   const s=n.moduleSpecifier.text;let resolved=null;if(s.startsWith('.')){const b=path.resolve(path.dirname(f),s);resolved=[b,b+'.ts',b+'.tsx',b+'.js',b+'/index.ts'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());}
   imports.push({specifier:s,target:resolved?rel(resolved):null,line:sf.getLineAndCharacterOfPosition(n.getStart()).line+1});
  }
  if(ts.isFunctionDeclaration(n)&&n.name&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))functions.push(n.name.text);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)){
   const s=ts.isTemplateExpression(n)?n.getText(sf).slice(1,-1):n.text;
   if(/^\/(admin|api|pauta|bizu|go|p\/|minha-area|plataforma|convite|entrar|auth)/.test(s))routes.push({value:s,line:sf.getLineAndCharacterOfPosition(n.getStart()).line+1});
  }
  ts.forEachChild(n,visit);
 }visit(sf);
 const tables=[...new Set([...source.matchAll(/\b(?:from|join|into|update)\s+garimpa\.([a-z_]+)/gi)].map(m=>m[1]))].sort();
 const hosts=[...new Set([...source.matchAll(/https?:\/\/([a-z0-9.-]+)(?=[\/:`"'\s])/gi)].map(m=>m[1]))].sort();
 const route=/packages\/web\/app\/(?:.*\/)?(?:page|route)\.tsx?$/.test(rel(f))?'/'+path.relative(path.join(root,'packages/web/app'),path.dirname(f)):null;
 entries.push({file:rel(f),sha256:crypto.createHash('sha256').update(source).digest('hex'),route:route==='/'?'/':route,functions,imports,routes,tables,hosts});
}
fs.writeFileSync('/tmp/bizuminer-fluxo-unico/inventario.json',JSON.stringify({scope:'Source static AST imports and literal routes; not runtime coverage; tables/hosts lexical references, including comments',entries},null,2));
console.log(JSON.stringify({files:entries.length,routes:entries.filter(e=>e.route).length,importEdges:entries.reduce((n,e)=>n+e.imports.filter(i=>i.target).length,0),routeReferences:entries.reduce((n,e)=>n+e.routes.length,0),tables:new Set(entries.flatMap(e=>e.tables)).size},null,2));
for(const e of entries.filter(e=>e.route))console.log(e.route+' | '+e.functions.join(',')+' | '+e.imports.filter(i=>i.target&&/lib\//.test(i.target)).map(i=>path.basename(i.target)).join(','));
