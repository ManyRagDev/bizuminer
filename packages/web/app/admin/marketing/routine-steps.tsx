"use client";
import { useState, type ReactNode } from "react";
import {
  saoPauloToday,
  type MarketingContent,
  type MarketingWorkspace,
  type RoutineDay,
  type RoutineOffer,
} from "../../../lib/marketing-contract";
import {
  contentIssue,
  isFeedDay,
  isStoryDay,
  offerMessage,
} from "../../../lib/marketing-routine";
import {
  offerFromPauta,
  shareableLink,
  type MarketingPautaProduct,
} from "../../../lib/marketing-pauta";
import { suggestedRoutineContent } from "../../../lib/marketing-editorial";
import { copyToClipboard } from "../../../lib/clipboard";
import s from "./routine.module.css";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function CopyButton({
  text,
  label = "Copiar texto",
  disabled = false,
}: {
  text: string;
  label?: string;
  disabled?: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  return (
    <div>
      <button
        className={s.button}
        type="button"
        disabled={disabled}
        onClick={async () =>
          setFeedback(
            (await copyToClipboard(text))
              ? "Copiado. Agora você pode colar no destino."
              : "Selecione o texto e copie manualmente.",
          )
        }
      >
        {label}
      </button>
      {feedback && (
        <p role="status" className={s.hint}>
          {feedback}
        </p>
      )}
    </div>
  );
}
export function OfferStep({
  day,
  tenantId,
  onChange,
}: {
  day: RoutineDay;
  tenantId: string;
  onChange: (offer: RoutineOffer) => void;
}) {
  const [products, setProducts] = useState<MarketingPautaProduct[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const o = day.offer;
  function edit(key: keyof RoutineOffer, value: string) {
    onChange({
      ...o,
      [key]: value,
      verifiedAt: "",
      ...(key === "price" ? { priceLabel: "", capturedAt: "" } : {}),
    });
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pauta", {
        cache: "no-store",
        headers: { "x-bm-account": tenantId },
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          "Não foi possível abrir sua pauta. Você pode preencher a oferta abaixo.",
        );
      setProducts(data.products?.slice(0, 60) ?? []);
      if (!data.products?.length)
        setError(
          "Sua pauta ainda não tem uma oferta disponível. Escolha na loja e preencha abaixo.",
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível consultar a pauta.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <p>
        Escolha um produto da pauta. Nome, preço, imagem, link e os textos
        disponíveis entram automaticamente. Você só ajusta o que quiser.
      </p>
      <button
        type="button"
        className={s.button}
        onClick={() => void load()}
        disabled={loading}
      >
        {loading ? "Abrindo sua pauta…" : "Escolher da minha pauta"}
      </button>
      {error && (
        <p className={s.hint} role="status">
          {error}
        </p>
      )}
      {products.length > 0 && (
        <div className={s.candidates}>
          {products.map((p) => (
            <button
              className={s.candidate}
              type="button"
              key={p.id}
              onClick={() => {
                onChange(offerFromPauta(p));
                setProducts([]);
              }}
            >
              {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" />}
              <span>{p.title}</span>
              <small>Usar dados e link da pauta</small>
            </button>
          ))}
        </div>
      )}
      {(o.name || o.url) && (
        <div className={s.previewGrid}>
          {shareableLink(o.imageUrl) && (
            <img
              className={s.productImage}
              src={o.imageUrl}
              alt={o.name || "Produto selecionado"}
            />
          )}
          <div>
            <h3>{o.name || "Produto selecionado"}</h3>
            <p>
              {o.priceLabel ||
                (o.price
                  ? "R$ " + o.price
                  : "Preço e condições no link da oferta.")}
            </p>
            {o.reason && <p>{o.reason}</p>}
            <p className={s.hint}>
              {o.verifiedAt
                ? "Conferência manual registrada."
                : "Dados importados da pauta. Você pode seguir para o compartilhamento."}
            </p>
          </div>
        </div>
      )}
      <details className={s.details}>
        <summary>
          {o.name || o.url
            ? "Editar ou complementar os dados (opcional)"
            : "Adicionar oferta manualmente (opcional)"}
        </summary>
        <div className={s.formGrid}>
          <Field label="Produto">
            <input
              value={o.name}
              maxLength={250}
              placeholder="Ex.: luminária para armário"
              onChange={(e) => edit("name", e.target.value)}
            />
          </Field>
          <Field
            label="Versão / o que vem (opcional)"
            hint="Aproveitamos o conteúdo do pacote quando a pauta informa. Ajuste a versão se precisar."
          >
            <input
              value={o.variant}
              maxLength={500}
              onChange={(e) => edit("variant", e.target.value)}
            />
          </Field>
          <Field label="Por que indicar este produto? (opcional)">
            <textarea
              value={o.reason}
              maxLength={2000}
              placeholder="Explique qual situação ele resolve."
              onChange={(e) => edit("reason", e.target.value)}
            />
          </Field>
          <Field
            label="Preço da pauta (editável)"
            hint="Mantemos moeda, faixa ou “a partir de” conforme os dados disponíveis. Se ajustar um valor em reais, digite 89,90."
          >
            <input
              inputMode="decimal"
              value={o.priceLabel || o.price}
              maxLength={40}
              placeholder="89,90"
              onChange={(e) => edit("price", e.target.value)}
            />
          </Field>
          <Field
            label="Condições e observações (opcional)"
            hint="Usamos as observações disponíveis. Frete, cupom e pagamento podem ser consultados pelo link."
          >
            <textarea
              value={o.conditions}
              maxLength={2000}
              onChange={(e) => edit("conditions", e.target.value)}
            />
          </Field>
          <Field label="Link da pauta ou de compra">
            <input
              type="url"
              value={o.url}
              maxLength={2000}
              placeholder="https://…"
              onChange={(e) => edit("url", e.target.value)}
            />
          </Field>
          <Field
            label="Link da foto do produto"
            hint="Opcional. Use uma imagem correspondente à versão e com uso permitido."
          >
            <input
              type="url"
              value={o.imageUrl}
              maxLength={2000}
              placeholder="https://…"
              onChange={(e) => edit("imageUrl", e.target.value)}
            />
          </Field>
        </div>
        {shareableLink(o.url) && (
          <a
            className={s.button}
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir oferta para conferir ↗
          </a>
        )}
        <label className={s.check}>
          <input
            type="checkbox"
            checked={
              !!o.verifiedAt &&
              saoPauloToday(new Date(o.verifiedAt)) === saoPauloToday()
            }
            onChange={(e) =>
              onChange({
                ...o,
                verifiedAt: e.target.checked ? new Date().toISOString() : "",
              })
            }
          />
          <span>Também conferi as condições na loja hoje (opcional).</span>
        </label>
      </details>
      <p className={s.endpoint}>
        Os campos complementares são opcionais. A seleção da pauta não cria uma
        nova página e não registra uma conferência manual por você.
      </p>
    </>
  );
}
export function ShareStep({
  day,
  groupUrl,
  onChange,
  onGroupUrl,
}: {
  day: RoutineDay;
  groupUrl: string;
  onChange: (patch: Partial<RoutineDay>) => void;
  onGroupUrl: (url: string) => void;
}) {
  const [showSetup, setShowSetup] = useState(false);
  const link = shareableLink(day.offer.url);
  return (
    <>
      <p>
        Para o WhatsApp, basta copiar o mesmo link da pauta e colar no grupo. A
        mensagem completa é opcional. O envio continua manual.
      </p>
      <details
        open={showSetup}
        onToggle={(e) => setShowSetup(e.currentTarget.open)}
        className={s.details}
      >
        <summary>Organizar meu grupo do WhatsApp</summary>
        <ol>
          <li>
            Crie ou revise seu grupo de ofertas, por exemplo “BizuMiner — Casa
            prática”.
          </li>
          <li>Configure o envio de mensagens apenas pelos administradores.</li>
          <li>
            Explique o tema do grupo, o uso de links de afiliado e onde tirar
            dúvidas.
          </li>
          <li>Guarde abaixo o convite e coloque-o no perfil do Instagram.</li>
        </ol>
        <Field label="Convite do grupo">
          <input
            type="url"
            value={groupUrl}
            maxLength={2000}
            placeholder="https://chat.whatsapp.com/…"
            onChange={(e) => onGroupUrl(e.target.value)}
          />
        </Field>
      </details>
      <div className={s.example}>
        <span className={s.eyebrow}>LINK PRONTO PARA O WHATSAPP</span>
        <p className={s.preserveLines}>
          {link ||
            "Escolha um produto na etapa Oferta para trazer o link da pauta."}
        </p>
        <CopyButton label="Copiar link da pauta" text={link} disabled={!link} />
        <p className={s.hint}>
          É o link de compartilhamento que a pauta já oferece. Ele abre o
          destino público existente do produto; você não precisa montar outra
          página.
        </p>
      </div>
      <details className={s.details}>
        <summary>Mensagem com contexto (opcional)</summary>
        <div className={s.previewGrid}>
          {day.offer.imageUrl && (
            <div>
              <img
                className={s.productImage}
                src={day.offer.imageUrl}
                alt={day.offer.name || "Foto do produto"}
              />
              <a
                href={day.offer.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={s.textLink}
              >
                Abrir foto ↗
              </a>
            </div>
          )}
          <div>
            <span className={s.eyebrow}>MENSAGEM DO WHATSAPP</span>
            <pre className={s.message}>
              {day.offer.name
                ? offerMessage(day.offer)
                : "Selecione um produto para preparar a mensagem."}
            </pre>
            <CopyButton
              label="Copiar mensagem"
              text={offerMessage(day.offer)}
              disabled={!day.offer.name && !link}
            />
          </div>
        </div>
      </details>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={day.whatsappSent}
          onChange={(e) => onChange({ whatsappSent: e.target.checked })}
        />
        <span>Enviei a oferta manualmente no WhatsApp.</span>
      </label>
      {isStoryDay(day.date) && (
        <>
          <div className={s.example}>
            <span className={s.eyebrow}>STORIES DE HOJE · 1 A 3 TELAS</span>
            <ol>
              <li>Mostre a foto e o motivo da indicação.</li>
              <li>Informe o preço conferido, as condições e a data.</li>
              <li>
                Inclua o link do produto. Identifique o vínculo de afiliado.
              </li>
            </ol>
            <p className={s.hint}>
              O texto acima ajuda na montagem. Prepare a imagem no editor que
              usa e publique manualmente no Instagram.
            </p>
          </div>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={day.storyPublished}
              onChange={(e) => onChange({ storyPublished: e.target.checked })}
            />
            <span>Publiquei o Story com o link e as condições conferidas.</span>
          </label>
        </>
      )}
      <p className={s.endpoint}>
        Copiar o texto não registra um envio. Confirme a publicação depois de
        realizá-la.
      </p>
    </>
  );
}
export function ContentStep({
  day,
  workspace,
  tenantId,
  onWorkspace,
  library = false,
}: {
  day: RoutineDay;
  workspace: MarketingWorkspace;
  tenantId: string;
  onWorkspace: (
    change: (current: MarketingWorkspace) => MarketingWorkspace,
  ) => void;
  library?: boolean;
}) {
  const content = workspace.contents.find((c) => c.id === day.contentId);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [rights, setRights] = useState("owned"),
    [source, setSource] = useState("Foto ou arte própria");
  const publishing = !library && isFeedDay(day.date);
  function attach(id: string) {
    onWorkspace((current) => ({
      ...current,
      routine: {
        ...current.routine!,
        days: current.routine!.days.map((d) =>
          d.date === day.date ? { ...d, contentId: id } : d,
        ),
      },
    }));
  }
  function edit(change: Partial<MarketingContent>) {
    if (content)
      onWorkspace((current) => ({
        ...current,
        contents: current.contents.map((c) =>
          c.id === content.id ? { ...c, ...change } : c,
        ),
      }));
  }
  const suggested = suggestedRoutineContent(workspace);
  async function upload(files: FileList | null) {
    if (!files?.length || !content) return;
    if (!source.trim()) {
      setError("Informe a origem das imagens.");
      return;
    }
    if ((content.assets?.length ?? 0) + files.length > 12) {
      setError("Use até 12 imagens neste material.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        form.set("tenantId", tenantId);
        form.set("kind", "kit_asset");
        form.set("rightsStatus", rights);
        form.set("rightsSource", source);
        form.set("channels", "instagram");
        const response = await fetch("/api/admin/artifacts/upload", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(45000),
        });
        const asset = await response.json();
        if (!response.ok)
          throw new Error(
            "Não foi possível guardar a imagem. Confira o formato, a origem e seu acesso à conta.",
          );
        onWorkspace((current) => ({
          ...current,
          contents: current.contents.map((c) =>
            c.id === content.id
              ? {
                  ...c,
                  assets: [
                    ...(c.assets ?? []),
                    { id: asset.id, name: file.name.slice(0, 250) },
                  ],
                }
              : c,
          ),
        }));
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao adicionar imagem.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <p>
        {library
          ? "Revise os textos e mantenha as imagens finais junto da legenda."
          : publishing
            ? "Hoje é dia de publicar. Se o material ainda estiver incompleto, prepare o que falta ou registre a pendência abaixo."
            : "Hoje é dia de preparar o próximo conteúdo. As imagens finais e a legenda ficam juntas aqui."}
      </p>
      {!library && (
        <>
          <Field label="Material desta tarefa">
            <select
              value={day.contentId}
              onChange={(e) => attach(e.target.value)}
            >
              <option value="">Escolher um material salvo…</option>
              {workspace.contents
                .filter((c) => !c.archived || c.id === day.contentId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </Field>
          {suggested && suggested.id !== day.contentId && (
            <button
              type="button"
              className={s.button}
              onClick={() => attach(suggested.id)}
            >
              Usar roteiro sugerido
            </button>
          )}
          <p className={s.hint}>
            O feed segue uma sequência própria. Escolher uma oferta para o
            WhatsApp não obriga criar um post sobre ela.
          </p>
        </>
      )}
      {!content ? (
        <div className={s.example}>
          <h3>Roteiros já preenchidos</h3>
          <p>
            Escolha um dos roteiros de organização e iluminação. Cada um tem os
            textos das imagens, a legenda, a chamada e a direção de arte.
          </p>
          <p className={s.hint}>
            As artes finais podem ser adicionadas depois. Você pode continuar a
            rotina enquanto prepara o material.
          </p>
        </div>
      ) : (
        <>
          <div className={s.formGrid}>
            <Field label="Título do material">
              <input
                value={content.title}
                maxLength={250}
                onChange={(e) => edit({ title: e.target.value })}
              />
            </Field>
            <Field label="Formato">
              <select
                value={content.format}
                onChange={(e) =>
                  edit({ format: e.target.value as MarketingContent["format"] })
                }
              >
                <option>Carrossel</option>
                <option>Imagem</option>
                {!["Carrossel", "Imagem"].includes(content.format) && (
                  <option>{content.format}</option>
                )}
              </select>
            </Field>
          </div>
          {content.notes && (
            <details className={s.details}>
              <summary>Como montar as imagens · direção de arte</summary>
              <p className={s.preserveLines}>{content.notes}</p>
            </details>
          )}
          <Field
            label="Texto de cada imagem"
            hint="Separe as imagens com uma linha em branco. Revise as afirmações antes de preparar a arte."
          >
            <textarea
              className={s.largeTextarea}
              value={content.body}
              maxLength={30000}
              onChange={(e) => edit({ body: e.target.value })}
            />
          </Field>
          <div
            className={s.slidePreview}
            aria-label="Prévia do texto das imagens"
          >
            {content.body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .slice(0, 12)
              .map((text, index) => (
                <div className={s.slide} key={index}>
                  <small>Imagem {index + 1} · texto</small>
                  <span>{text}</span>
                  <small>BizuMiner</small>
                </div>
              ))}
          </div>
          <p className={s.hint}>
            Esta é a prévia do texto. As imagens finais aparecem abaixo depois
            de adicionadas.
          </p>
          <Field label="Legenda">
            <textarea
              value={content.caption}
              maxLength={10000}
              onChange={(e) => edit({ caption: e.target.value })}
            />
          </Field>
          <Field label="Chamada final">
            <input
              value={content.cta}
              maxLength={1000}
              onChange={(e) => edit({ cta: e.target.value })}
            />
          </Field>
          <CopyButton
            label="Copiar legenda"
            text={[content.caption, content.cta].filter(Boolean).join("\n\n")}
          />
          <details className={s.details} open={!content.assets?.length}>
            <summary>
              Adicionar imagens finais · {content.assets?.length ?? 0}{" "}
              adicionadas
            </summary>
            <div className={s.formGrid}>
              <Field label="Origem das imagens">
                <select
                  value={rights}
                  onChange={(e) => setRights(e.target.value)}
                >
                  <option value="owned">Criação própria</option>
                  <option value="licensed">Uso autorizado</option>
                </select>
              </Field>
              <Field label="Referência da origem">
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ex.: arte própria ou referência da autorização"
                />
              </Field>
            </div>
            <Field
              label={
                uploading
                  ? "Guardando imagens…"
                  : "Escolher imagens PNG, JPEG ou WebP"
              }
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </Field>
          </details>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          {!!content.assets?.length && (
            <div className={s.assets}>
              {content.assets.map((asset, index) => {
                const url =
                  "/api/admin/artifacts/" +
                  encodeURIComponent(asset.id) +
                  "?conta=" +
                  encodeURIComponent(tenantId);
                return (
                  <div key={asset.id}>
                    <img
                      src={url + "&preview=1"}
                      alt={"Imagem " + (index + 1) + " — " + asset.name}
                    />
                    <span>
                      {index + 1}. {asset.name}
                    </span>
                    <div className={s.inline}>
                      <a href={url} className={s.textLink}>
                        Baixar
                      </a>
                      <button
                        type="button"
                        className={s.linkButton}
                        onClick={() =>
                          edit({
                            assets: content.assets!.filter(
                              (a) => a.id !== asset.id,
                            ),
                          })
                        }
                      >
                        Retirar do material
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {publishing && (
            <div className={s.example}>
              <h3>Depois de publicar no Instagram</h3>
              <p>
                Baixe as imagens e publique junto com a legenda. Se quiser,
                guarde a data e o link real abaixo. Esses campos não impedem
                avançar.
              </p>
              <div className={s.formGrid}>
                <Field label="Data da publicação">
                  <input
                    type="date"
                    value={
                      content.publications.find(
                        (p) => p.channel === "Instagram",
                      )?.publishedDate || ""
                    }
                    onChange={(e) => {
                      const p = content.publications.find(
                        (p) => p.channel === "Instagram",
                      );
                      edit({
                        publications: p
                          ? content.publications.map((item) =>
                              item.id === p.id
                                ? { ...item, publishedDate: e.target.value }
                                : item,
                            )
                          : [
                              ...content.publications,
                              {
                                id: crypto.randomUUID(),
                                channel: "Instagram",
                                plannedDate: day.date,
                                publishedDate: e.target.value,
                                url: "",
                              },
                            ],
                      });
                    }}
                  />
                </Field>
                <Field label="Link da publicação no Instagram">
                  <input
                    type="url"
                    placeholder="https://www.instagram.com/p/…"
                    value={
                      content.publications.find(
                        (p) => p.channel === "Instagram",
                      )?.url || ""
                    }
                    onChange={(e) => {
                      const p = content.publications.find(
                        (p) => p.channel === "Instagram",
                      );
                      edit({
                        publications: p
                          ? content.publications.map((item) =>
                              item.id === p.id
                                ? { ...item, url: e.target.value }
                                : item,
                            )
                          : [
                              ...content.publications,
                              {
                                id: crypto.randomUUID(),
                                channel: "Instagram",
                                plannedDate: day.date,
                                publishedDate: "",
                                url: e.target.value,
                              },
                            ],
                      });
                    }}
                  />
                </Field>
              </div>
            </div>
          )}
          {library && (
            <p className={s.endpoint}>
              {contentIssue(content, publishing) ||
                "Material completo para concluir esta tarefa."}
            </p>
          )}
        </>
      )}
    </>
  );
}
export function DistributionStep({
  day,
  groupUrl,
  onChange,
}: {
  day: RoutineDay;
  groupUrl: string;
  onChange: (patch: Partial<RoutineDay>) => void;
}) {
  const invitation =
    "A gente está selecionando achados para organizar e iluminar a casa. Quer acompanhar as ofertas que conferimos?\n\n" +
    (groupUrl || "Adicione o convite do grupo na etapa WhatsApp.");
  return (
    <>
      <p>
        Responda as dúvidas recebidas. Faça uma ação adequada ao público:
        convite no Status, indicação solicitada ou proposta individual de
        colaboração.
      </p>
      <div className={s.example}>
        <span className={s.eyebrow}>CONVITE PARA O STATUS</span>
        <pre className={s.message}>{invitation}</pre>
        <CopyButton text={invitation} disabled={!groupUrl} />
      </div>
      <Field
        label="O que fiz nesta etapa?"
        hint="Ex.: publiquei o convite no Status e respondi uma dúvida sobre o tamanho."
      >
        <textarea
          value={day.distribution}
          maxLength={4000}
          onChange={(e) => onChange({ distribution: e.target.value })}
        />
      </Field>
      <p className={s.endpoint}>
        Se não houver atendimento, registre a divulgação feita. Se algo impedir
        a tarefa, use “Deixar para depois”.
      </p>
    </>
  );
}
export function CloseStep({
  day,
  onChange,
}: {
  day: RoutineDay;
  onChange: (patch: Partial<RoutineDay>) => void;
}) {
  return (
    <>
      <p>Deixe um registro curto para retomar sem reconstruir o dia inteiro.</p>
      <Field label="O que consegui fazer hoje?">
        <textarea
          value={day.summary}
          maxLength={4000}
          placeholder="Ex.: enviei a oferta; faltam as imagens do carrossel."
          onChange={(e) => onChange({ summary: e.target.value })}
        />
      </Field>
      <Field label="Por onde começo no próximo dia?">
        <textarea
          value={day.tomorrow}
          maxLength={2000}
          placeholder="Ex.: finalizar as imagens e conferir a próxima oferta."
          onChange={(e) => onChange({ tomorrow: e.target.value })}
        />
      </Field>
      <p className={s.endpoint}>
        Na revisão de terça, confira pedidos e comissões nos relatórios. Um
        clique ou envio não comprova uma venda.
      </p>
      <a className={s.button} href="/admin/financeiro">
        Consultar resultados ↗
      </a>
    </>
  );
}
