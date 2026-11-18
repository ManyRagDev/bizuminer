/** Local test-only restoration of literal Garimpa pg_dump sections and reviewed ACLs.
 * Does not read credentials/data or supply a deployable Supabase bootstrap. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { nativePostgresFixture } from './native-postgres-fixture.ts';

export async function realGarimpaBaselineFixture(schemaPath:string,grantsPath:string) {
 const bytes=await readFile(schemaPath),baselineSha256=createHash('sha256').update(bytes).digest('hex');
 assert.equal(baselineSha256,'143131cb89882497c755261bfb64a49c4a05c8512cc6b31e37e5b0812dc17ce1','unreviewed_schema_hash');
 const dump=bytes.toString('utf8');
 const objects=[...dump.matchAll(/^--\r?\n-- Name: (.*?); Type: (.*?); Schema: (.*?); Owner:.*\r?\n--\r?\n/gm)];
 const sections=objects.flatMap((m,i)=>m[3]==='garimpa'||m[1]==='garimpa'&&m[2]==='SCHEMA'?[dump.slice(m.index,objects[i+1]?.index??dump.length)]:[]);
 assert.equal(sections.length,942);
 const fx=await nativePostgresFixture({initialize:async pg=>{
  await pg.exec('create role garimpa_app; create role garimpa_public_runtime; create role anon; create role authenticated; create role service_role;');
  await pg.exec('set check_function_bodies=false;');await pg.exec(sections.join(''));await pg.exec('set check_function_bodies=true;');
 }});
 try {
  for(const file of ['20261020002440_garimpa_comparative_evidence_event.sql','20261110192436_marketplace_performance.sql',
   '20261111042204_pauta_versioned_selection.sql','20261112002243_capture_durable_execution.sql','20261112002247_capture_atomic_publication.sql','20261112023232_shared_link_archive.sql'])
   await fx.pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/'+file,import.meta.url),'utf8'));
  const acl=await readFile(grantsPath,'utf8'),grantsSha256=createHash('sha256').update(acl).digest('hex');
  // These are exactly the Garimpa halves of the review's three combined-schema revokes.
  await fx.pg.exec(`revoke execute on all functions in schema garimpa from public,anon,authenticated;
   revoke all on all tables in schema garimpa from public,anon,authenticated,garimpa_public_runtime;
   revoke all on all sequences in schema garimpa from public,anon,authenticated,garimpa_public_runtime;`);
  const statements=acl.replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim())
   .filter(s=>/^(?:GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)\b/i.test(s)&&/\bgarimpa\b/.test(s)&&!s.includes('postspark'));
  for(const statement of statements)await fx.pg.exec(statement+';');
  console.log(JSON.stringify({baselineSha256,grantsSha256,garimpaObjects:sections.length,garimpaAclStatements:statements.length,scope:'literal local schema + reviewed Garimpa ACL only'}));
  return fx;
 } catch(error) { await fx.close(); throw error; }
}
