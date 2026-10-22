import { getPageAuth,isAffiliate } from "../../../lib/auth";
import { getUserMemberships,resolveAccountContext } from "../../../lib/account-context";
import { db } from "../../../lib/db";
import { getCommercialResults } from "../../../lib/commercial-financial-db";
import FinancialWorkspace from "./workspace";

export const dynamic="force-dynamic";
export default async function FinancialPage({searchParams}:{searchParams:Promise<{conta?:string}>}) {
 const user=await getPageAuth(); if(!user || !await isAffiliate(user)) return <p>Acesso não autorizado.</p>;
 const accounts=await getUserMemberships(user.id);
 const context=await resolveAccountContext({authUserId:user.id,requestedAccount:(await searchParams).conta});
 if(!context) return <p>Nenhuma conta autorizada disponível.</p>;
 const sql=db(); let ready=false;
 try { const [row]=await sql<{ready:boolean}[]>`select to_regclass('garimpa.conversion') is not null as ready`; ready=row?.ready===true; }
 finally {await sql.end();}
 if(!ready) return <section><h1>Resultados comerciais</h1><p>Esta área aguarda a conclusão da configuração comercial da conta.</p></section>;
 const data=await getCommercialResults(context);
 return <FinancialWorkspace accounts={accounts} tenantId={context.tenantId} platformOwner={context.tenantId==="local" && context.membershipRole==="owner"} data={JSON.parse(JSON.stringify(data))}/>;
}
