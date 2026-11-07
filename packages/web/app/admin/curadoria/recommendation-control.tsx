"use client";
import { useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminDraftState } from "../draft-provider.tsx";
import { RECOMMENDATION_CHANNELS,defaultChannelPolicy,type RecommendationChannel } from "../../../lib/recommendation-policy.ts";
import { configureChannelAction,previewChannelsAction } from "./recommendation-actions.ts";

const labels = {
  home: "Página inicial (Vitrine do site)",
  whatsapp: "WhatsApp (Grupos de ofertas)",
  stories: "Stories (Instagram)",
};

const channelHints = {
  home: "Destaques e ofertas principais da página inicial do site.",
  whatsapp: "As ofertas imperdíveis (maiores descontos, histórico estável e melhores notas) para postar nos grupos.",
  stories: "Seleção com fotos e apelo visual para postar nos Stories.",
};

interface Choice { id: string; title: string; displayTitle?: string; offerOptionLabel?: string }

function ChannelForm({ channel, current, canManage, tenantId, candidates }: { tenantId: string; channel: RecommendationChannel; current: any; canManage: boolean; candidates: Choice[] }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const picker = useRef<HTMLSelectElement>(null);
  const draftKey = `channel-choice:${channel}:${current?.version ?? 0}`;
  const [manual, setManual] = useAdminDraftState(draftKey + ":manual", current?.manual_order != null);
  const [chosen, setChosen] = useAdminDraftState<string[]>(draftKey + ":order", current?.manual_order ?? []);
  const title = (id: string) => { const p = candidates.find(c => c.id === id); return p?.displayTitle ?? p?.title ?? "Produto indisponível nesta revisão"; };
  const policy = current?.policy ?? defaultChannelPolicy(channel);

  function move(index: number, direction: number) {
    const next = [...chosen];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setChosen(next);
  }

  return (
    <form className="recommendation-channel" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      start(async () => {
        try {
          const result = await configureChannelAction({
            expectedTenantId: tenantId, channel, expectedVersion: current?.version ?? null, enabled: data.get("enabled") === "on",
            policy: { limit: Number(data.get("limit")), repeatHours: Number(data.get("repeatHours")), familyLimit: Number(data.get("familyLimit")), improvementPercent: Number(data.get("improvementPercent")) },
            manualOrder: manual ? chosen : null, validUntil: data.get("until") ? new Date(String(data.get("until"))).toISOString() : null
          });
          setMessage(result.ok ? ("preparationFailed" in result ? "Configuração salva. A preparação falhou; tente novamente." : "Lista atualizada com sucesso! A pauta já reflete as novas ofertas.")
            : result.error === 'channel_conflict' ? "Outra sessão alterou este canal. Atualize a página antes de salvar." : "Não foi possível atualizar. Confira os valores informados.");
          if (result.ok) router.refresh();
        } catch { setMessage("Não foi possível concluir agora. Seu rascunho foi preservado."); }
      });
    }}>
      <h3>{labels[channel]}</h3>
      <p style={{ margin: "4px 0 12px", fontSize: "14px", color: "var(--ink-muted, #71717a)" }}>{channelHints[channel]}</p>
      <fieldset disabled={!canManage || pending} style={{ border: "none", padding: 0 }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
          <input name="enabled" type="checkbox" defaultChecked={current?.enabled ?? false} />
          Ativar geração automática deste canal
        </label>
        <p style={{ margin: "2px 0 12px 24px", fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>
          💡 O BizuMiner seleciona sozinho as melhores oportunidades da vitrine aprovada (maior desconto real e melhores avaliações).
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />
          Escolher produtos e ordem manualmente (opcional)
        </label>
        <p style={{ margin: "2px 0 12px 24px", fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>
          💡 Deixe desmarcado para o sistema escolher os melhores do dia sozinho, ou marque se quiser fixar produtos específicos.
        </p>

        {manual && (
          <div style={{ marginTop: "12px", padding: "12px", background: "var(--paper-deep, #f4f4f5)", borderRadius: "8px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
              Adicionar um produto à lista:
              <select ref={picker} defaultValue="" style={{ display: "block", width: "100%", marginTop: "4px" }}>
                <option value="">Escolha um produto da vitrine</option>
                {candidates.filter(c => !chosen.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.displayTitle ?? c.title}</option>)}
              </select>
            </label>
            <button type="button" disabled={chosen.length >= 24} onClick={() => { const id = picker.current?.value; if (id && !chosen.includes(id)) setChosen([...chosen, id]); }}>
              + Adicionar à escolha
            </button>
            {chosen.length ? (
              <ol className="recommendation-order" style={{ marginTop: "12px" }}>
                {chosen.map((id, index) => (
                  <li key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line, #e4e4e7)" }}>
                    <span style={{ fontSize: "13px" }}>{title(id)}</span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button type="button" disabled={index === 0} aria-label={`Subir ${title(id)}`} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" disabled={index === chosen.length - 1} aria-label={`Descer ${title(id)}`} onClick={() => move(index, 1)}>↓</button>
                      <button type="button" aria-label={`Remover ${title(id)}`} onClick={() => setChosen(chosen.filter(item => item !== id))}>✕</button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--ink-muted, #71717a)", margin: "8px 0 0" }}>Nenhum produto escolhido ainda. Ao salvar vazio, o canal ficará sem indicações até você escolher produtos ou desmarcar a escolha manual.</p>
            )}
          </div>
        )}

        <details style={{ marginTop: "12px", border: "1px solid var(--line, #e4e4e7)", borderRadius: "8px", padding: "10px 14px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>⚙️ Ajustar limites de quantidade e descanso (opcional)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            <label style={{ fontSize: "13px" }}>
              Máximo de produtos na pauta (padrão: {policy.limit})
              <input name="limit" type="number" min="1" max="24" defaultValue={policy.limit} style={{ display: "block", width: "100%", marginTop: "4px" }} />
            </label>
            <label style={{ fontSize: "13px" }}>
              Descanso da oferta após divulgada (em horas, padrão: {policy.repeatHours}h)
              <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted, #71717a)" }}>Tempo para o mesmo produto não se repetir no grupo nos próximos dias.</span>
              <input name="repeatHours" type="number" min="0" max="720" defaultValue={policy.repeatHours} style={{ display: "block", width: "100%", marginTop: "4px" }} />
            </label>
            <label style={{ fontSize: "13px" }}>
              Queda mínima para antecipar retorno (%)
              <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted, #71717a)" }}>Se o preço cair mais que isso (ex: {policy.improvementPercent}%), a oferta pode voltar à pauta antes do fim do descanso.</span>
              <input name="improvementPercent" type="number" min="1" max="50" defaultValue={policy.improvementPercent} style={{ display: "block", width: "100%", marginTop: "4px" }} />
            </label>
            <label style={{ fontSize: "13px" }}>
              Máximo por categoria (anti-repetição)
              <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted, #71717a)" }}>Evita colocar muitos itens parecidos no mesmo dia (ex: {policy.familyLimit} por categoria).</span>
              <input name="familyLimit" type="number" min="1" max="4" defaultValue={policy.familyLimit} style={{ display: "block", width: "100%", marginTop: "4px" }} />
            </label>
            <label style={{ fontSize: "13px" }}>
              Validade opcional da lista
              <input name="until" type="datetime-local" defaultValue={current?.valid_until ? new Date(new Date(current.valid_until).getTime() - new Date(current.valid_until).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} style={{ display: "block", width: "100%", marginTop: "4px" }} />
            </label>
          </div>
        </details>

        <button type="submit" style={{ marginTop: "14px", width: "100%", padding: "10px", fontWeight: 600 }}>
          {pending ? "Atualizando lista…" : "Salvar e atualizar lista do canal"}
        </button>
      </fieldset>
      <p style={{ fontSize: "12px", color: "var(--ink-muted, #71717a)", marginTop: "8px" }}>
        Versão {current?.version ?? "ainda não criada"} · {current?.prepared_count ?? 0} produtos na lista
      </p>
      {message && <p role="status" style={{ marginTop: "8px", fontWeight: 500, color: message.includes("sucesso") ? "var(--brand, #0070f3)" : "inherit" }}>{message}</p>}
    </form>
  );
}

export default function RecommendationControl({ desk, canManage, tenantId, candidates }: { tenantId: string; candidates: Choice[]; desk: { ready: boolean; channels: any[]; coverage: any[]; confirmationQueue: any[] }; canManage: boolean }) {
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const title = (id: string) => candidates.find(c => c.id === id)?.displayTitle ?? candidates.find(c => c.id === id)?.title ?? "Produto indisponível nesta revisão";

  return (
    <section className="recommendation-control">
      <p className="eyebrow">Distribuição & Pauta</p>
      <h2>O que vai para cada canal hoje</h2>
      <p style={{ color: "var(--ink-muted, #71717a)", lineHeight: 1.5 }}>
        Aqui você configura quais ofertas vão para o <strong>WhatsApp</strong>, <strong>Stories</strong> e <strong>Página Inicial</strong>. O BizuMiner prioriza automaticamente os maiores descontos reais e melhores avaliações da vitrine. Copiar ou abrir links na pauta não envia nada automaticamente — você tem total controle antes de postar.
      </p>

      {!desk.ready ? (
        <p>A sincronização do banco precisa ser concluída antes de habilitar este painel.</p>
      ) : (
        <>
          <div className="recommendation-channels">
            {RECOMMENDATION_CHANNELS.map(channel => (
              <ChannelForm
                key={`${tenantId}:${channel}:${desk.channels.find(c => c.channel === channel)?.version ?? 0}`}
                tenantId={tenantId}
                candidates={candidates}
                channel={channel}
                current={desk.channels.find(c => c.channel === channel)}
                canManage={canManage}
              />
            ))}
          </div>

          <div style={{ margin: "20px 0" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => {
                try {
                  setPreview(await previewChannelsAction(tenantId));
                  setError("");
                } catch {
                  setError("Não foi possível simular agora.");
                }
              })}
              style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "6px", border: "1px solid var(--line, #e4e4e7)", background: "var(--surface, #fff)" }}
            >
              🔍 Simular lista (ver quais produtos entrariam agora sem salvar)
            </button>
          </div>

          {error && <p role="alert">{error}</p>}
          {preview && (
            <div role="status" style={{ padding: "16px", background: "var(--paper-deep, #f4f4f5)", borderRadius: "8px", margin: "16px 0" }}>
              {!preview.configured ? (
                <p>Ative ao menos um canal para simular sua escolha.</p>
              ) : (
                preview.channels.map((c: any) => (
                  <details key={c.channel} style={{ margin: "6px 0" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>{labels[c.channel as RecommendationChannel]}: {c.count} ofertas selecionadas</summary>
                    {c.excluded && c.excluded.length > 0 && (
                      <ul style={{ fontSize: "13px", color: "var(--ink-muted, #71717a)", marginTop: "8px" }}>
                        {c.excluded.slice(0, 30).map((e: any) => (
                          <li key={e.productId}>{title(e.productId)}: {e.reasons.join(" · ")}</li>
                        ))}
                      </ul>
                    )}
                  </details>
                ))
              )}
            </div>
          )}

          <h3 style={{ marginTop: "24px", fontSize: "16px" }}>Histórico das ofertas selecionadas</h3>
          <p style={{ fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>Mostra a solidez do histórico de preços das ofertas atualmente preparadas para publicação.</p>
          {desk.coverage.length ? (
            <ul style={{ fontSize: "13px", lineHeight: 1.6 }}>
              {desk.coverage.map(c => (
                <li key={c.channel}>
                  <strong>{labels[c.channel as RecommendationChannel]}</strong>: {c.with_series}/{c.shown} com preços comparáveis em ao menos 2 dias; {c.configuration_unknown} com configuração genérica; {c.stale} com preço há mais de 48h sem nova conferência.
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>O resumo aparecerá após a primeira lista ser gerada.</p>
          )}

          {desk.confirmationQueue.length > 0 && (
            <>
              <h3 style={{ marginTop: "24px", fontSize: "16px" }}>Ofertas sugeridas para conferência manual</h3>
              <p style={{ fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>Estas ofertas tiveram opções conferidas há mais de 24 horas. Clique no produto para abrir o anúncio e conferir se o preço continua válido:</p>
              <ul style={{ fontSize: "13px", lineHeight: 1.6 }}>
                {desk.confirmationQueue.map(p => (
                  <li key={p.id}><a href={`/admin/curadoria?aba=selecao&revisar=${encodeURIComponent(p.id)}`}>{p.title}</a></li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
