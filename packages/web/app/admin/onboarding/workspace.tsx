"use client";
import { useEffect, useState } from "react";
import { useAdminFetch } from "../draft-provider.tsx";
import { verifyLinkTestAction } from "../onboarding-actions.ts";
import type {
  ConnectionView,
  StoreName,
} from "../../../lib/account-connections.ts";
const stores: {
  id: StoreName;
  label: string;
  fields: { id: string; label: string }[];
}[] = [
  {
    id: "mercadolivre",
    label: "Mercado Livre",
    fields: [
      { id: "trackingId", label: "Identificação de afiliado (tracking ID)" },
      { id: "toolId", label: "Identificação da ferramenta (tool ID)" },
    ],
  },
  {
    id: "shopee",
    label: "Shopee",
    fields: [
      { id: "appId", label: "App ID do programa de afiliados" },
      { id: "appSecret", label: "App Secret" },
    ],
  },
  {
    id: "aliexpress",
    label: "AliExpress",
    fields: [
      { id: "appKey", label: "App Key" },
      { id: "appSecret", label: "App Secret" },
      { id: "trackingId", label: "Tracking ID" },
    ],
  },
];
function ConnectionForm({
  store,
  connection,
  canManage,
  ready,
  secretStorageReady,
  onSaved,
}: {
  store: (typeof stores)[number];
  connection?: ConnectionView;
  canManage: boolean;
  ready: boolean;
  secretStorageReady: boolean;
  onSaved: () => void;
}) {
  const fetch = useAdminFetch(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const status = {
    missing: "Não configurada",
    configured: "Dados salvos · teste pendente",
    verified: "Conexão aceita pela loja",
    failed: "A loja recusou a conexão",
  };
  return (
    <section className="bm-card">
      <h2>{store.label}</h2>
      <p className="bm-status">
        {store.id === "mercadolivre" && connection?.status === "verified"
          ? "Link conferido com evidência documentada"
          : status[connection?.status ?? "missing"]}
      </p>
      <p>
        {store.id === "mercadolivre"
          ? "O Mercado Livre exige conferência humana no navegador."
          : "Use os dados da API do seu programa de afiliados. O teste consulta a API oficial."}
      </p>
      <form
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = new FormData(form);
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/admin/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  marketplace: store.id,
                  fields: Object.fromEntries(
                    store.fields.map((f) => [
                      f.id,
                      String(data.get(f.id) ?? ""),
                    ]),
                  ),
                }),
              }),
              result = await r.json();
            if (!r.ok) throw new Error(result.error);
            form.reset();
            setMessage(result.message);
            onSaved();
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Não foi possível salvar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!canManage || !ready || busy || (store.id !== "mercadolivre" && !secretStorageReady)}>
          {store.fields.map((f) => (
            <label key={f.id}>
              {f.label}
              <input
                type="password"
                name={f.id}
                required
                maxLength={2000}
                autoComplete="new-password"
              />
            </label>
          ))}
          <button className="bm-button secondary" type="submit">
            {busy
              ? "Salvando…"
              : connection?.configured
                ? "Atualizar dados"
                : "Salvar conexão"}
          </button>
        </fieldset>
      </form>
      {connection?.configured && store.id !== "mercadolivre" && (
        <button
          className="bm-button secondary"
          disabled={!canManage || !ready || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/admin/connections", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "test",
                    marketplace: store.id,
                  }),
                }),
                v = await r.json();
              setMessage(v.message ?? v.error);
              onSaved();
            } catch {
              setMessage("A loja não respondeu. O teste continua pendente.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Testar conexão
        </button>
      )}
      {connection?.checkedAt && (
        <small>
          Último teste: {new Date(connection.checkedAt).toLocaleString("pt-BR")}
        </small>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export default function OnboardingWorkspace({
  tenantId,
  platformAdmin,
  canManage,
  canDocumentLinks,
}: {
  tenantId: string;
  platformAdmin: boolean;
  canManage: boolean;
  canDocumentLinks: boolean;
}) {
  const fetch = useAdminFetch(),
    [data, setData] = useState<{
      schemaReady: boolean;
      secretStorageReady: boolean;
      connections: ConnectionView[];
    }>({ schemaReady: false, secretStorageReady: false, connections: [] }),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/connections", { signal: controller.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setData(v);
        setLoaded(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNotice(e.message);
      });
    return () => controller.abort();
  }, [fetch, refresh]);
  const ml = data.connections.find((c) => c.marketplace === "mercadolivre");
  return (
    <div className="bm-workspace">
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Configurações · Lojas</p>
        <h1>Suas lojas, seus links.</h1>
        <p>
          Conecte uma loja para começar. Cada loja mostra o que já foi
          conferido.
        </p>
      </header>
      {!canManage && (
        <p className="bm-notice">
          Peça ao responsável da conta para configurar as conexões.
        </p>
      )}
      {!loaded && !notice && <p role="status">Carregando conexões…</p>}
      {loaded && !data.schemaReady && (
        <p className="bm-notice">
          A configuração das conexões aguarda a habilitação desta capacidade no
          ambiente.
        </p>
      )}
      {loaded && data.schemaReady && !data.secretStorageReady && (
        <p className="bm-notice">
          O armazenamento seguro de credenciais está indisponível neste ambiente.
          Peça ao responsável pelo sistema para configurá-lo antes de salvar os dados da Shopee ou AliExpress.
        </p>
      )}
      <div className="bm-grid">
        {stores.map((s) => (
          <ConnectionForm
            key={s.id}
            store={s}
            connection={data.connections.find((c) => c.marketplace === s.id)}
            canManage={canManage}
            ready={data.schemaReady}
            secretStorageReady={data.secretStorageReady}
            onSaved={() => setRefresh((v) => v + 1)}
          />
        ))}
      </div>
      {ml?.configId && !canDocumentLinks && (
        <p className="bm-notice">
          A conferência de links do Mercado Livre com envio de arquivo ainda não está disponível neste ambiente.
          Os dados de conexão da loja podem ser salvos acima.
        </p>
      )}
      {ml?.configId && canDocumentLinks && (
        <section className="bm-card">
          <h2>Conferir meu link do Mercado Livre</h2>
          <p>
            Abra um link gerado com seus dados, confira o destino e anexe uma
            imagem ou PDF da verificação. Isso documenta o link; a comissão
            depende das regras da loja.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget),
                upload = new FormData();
              upload.set("file", d.get("evidence")!);
              upload.set("kind", "account_evidence");
              upload.set("tenantId", tenantId);
              setBusy(true);
              try {
                const r = await fetch("/api/admin/artifacts/upload", {
                    method: "POST",
                    body: upload,
                  }),
                  v = await r.json();
                if (!r.ok) throw new Error(v.error);
                const result = await verifyLinkTestAction({
                  configId: ml.configId!,
                  evidenceId: v.artifact?.id ?? v.id,
                  affiliateUrl: String(d.get("url")),
                  notes: String(d.get("notes")),
                });
                if (!result.ok)
                  throw new Error(
                    "Não foi possível registrar a conferência. Confira o link e o arquivo.",
                  );
                setNotice("Conferência documentada com o arquivo enviado.");
                setRefresh((v) => v + 1);
              } catch (e) {
                setNotice(
                  e instanceof Error ? e.message : "Não foi possível concluir.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={!canManage || busy || !data.schemaReady}>
              <label>
                Link de afiliado conferido
                <input name="url" type="url" required placeholder="https://…" />
              </label>
              <label>
                Evidência da conferência
                <input
                  name="evidence"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  required
                />
              </label>
              <label>
                O que você conferiu
                <textarea
                  name="notes"
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <button className="bm-button" type="submit">
                {busy ? "Enviando…" : "Registrar conferência"}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {notice && (
        <p role="status" className="bm-notice">
          {notice}
        </p>
      )}
      <div className="bm-actions">
        <a href={`/admin?${new URLSearchParams({conta:tenantId})}`} className="bm-button">
          Voltar a Hoje →
        </a>
        <a href={`/admin/configuracoes?${new URLSearchParams({conta:tenantId})}`}>Voltar às configurações</a>
        {platformAdmin && <a href="/plataforma">Administração da plataforma</a>}
      </div>
    </div>
  );
}
