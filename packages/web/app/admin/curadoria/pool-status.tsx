import type { CurationPool, PoolClass } from "../../../lib/curation-pool-read.ts";

const labels:Record<PoolClass,string>={hot:"Quentes",warm:"Mornos",cold:"Frios ou fora da janela"};
export default function PoolStatus({pool,tenantId}:{pool:CurationPool|null;tenantId:string}) {
  if(!pool)return null;
  return <details className="curation-manual-edition"><summary>Pool de curadoria · {pool.counts.hot} quentes · {pool.counts.warm} mornos · {pool.counts.cold} frios</summary>
    <p>Classificação calculada a partir da edição, da previsão de slots, das promoções em andamento e dos scores atuais. Ela orienta a conferência e não publica produtos nem apaga histórico. A faixa morna comporta até {pool.capacity*3} candidatos além dos quentes.</p>
    {(["hot","warm","cold"] as const).map(group=>{
      const items=pool.items.filter(item=>item.classification===group);
      return <details key={group}><summary>{labels[group]} ({pool.counts[group]})</summary>
        {items.length ? <ul>{items.map(item=><li key={item.id}>
          <a href={`/admin/curadoria?aba=selecao&revisar=${encodeURIComponent(item.id)}&conta=${encodeURIComponent(tenantId)}`}>{item.title}</a> · {item.marketplace}
          {item.score!==null && <> · score {item.score.toFixed(1)}</>}
          {!item.editoriallyBlocked && item.inEdition && " · edição"}{!item.editoriallyBlocked && item.nextSlot && " · próximo slot"}{!item.editoriallyBlocked && item.promotion && " · conferência para promoção"}{item.watchPriority && " · acompanhamento pendente"}
          {item.editoriallyBlocked && " · fora da seleção editorial"}
        </li>)}</ul> : <p>Nenhum produto nesta classe.</p>}
        {pool.counts[group]>items.length && <p>Mostrando {items.length} de {pool.counts[group]} produtos.</p>}
      </details>;
    })}
  </details>;
}
