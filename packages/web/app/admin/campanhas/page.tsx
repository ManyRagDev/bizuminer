import { getPageAuth,isAffiliate } from "../../../lib/auth";
import { getUserMemberships,resolveAccountContext } from "../../../lib/account-context";
import { publicProjectionReady } from "../../../lib/public-offer-db";
import { getCommercialDesk } from "../../../lib/commercial-workflow";
import CampaignDesk from "./workspace";

export const dynamic="force-dynamic";
export default async function CampaignPage({
  searchParams,
}: {
  searchParams: Promise<{
    conta?: string;
    productId?: string;
    opportunityId?: string;
    channel?: string;
    audienceKey?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return <p>Acesso não autorizado.</p>;
  const accounts = await getUserMemberships(user.id);
  const context = await resolveAccountContext({ authUserId: user.id, requestedAccount: params.conta });
  if (!context) return <p>Nenhuma conta autorizada disponível.</p>;
  if (!(await publicProjectionReady()))
    return (
      <section>
        <h1>Campanhas</h1>
        <p>A área comercial aguarda a conclusão da configuração da conta.</p>
      </section>
    );
  const desk = await getCommercialDesk(context);
  return (
    <CampaignDesk
      accounts={accounts}
      tenantId={context.tenantId}
      owner={context.membershipRole === "owner"}
      desk={JSON.parse(JSON.stringify(desk))}
      initialProductId={params.productId}
      initialOpportunityId={params.opportunityId}
      initialChannel={params.channel}
      initialAudienceKey={params.audienceKey}
    />
  );
}
