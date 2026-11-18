import type {AccountContext} from '../../../lib/account-context.ts';
import {readOperationHistory} from '../../../lib/operation-progress-db.ts';
import OperationProblemsLive from './operation-problems-live.tsx';
import AdminLink from '../../_components/admin-link.tsx';
const categories:Record<string,string>={uncertain:'Resultados incertos',failed:'Falhas de avaliação',lease:'Avaliações sem confirmação',unconfirmed:'Conferências sem confirmação',outdated:'Revisões anteriores',auth:'Conexão da loja',configuration:'Configuração do avaliador',link:'Vínculo afiliado indisponível',quota:'Cota do provedor',browser:'Conferência no navegador',retry:'Aguardando prazo',pending:'Conferências na fila',expired:'Prazos encerrados'};
export function OperationProblems({account,query}:{account:AccountContext;query:Record<string,string|undefined>}){
  return <section className="curation-area-intro" id="avaliacoes-incertas"><h2>Problemas para resolver</h2>
    <p>Pendências de execução são separadas das exceções editoriais. Os fatos capturados continuam salvos.</p>
    <form action="/admin/curadoria"><input type="hidden" name="conta" value={account.tenantId}/><input type="hidden" name="aba" value="problemas"/>
      <label>Tipo de pendência <select name="categoria" defaultValue={query.categoria??''}><option value="">Todos os tipos</option>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><button type="submit">Filtrar problemas</button></form>
    <OperationProblemsLive key={JSON.stringify([account.tenantId,query.categoria,query.depois])} tenantId={account.tenantId} canRelease={account.membershipRole==='owner'} category={query.categoria||undefined} after={query.depois}/>
  </section>;
}
export async function OperationHistory({account,after}:{account:AccountContext;after?:string}){
  try{const result=await readOperationHistory(account,after);
    return <section className="curation-area-intro"><h2>Histórico da curadoria automática</h2><p>Avaliações, revisões substituídas e mudanças da seleção são registros diferentes. Um registro anterior não comprova compatibilidade ou presença atual na pauta.</p>
      {!result.available?<p role="alert">Histórico v2 indisponível neste ambiente.</p>:!result.items.length?<p>Nenhum evento v2 encontrado nesta página.</p>:<ul>{result.items.map(item=><li key={item.id}><strong>{item.title}</strong><p>{item.message} · {new Date(item.at!).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p><AdminLink href={item.href}>Conferir situação atual</AdminLink></li>)}</ul>}
      {result.next&&<AdminLink href={`/admin/curadoria?${new URLSearchParams({aba:'pipeline',conta:account.tenantId,historicoDepois:result.next})}`}>Eventos anteriores →</AdminLink>}
      {after&&<AdminLink href={`/admin/curadoria?aba=pipeline&conta=${encodeURIComponent(account.tenantId)}`}>Eventos mais recentes</AdminLink>}
    </section>;
  }catch{return <p role="alert">Não foi possível consultar o histórico atual. Tente novamente pela primeira página.</p>;}
}
