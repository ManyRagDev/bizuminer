import {commercialFixture} from '../../../tools/editorial-tests/commercial-fixture.ts';
import {readFile,writeFile} from 'node:fs/promises';
const {pg,applied}=await commercialFixture();
const source=await readFile(new URL('./auditoria-22-precondicoes.sql',import.meta.url),'utf8');
const sql=source.slice(source.indexOf('-- P1:'),source.indexOf('-- P2:'));
const statements=sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
const results:any[]=[];
for(const statement of statements){try{const result=await pg.query(statement);results.push({sql:statement,ok:true,rowCount:result.rows.length});}
catch(e:any){results.push({sql:statement,ok:false,error:e.message,code:e.code});}}
await pg.close();
// Storage is Supabase-owned and intentionally missing from the local fixture.
const unexpected=results.filter(r=>!r.ok && !r.sql.includes('storage.buckets'));
await writeFile(new URL('./auditoria-22-verificar-selects.json',import.meta.url),JSON.stringify({environment:'isolated fixture; empty new tables; syntax/catalogue check only',applied,results},null,2)+'\n');
console.log(JSON.stringify({statements:results.length,unexpected,storageIntentionallyUnavailable:results.filter(r=>!r.ok&&r.sql.includes('storage.buckets')).length}));
if(unexpected.length) process.exitCode=1;
