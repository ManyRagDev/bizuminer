import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../packages/persistence/supabase/',import.meta.url);
export async function replacementRollout() {
 const manifest=JSON.parse(await readFile(new URL('rollouts/v2/manifest.json',root),'utf8'));
 if(manifest.sealed!==true)throw new Error('rollout_candidate_not_sealed');
 const catalogue=await readFile(new URL('../../../docs/implementation/evidencias/rollout-31-expansion-catalog.json',root));
 const digest=createHash('sha256').update(catalogue).digest('hex');
 if(digest!==manifest.catalogueSha256)throw new Error('rollout_catalogue_hash_mismatch');
 const units=[];
 for(const item of [...manifest.installedSubset.map((x:any)=>({...x,phase:'installedSubset',directory:'migrations/'})),
  ...manifest.units.map((x:any)=>({...x,directory:'rollouts/v2/'}))]) {
  const path=new URL(item.directory+item.file,root),sql=await readFile(path,'utf8');
  if(!sql.trim()||createHash('sha256').update(sql).digest('hex')!==item.sha256)throw new Error('rollout_artifact_hash_mismatch:'+item.file);
  if(item.phase==='scoped_cutover'&&!sql.startsWith('-- Expansion catalogue sha256: '+digest+'\n'))throw new Error('rollout_cutover_catalogue_mismatch');
  units.push({...item,path,sql});
 }
 return {manifest,units};
}
