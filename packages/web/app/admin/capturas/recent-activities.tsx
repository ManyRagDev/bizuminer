import type { AccountContext } from "../../../lib/account-context.ts";
import { readCaptureActivities } from "../../../lib/capture-activity-db.ts";
import { captureDate, captureListHref } from "../../../lib/capture-activity.ts";
import AdminLink from "../../_components/admin-link.tsx";
import ActivityList from "./activity-list.tsx";
import "./captures.css";

export default async function RecentActivities({account}:{account:AccountContext}) {
  const result=await readCaptureActivities(account,{limite:6});
  return <section className="admin-section capture-history" aria-labelledby="recent-activities-title">
    <h2 id="recent-activities-title">Capturas recebidas recentemente</h2>
    {!result.available ? <p role="status">O histórico unificado depende da atualização correspondente do banco; os recebimentos não foram considerados vazios.</p>
      : result.items.length ? <ActivityList items={result.items} tenantId={account.tenantId}/>
      : <p>Nenhum recebimento encontrado nesta conta.</p>}
    <p className="curation-muted">Consultado em {captureDate(result.consultedAt)}. Conferências internas ficam no filtro próprio.</p>
    <AdminLink href={captureListHref(account.tenantId)}>Todas as capturas →</AdminLink>
  </section>;
}
