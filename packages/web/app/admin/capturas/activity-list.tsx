import type { CaptureActivity } from "../../../lib/capture-activity-db.ts";
import { captureDate, captureDetailHref, captureOriginLabels, captureStateLabels } from "../../../lib/capture-activity.ts";
import { marketplaceDef } from "../../../lib/marketplaces.ts";
import AdminLink from "../../_components/admin-link.tsx";

export default function ActivityList({ items, tenantId, query = {} }: {
  items:CaptureActivity[];tenantId:string;query?:Record<string,unknown>;
}) {
  return <ol className="capture-activity-list">{items.map(item=><li key={item.reference}>
    <div><strong>{item.stores.map(store=>marketplaceDef(store)?.label??store).join(" · ") || "Loja não registrada"}</strong>
      <p>{item.purpose==='internal' ? item.purposeLabel : captureOriginLabels[item.origin]}</p>
      <p>{item.origin==='individual' ? "Leitura registrada" : item.origin==='manual' ? "Recebida" : "Iniciada"} em {captureDate(item.startedAt)}</p>
    </div>
    <div><strong>{captureStateLabels[item.state]??item.state}</strong>
      {item.counts.products!==null && <p>{item.counts.products} produtos distintos no recebimento</p>}
      {item.counts.observationsSaved!==null && <p>{item.counts.observationsSaved} observações salvas</p>}
      {item.issue && <p>{item.issue}</p>}
      <AdminLink href={captureDetailHref(item.reference,tenantId,query)}>Abrir detalhes →</AdminLink>
    </div>
  </li>)}</ol>;
}
