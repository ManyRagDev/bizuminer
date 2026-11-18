"use client";
import {useOperationProgress} from '../use-operation-progress.ts';
import AttributeReconcile from './attribute-reconcile.tsx';
import AdminLink from '../../_components/admin-link.tsx';
import ShopeeCredentialRetry from './shopee-credential-retry.tsx';
export default function OperationProblemsLive({tenantId,canRelease,category,after}:{tenantId:string;canRelease:boolean;category?:string;after?:string}){
  const {data,error,loading,refresh}=useOperationProgress(tenantId,undefined,{category,after});
  const href=(cursor?:string)=>`/admin/curadoria?${new URLSearchParams({aba:'problemas',conta:tenantId,...(category?{categoria:category}:{}),...(cursor?{depois:cursor}:{})})}`;
  const uncertain=data?.problems.filter(p=>p.category==='uncertain')??[];
  const issueReturn=new URLSearchParams({...(category?{categoria:category}:{}),...(after?{depois:after}:{})}).toString();
  const itemHref=(href:string)=>{const url=new URL(href,'https://scope.invalid');
    if(url.pathname.startsWith('/admin/curadoria/ofertas/')){url.searchParams.set('origem','avaliacoes');if(issueReturn)url.searchParams.set('retornoProblemas',issueReturn);}
    return url.pathname+url.search+url.hash;};
  return <div>
    {error&&<p role="alert">A consulta dos problemas está incompleta ou indisponível. Os dados conhecidos abaixo não comprovam que as pendências acabaram.</p>}
    {!data?<p>{loading?'Consultando problemas…':'Consulta indisponível.'}</p>:<>
      {!data.availability.processing?<p>Processamento indisponível nesta consulta.</p>:!data.problems.length?<p>Nenhuma pendência encontrada neste filtro.</p>:<ul>{data.problems.map(p=><li key={p.id}><strong>{p.title}</strong><p>{p.message}</p><AdminLink href={itemHref(p.href)}>Abrir o item e seu contexto</AdminLink></li>)}</ul>}
      {canRelease&&uncertain.length>0&&<AttributeReconcile tenantId={tenantId} total={uncertain.length} expanded issueReturn={issueReturn} items={uncertain.map(p=>({id:p.id.slice(4),productId:p.productId!,title:p.title,updatedAt:p.at!}))}/>}
      {!canRelease&&uncertain.length>0&&<p>A liberação de outra tentativa exige a conferência e justificativa do dono da conta.</p>}
      {canRelease&&!!data.preparation?.shopeeAuthRequests&&<ShopeeCredentialRetry tenantId={tenantId} asOf={data.preparation.authAsOf} count={data.preparation.shopeeAuthRequests}/>}
      <nav>{after&&<AdminLink href={href()}>Primeira página de problemas</AdminLink>} {data.problemsNext&&<AdminLink href={href(data.problemsNext)}>Próximos problemas →</AdminLink>}</nav>
      <p>Consultado em {new Date(data.consultedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. Contagens de diferentes etapas podem se sobrepor.</p>
    </>}
    <button type="button" onClick={refresh} disabled={loading}>Atualizar problemas</button>
    <AdminLink href={`/admin/curadoria?aba=problemas&conta=${encodeURIComponent(tenantId)}`}>Limpar filtros e abrir a primeira página</AdminLink>
  </div>;
}
