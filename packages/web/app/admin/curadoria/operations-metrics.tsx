import type { CurationOperationsMetrics } from "../../../lib/curation-operations-metrics.ts";
import AttributeReconcile from "./attribute-reconcile.tsx";
import ShopeeCredentialRetry from "./shopee-credential-retry.tsx";
import { curationOfferHref } from "../../../lib/curation-navigation.ts";

const exitReasons:Record<string,string>={
  better_challenger:'substituído por candidato melhor',merit_drop:'queda de mérito',missing:'candidato não disponível na disputa',
  duplicate_or_capacity:'equivalência, família ou capacidade',fact_or_eligibility_changed:'fato ou elegibilidade mudou durante a preparação',
  blocked:'bloqueio',awaiting_evaluation:'avaliação pendente',affiliate_link_missing:'link de afiliado ausente',
  unavailable_confirmed:'indisponibilidade confirmada',invalid_price:'preço inválido',score_unavailable:'pontuação indisponível',
  verification_required:'conferência necessária',
};
function describeExit(reason:string) { return reason.split(',').map(part=>exitReasons[part] ?? part).join(' · '); }

export default function OperationsMetrics({metrics}:{metrics:CurationOperationsMetrics|null}) {
  if(!metrics) return <details><summary>Operação da curadoria</summary><p>Indicadores indisponíveis para esta conta.</p></details>;
  return <details className="curation-manual-edition">
    <summary>Operação da curadoria</summary>
    <p>Contagens desta conta. Revisões, conferências concluídas e divulgações cobrem os últimos sete dias; pendências refletem o momento da consulta.</p>
    <p>Revisões: {metrics.reviews.open} abertas · {metrics.reviews.opened} iniciadas · {metrics.reviews.resolved} resolvidas · {metrics.reviews.expired} encerradas por prazo.</p>
    <p>Tempo informado pelos formulários de revisão: {metrics.reviewTime.minutes.toLocaleString('pt-BR')} min em {metrics.reviewTime.reviews} revisão(ões) nos últimos sete dias. Estima o período com o formulário aberto e a aba visível; não mede atenção e não inclui revisões sem duração registrada.</p>
    {metrics.uncertainAttributes && <AttributeReconcile tenantId={metrics.tenantId} {...metrics.uncertainAttributes}/>}
    {metrics.shopeeAuthPending>0 && <p role="status">{metrics.shopeeAuthPending} pedido(s) de conferência da Shopee tiveram a credencial recusada.
      Confira a conexão em Configurações → Lojas; a consulta volta a ser considerada após a atualização dos dados.</p>}
    {metrics.shopeeAuthPending>0 && metrics.canManageShopeeAuth && <ShopeeCredentialRetry tenantId={metrics.tenantId} asOf={metrics.shopeeAuthAsOf} count={metrics.shopeeAuthPending}/>}
    {metrics.shopeeConfigurationMismatch>0 && <p role="status">{metrics.shopeeConfigurationMismatch} pedido(s) da Shopee ainda aguardam confirmação: a resposta recebida não comprovou uma condição atual compatível de opção, moeda e preço. Uma nova tentativa fica sujeita ao prazo e à cota.</p>}
    {metrics.edition && <p>Última edição preparada: {metrics.edition.prepared} de {metrics.edition.capacity} posições
      {metrics.edition.oldestObservedAt && <> · observação mais antiga em {new Date(metrics.edition.oldestObservedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</>}.
      {metrics.edition.visible===null ? ' Não foi possível comparar com a edição pública atual.'
        : ` No momento da consulta, ${metrics.edition.visible} passaram pelos filtros públicos e ${Math.max(0,metrics.edition.capacity-metrics.edition.visible)} posições estão abertas.`}</p>}
    {metrics.selection && <><p>Seleção nos últimos sete dias: {metrics.selection.editions} edições preparadas · {metrics.selection.entries} entradas · {metrics.selection.exits} saídas · {metrics.selection.exceptions} exceções de diversidade.</p>
      {metrics.selection.reasons.length>0 && <ul>{metrics.selection.reasons.map(item=><li key={item.reason}>{describeExit(item.reason)}: {item.count}</li>)}</ul>}</>}
    <h4>Conferências por loja e tipo</h4>
    {metrics.recapture.length ? <div style={{overflowX:"auto"}}><table><thead><tr><th>Loja</th><th>Tipo</th><th>Pendentes</th><th>Em execução</th><th>Páginas concluídas</th><th>Alvos observados</th><th>Resíduos</th><th>Não reportados</th><th>Indisponíveis confirmados</th></tr></thead>
      <tbody>{metrics.recapture.map(row=><tr key={`${row.marketplace}:${row.kind}`}><td>{row.marketplace}</td><td>{row.kind==='pdp' ? 'Página de produto' : 'Listagem'}</td><td>{row.pending}</td><td>{row.claimed}</td><td>{row.completed}</td><td>{row.observed}</td><td>{row.residual}</td><td>{row.unreported}</td><td>{row.unavailable}</td></tr>)}</tbody></table></div>
      : <p>Nenhuma conferência registrada no período.</p>}
    {metrics.recapture.some(row=>row.oldestOpenAt) && <ul>{metrics.recapture.filter(row=>row.oldestOpenAt).map(row=><li key={`${row.marketplace}:${row.kind}`}>
      {row.marketplace} · {row.kind==='pdp' ? 'página de produto' : 'listagem'}: solicitação aberta mais antiga criada em {new Date(row.oldestOpenAt!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}.
    </li>)}</ul>}
    {metrics.recapture.some(row=>row.conflicts || row.no_price) && <p>Entre os resíduos: {metrics.recapture.reduce((sum,row)=>sum+row.conflicts,0)} divergências de preço
      e {metrics.recapture.reduce((sum,row)=>sum+row.no_price,0)} páginas de produto sem preço observado.</p>}
    {metrics.recapture.some(row=>row.kind==='listing' && row.observed+row.not_found>0) && <ul>
      {metrics.recapture.filter(row=>row.kind==='listing' && row.observed+row.not_found>0).map(row=><li key={row.marketplace}>
        {row.marketplace}: {row.observed} alvos com observação compatível e {row.not_found} não reencontrados nas listagens concluídas.
        Entre esses dois resultados, {Math.round(100*row.observed/(row.observed+row.not_found))}% foram observados; outros resíduos e alvos não reportados ficam fora dessa proporção.
      </li>)}
    </ul>}
    {metrics.unroutable.total>0 && <details><summary>{metrics.unroutable.total} opções sem página segura para conferência</summary>
      <p>Uma nova captura pode fornecer a página necessária. Estes itens não geram navegação automática.</p>
      <ul>{metrics.unroutable.items.map(item=><li key={`${item.productId}:${item.optionKey}`}>
        <a href={curationOfferHref(item.productId,metrics.tenantId,{optionKey:item.optionKey,confirm:true})}>{item.title}</a> · {item.marketplace}
        {item.watched ? ' · acompanhamento ativo' : ' · conferência editorial'}
      </li>)}</ul>
      {metrics.unroutable.total>metrics.unroutable.items.length && <p>Exibindo os primeiros {metrics.unroutable.items.length} itens.</p>}
    </details>}
    <h4>Reservas de hoje</h4>
    {metrics.budget.length ? <ul>{metrics.budget.map(row=><li key={`${row.kind}:${row.marketplace}`}>{row.kind==='ai' ? 'IA' : row.kind==='shopee' ? 'Consulta Shopee' : row.kind==='pdp' ? 'Página de produto' : 'Listagem'}
      {row.marketplace==='all' ? ' · total da conta' : ` · ${row.marketplace}`}: {row.consumed}
      {row.kind!=='ai' && <> · {row.watchConsumed} para acompanhamentos</>}</li>)}</ul> : <p>Nenhuma reserva registrada hoje.</p>}
    <p>Os totais por loja fazem parte do total da conta quando ambos são exibidos. Reservas podem incluir tentativas sem resposta; não representam custo em dinheiro, tokens nem número de produtos.</p>
    <h4>Divulgações declaradas</h4>
    {metrics.exposures.length ? <ul>{metrics.exposures.map(row=><li key={row.channel}>{row.channel}: {row.count} produtos · {row.expired} com preparação vencida</li>)}</ul> : <p>Nenhuma divulgação declarada no período.</p>}
    <p>Custo monetário e todos os motivos de falha ainda não são medidos por este painel.</p>
  </details>;
}
