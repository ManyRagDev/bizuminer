import { pageAccount, platformPageContext } from "../../../lib/page-account.ts";
import { affiliateWorkspaceEnabled, workspaceSettings } from "../../../lib/affiliate-workspace-db.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import AdminLink from "../../_components/admin-link.tsx";
import Settings from "./workspace.tsx";
export const dynamic = "force-dynamic";
const marketplaceLabels: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  aliexpress: "AliExpress",
};
export default async function Page() {
  const c = await pageAccount();
  if (!c) return null;
  const href=(path:string)=>path+(path.includes('?')?'&':'?')+new URLSearchParams({conta:c.tenantId});
  if (!await affiliateWorkspaceEnabled(c)) {
    return <div className="bm-workspace">
      <header className="bm-page-heading"><p className="bm-eyebrow">Configurações</p><h1>Ajustes da operação</h1>
        <p>Configure as lojas, os critérios de indicação e os canais desta conta.</p></header>
      <section className="bm-card"><h2>Lojas e extensão</h2><p>Conexões, vínculos afiliados, pareamento e recebimento manual nas lojas suportadas.</p>
        <AdminLink href={href('/admin/onboarding')}>Conferir lojas e extensão →</AdminLink></section>
      <section className="bm-card"><h2>Critérios e canais</h2><p>Público, critérios editoriais e regras de seleção. Aprovação e seleção para cada canal são etapas diferentes.</p>
        <AdminLink href={href('/admin/curadoria?aba=bussola')}>Ajustar critérios e canais →</AdminLink></section>
      {c.membershipRole==='owner'?<section className="bm-card"><h2>Equipe e conta</h2><AdminLink href={href('/admin?aba=afiliados')}>Gerenciar equipe e conta →</AdminLink></section>
        :<p>Alterações de conexão e administração da conta dependem do dono.</p>}
      <details className="bm-card"><summary>Ferramentas avançadas</summary><div className="bm-actions">
        <AdminLink href={href('/admin?aba=rodagens')}>Comandos de captura</AdminLink>
        <AdminLink href={href('/admin/governanca')}>Evidências e aprovações</AdminLink>
        <AdminLink href={href('/admin/experimentos')}>Experimentos</AdminLink>
      </div></details>
    </div>;
  }
  const [settings, platform, entitlements] = await Promise.all([
    workspaceSettings(c),
    platformPageContext(),
    withAccountDb(c, async (tx) => {
      const [r] =
        await tx`select to_regclass('garimpa.account_entitlement') is not null as ready`;
      return r?.ready
        ? await tx<
            any[]
          >`select plan_version,status,starts_at,ends_at,limits from garimpa.account_entitlement where tenant_id=${c.tenantId} order by starts_at desc limit 10`
        : [];
    }),
  ]);
  return (
    <div className="bm-workspace">
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Configurações</p>
        <h1>Seu público. Seu jeito de vender.</h1>
        <p>Escolha para quem você indica e mantenha suas lojas conectadas.</p>
      </header>
      <div className="bm-actions">
        <AdminLink className="bm-button" href={href('/admin/onboarding')}>
          Conectar ou conferir minhas lojas →
        </AdminLink>
      </div>
      <Settings
        tenantId={c.tenantId}
        owner={c.membershipRole === "owner"}
        initial={JSON.parse(JSON.stringify(settings))}
      />
      <section className="bm-card bm-help">
        <h2>Habilitação e limites da conta</h2>
        {entitlements.length ? (
          entitlements.map((e: any, i: number) => (
            <div key={i}>
              <p>
                <b>Uso da conta</b> ·{" "}
                {e.status === "pilot"
                  ? "Piloto"
                  : e.status === "active"
                    ? "Ativo"
                    : e.status === "suspended"
                      ? "Suspenso"
                      : "Encerrado"}
              </p>
              <p className="bm-muted">
                Até {e.limits.maxDailyKits ?? "limite não informado"} materiais
                por dia · Até{" "}
                {e.limits.maxActiveCampaigns ?? "limite não informado"}{" "}
                campanhas ativas
                {e.ends_at
                  ? " · Validade: " +
                    new Date(e.ends_at).toLocaleDateString("pt-BR")
                  : " · Sem vencimento"}
              </p>
              <p className="bm-muted">
                Lojas permitidas:{" "}
                {e.limits.allowedMarketplaces
                  ?.map((store: string) => marketplaceLabels[store] ?? store)
                  .join(", ") || "não informadas"}
                . Cada loja depende da sua conexão e habilitação.
              </p>
            </div>
          ))
        ) : (
          <p>
            A conta ainda não possui uma habilitação comercial registrada. Peça
            ao responsável pela plataforma para conferir o acesso.
          </p>
        )}
      </section>
      <details className="bm-card bm-help">
        <summary>Ferramentas avançadas</summary>
        <p>
          Use quando precisar ajustar a operação ou revisar as regras da conta.
        </p>
        <div className="bm-actions">
          <AdminLink href={href('/admin?aba=rodagens')}>
            Recebimento de ofertas
          </AdminLink>
          <AdminLink href={href('/admin/curadoria?aba=excecoes')}>
            Fila de revisão
          </AdminLink>
          <AdminLink href={href('/admin/curadoria?aba=bussola')}>
            Critérios editoriais
          </AdminLink>
          <AdminLink href={href('/admin/governanca')}>
            Evidências e aprovações
          </AdminLink>
          <AdminLink href={href('/admin/experimentos')}>Experimentos</AdminLink>
          <AdminLink href={href('/admin?aba=afiliados')}>Equipe e conta</AdminLink>
          {platform && (
            <AdminLink href="/plataforma">
              Administração da plataforma →
            </AdminLink>
          )}
        </div>
      </details>
    </div>
  );
}
