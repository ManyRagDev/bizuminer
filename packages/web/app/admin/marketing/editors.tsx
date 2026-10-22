"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHANNELS,
  FORMATS,
  PILLARS,
  STAGE_LABELS,
  saoPauloToday,
  type MarketingContent,
  type MarketingIdea,
} from "../../../lib/marketing-contract";
import { exportData, Icon } from "./ui";
import s from "./marketing.module.css";

function Modal({
  title,
  subtitle,
  dirty,
  saving,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function close() {
    if (
      !saving &&
      (!dirty ||
        window.confirm("Há alterações não salvas. Deseja descartá-las?"))
    )
      onClose();
  }
  return (
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className={s.dialogHeader}>
        <div>
          <span className={s.eyebrow}>{subtitle}</span>
          <h2 id="editor-title">{title}</h2>
        </div>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Fechar editor"
          disabled={saving}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
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

export function ContentEditor({
  content,
  saving,
  error,
  onSave,
  onClose,
  onDirty,
  initialTab = "text",
}: {
  content: MarketingContent;
  saving: boolean;
  error: string;
  onSave: (value: MarketingContent) => Promise<void>;
  onClose: () => void;
  onDirty: (value: boolean) => void;
  initialTab?: "text" | "publication";
}) {
  const [draft, setDraft] = useState(content);
  const [tab, setTab] = useState<string>(initialTab);
  const [copied, setCopied] = useState("");
  const dirty = JSON.stringify(content) !== JSON.stringify(draft);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  function update<K extends keyof MarketingContent>(
    key: K,
    value: MarketingContent[K],
  ) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  function publication(
    index: number,
    key: "channel" | "plannedDate" | "publishedDate" | "url",
    value: string,
  ) {
    setDraft((old) => ({
      ...old,
      publications: old.publications.map((p, i) =>
        i === index ? { ...p, [key]: value } : p,
      ),
    }));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        [draft.caption, draft.cta].filter(Boolean).join("\n\n"),
      );
      setCopied("Legenda copiada!");
    } catch {
      setCopied(
        "Não foi possível copiar. Selecione o texto da legenda e copie manualmente.",
      );
    }
  }
  return (
    <Modal
      title={content.title || "Vamos criar alguma coisa boa."}
      subtitle="EDITOR DE CONTEÚDO"
      dirty={dirty}
      saving={saving}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft);
        }}
      >
        <fieldset disabled={saving} className={s.editorFieldset}>
          <div className={s.editorLayout}>
            <div className={s.editorMain}>
              <Field
                label="Título interno *"
                hint="Só para sua organização. Não precisa ser a headline do post."
              >
                <input
                  required
                  autoFocus
                  value={draft.title}
                  maxLength={250}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Ex.: Como começar a usar o BizuMiner"
                />
              </Field>
              <div className={s.editorSelects}>
                <Field label="Formato">
                  <select
                    value={draft.format}
                    onChange={(e) =>
                      update(
                        "format",
                        e.target.value as MarketingContent["format"],
                      )
                    }
                  >
                    {FORMATS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Pilar">
                  <select
                    value={draft.pillar}
                    onChange={(e) =>
                      update(
                        "pillar",
                        e.target.value as MarketingContent["pillar"],
                      )
                    }
                  >
                    {PILLARS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Etapa de produção">
                  <select
                    value={draft.stage}
                    onChange={(e) =>
                      update(
                        "stage",
                        e.target.value as MarketingContent["stage"],
                      )
                    }
                  >
                    {(["draft", "production", "ready"] as const).map((v) => (
                      <option key={v} value={v}>
                        {STAGE_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Semana relativa">
                  <input
                    type="number"
                    min={0}
                    max={52}
                    value={draft.week}
                    onChange={(e) => update("week", Number(e.target.value))}
                  />
                </Field>
              </div>
              <div
                className={s.editorTabs}
                role="tablist"
                aria-label="Campos do conteúdo"
              >
                {[
                  { id: "text", label: "Texto & headline" },
                  { id: "publication", label: "Publicação" },
                  { id: "notes", label: "Notas & referências" },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    tabIndex={tab === v.id ? 0 : -1}
                    id={`tab-${v.id}`}
                    aria-selected={tab === v.id}
                    aria-controls={`panel-${v.id}`}
                    onClick={() => setTab(v.id)}
                    onKeyDown={(event) => {
                      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
                      if (!keys.includes(event.key)) return;
                      event.preventDefault();
                      const tabs = Array.from(
                        event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                          '[role="tab"]',
                        ),
                      );
                      const current = tabs.indexOf(event.currentTarget);
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : (current +
                                (event.key === "ArrowRight" ? 1 : -1) +
                                tabs.length) %
                              tabs.length;
                      tabs[next].click();
                      tabs[next].focus();
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
                className={s.editorPanel}
              >
                {tab === "text" && (
                  <>
                    <Field
                      label="Headline principal"
                      hint="A primeira frase da arte. Clara, curta e fácil de entender."
                    >
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={draft.headline}
                        onChange={(e) => update("headline", e.target.value)}
                        placeholder="O que você quer que a pessoa perceba?"
                      />
                    </Field>
                    <Field label="Outras headlines para testar">
                      <textarea
                        rows={2}
                        maxLength={5000}
                        value={draft.alternatives}
                        onChange={(e) => update("alternatives", e.target.value)}
                        placeholder="Uma alternativa por linha…"
                      />
                    </Field>
                    <Field
                      label={
                        draft.format === "Carrossel"
                          ? "Texto dos slides / roteiro"
                          : draft.format === "Vídeo"
                            ? "Roteiro / gravação de tela"
                            : "Texto da arte / desenvolvimento"
                      }
                      hint="No carrossel, separe os slides por uma linha em branco. Vídeo é opcional."
                    >
                      <textarea
                        rows={8}
                        maxLength={30000}
                        value={draft.body}
                        onChange={(e) => update("body", e.target.value)}
                        placeholder={
                          "Slide 1 — Uma frase que chama atenção\n\nSlide 2 — O contexto\n\nSlide 3 — Como o BizuMiner ajuda"
                        }
                      />
                    </Field>
                    <Field label="Legenda">
                      <textarea
                        rows={5}
                        maxLength={10000}
                        value={draft.caption}
                        onChange={(e) => update("caption", e.target.value)}
                        placeholder="A conversa que acompanha o seu post…"
                      />
                    </Field>
                    <Field label="Chamada para ação (CTA)">
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={draft.cta}
                        onChange={(e) => update("cta", e.target.value)}
                        placeholder="Ex.: Conheça o BizuMiner. Link na bio."
                      />
                    </Field>
                    <div className={s.copyRow}>
                      <button
                        type="button"
                        className={s.textButton}
                        onClick={() => void copy()}
                      >
                        Copiar legenda + CTA ↗
                      </button>
                      <small role="status">{copied}</small>
                    </div>
                  </>
                )}
                {tab === "publication" && (
                  <>
                    <div className={s.editorTip}>
                      <Icon name="calendar" />
                      <p>
                        <b>Planejar não é publicar.</b> Depois de postar na rede
                        social, registre a data real e o link. Tudo é salvo ao
                        clicar em “Salvar conteúdo”.
                      </p>
                    </div>
                    {draft.publications.map((p, index) => (
                      <section key={p.id} className={s.publication}>
                        <div className={s.publicationHeading}>
                          <strong>Canal {index + 1}</strong>
                          <span
                            className={
                              p.publishedDate ? s.publishedPill : s.pendingPill
                            }
                          >
                            {p.publishedDate ? "✓ Publicado" : "Pendente"}
                          </span>
                        </div>
                        <div className={s.publicationFields}>
                          <Field label="Rede / canal">
                            <select
                              value={p.channel}
                              onChange={(e) =>
                                publication(index, "channel", e.target.value)
                              }
                            >
                              {CHANNELS.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Data planejada">
                            <input
                              type="date"
                              value={p.plannedDate}
                              onInput={(e) =>
                                publication(
                                  index,
                                  "plannedDate",
                                  e.currentTarget.value,
                                )
                              }
                              onChange={(e) =>
                                publication(
                                  index,
                                  "plannedDate",
                                  e.target.value,
                                )
                              }
                            />
                          </Field>
                          <Field label="Publicado em">
                            <input
                              type="date"
                              max={saoPauloToday()}
                              value={p.publishedDate}
                              onInput={(e) =>
                                publication(
                                  index,
                                  "publishedDate",
                                  e.currentTarget.value,
                                )
                              }
                              onChange={(e) =>
                                publication(
                                  index,
                                  "publishedDate",
                                  e.target.value,
                                )
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Link da publicação">
                          <input
                            type="url"
                            maxLength={2000}
                            value={p.url}
                            onChange={(e) =>
                              publication(index, "url", e.target.value)
                            }
                            placeholder="https://www.instagram.com/p/…"
                          />
                        </Field>
                        <div className={s.publicationActions}>
                          <button
                            type="button"
                            className={s.textButton}
                            onClick={() =>
                              publication(
                                index,
                                "publishedDate",
                                p.publishedDate ? "" : saoPauloToday(),
                              )
                            }
                          >
                            {p.publishedDate
                              ? "Desfazer registro de publicação"
                              : "✓ Marcar como publicado hoje"}
                          </button>
                          {draft.publications.length > 1 &&
                            !p.publishedDate && (
                              <button
                                type="button"
                                className={s.textButton}
                                onClick={() =>
                                  update(
                                    "publications",
                                    draft.publications.filter(
                                      (item) => item.id !== p.id,
                                    ),
                                  )
                                }
                              >
                                Remover canal
                              </button>
                            )}
                        </div>
                      </section>
                    ))}
                    <button
                      type="button"
                      className={s.secondary}
                      disabled={draft.publications.length >= 15}
                      onClick={() =>
                        update("publications", [
                          ...draft.publications,
                          {
                            id: crypto.randomUUID(),
                            channel: "Instagram",
                            plannedDate: "",
                            publishedDate: "",
                            url: "",
                          },
                        ])
                      }
                    >
                      <Icon name="plus" size={17} />
                      Adicionar canal
                    </button>
                  </>
                )}
                {tab === "notes" && (
                  <>
                    <Field
                      label="Por que publicar? / Notas de produção"
                      hint="Objetivo, direção da arte, aprendizados e o que ainda precisa conferir."
                    >
                      <textarea
                        rows={7}
                        maxLength={15000}
                        value={draft.notes}
                        onChange={(e) => update("notes", e.target.value)}
                        placeholder="Qual problema esse conteúdo ajuda a resolver?"
                      />
                    </Field>
                    <Field label="Referências e links">
                      <textarea
                        rows={5}
                        maxLength={10000}
                        value={draft.references}
                        onChange={(e) => update("references", e.target.value)}
                        placeholder="Links de artes, prints do BizuMiner e referências…"
                      />
                    </Field>
                    <label className={s.archiveCheckbox}>
                      <input
                        type="checkbox"
                        checked={draft.archived}
                        onChange={(e) => update("archived", e.target.checked)}
                      />
                      <span>
                        <b>Arquivar este conteúdo</b>
                        <small>
                          Ele sai do quadro e do calendário. Você pode
                          restaurá-lo pelo filtro “Arquivados”.
                        </small>
                      </span>
                    </label>
                  </>
                )}
              </div>
            </div>
            <aside className={s.editorAside}>
              <span className={s.eyebrow}>PRÉVIA DE TEXTO</span>
              <div className={s.coverPreview}>
                <span>
                  Bizu<span>Miner</span>
                </span>
                <strong>
                  {draft.headline || "Sua próxima boa headline mora aqui."}
                </strong>
                <small>
                  {draft.format} · {draft.pillar}
                </small>
              </div>
              <p>
                Prévia ilustrativa da headline, não uma arte final exportável.
              </p>
              <div className={s.editorReminder}>
                <Icon name="spark" />
                <h3>A estrela é o BizuMiner.</h3>
                <p>
                  Mostre a marca e a experiência do site. Sem comprar produtos,
                  unboxing ou promessas de economia que não podemos comprovar.
                </p>
              </div>
              <button
                type="button"
                className={s.textButton}
                onClick={() => exportData(draft, "rascunho-conteudo")}
              >
                Exportar este rascunho <Icon name="download" size={15} />
              </button>
            </aside>
          </div>
        </fieldset>
        <div className={s.dialogFooter}>
          {error && (
            <p role="alert" className={s.modalError}>
              {error}
            </p>
          )}
          <span>
            {dirty
              ? "Alterações ainda não salvas"
              : "Edite no seu ritmo. Salve quando terminar."}
          </span>
          <div>
            <button
              type="button"
              className={s.secondary}
              disabled={saving}
              onClick={() => exportData(draft, "rascunho-conteudo")}
            >
              Baixar cópia
            </button>
            <button type="submit" className={s.primary} disabled={saving}>
              {saving ? "Salvando…" : "Salvar conteúdo"}
              <Icon name="check" size={18} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function IdeaEditor({
  idea,
  saving,
  error,
  onSave,
  onClose,
  onDirty,
  onOpenContent,
}: {
  idea: MarketingIdea;
  saving: boolean;
  error: string;
  onSave: (value: MarketingIdea, convert?: boolean) => Promise<void>;
  onClose: () => void;
  onDirty: (value: boolean) => void;
  onOpenContent: (id: string) => void;
}) {
  const [draft, setDraft] = useState(idea);
  const [convert, setConvert] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(idea) || convert;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  function update<K extends keyof MarketingIdea>(
    key: K,
    value: MarketingIdea[K],
  ) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  return (
    <Modal
      title="Toda ideia merece um lugar."
      subtitle="BRAINSTORM / IDEIA"
      dirty={dirty}
      saving={saving}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft, convert);
        }}
      >
        <fieldset disabled={saving} className={s.ideaEditor}>
          <Field label="Nome da ideia *">
            <input
              autoFocus
              required
              maxLength={250}
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="E se a gente falasse sobre…"
            />
          </Field>
          <Field label="Desenvolva sem se preocupar">
            <textarea
              rows={7}
              maxLength={15000}
              value={draft.text}
              onChange={(e) => update("text", e.target.value)}
              placeholder="Frases soltas, dúvidas, um começo de legenda. Vale tudo."
            />
          </Field>
          <Field label="Etiquetas">
            <input
              maxLength={500}
              value={draft.tags}
              onChange={(e) => update("tags", e.target.value)}
              placeholder="Ex.: iniciantes, tutorial, headline"
            />
          </Field>
          <div className={s.colorPicker}>
            <span>Cor do cartão</span>
            {(["lemon", "lavender", "mint", "peach"] as const).map(
              (color, i) => (
                <button
                  type="button"
                  key={color}
                  className={s[color]}
                  aria-label={["Amarelo", "Lilás", "Verde", "Pêssego"][i]}
                  aria-pressed={draft.color === color}
                  onClick={() => update("color", color)}
                >
                  {draft.color === color && <Icon name="check" size={17} />}
                </button>
              ),
            )}
          </div>
          <label className={s.archiveCheckbox}>
            <input
              type="checkbox"
              checked={draft.archived}
              onChange={(e) => update("archived", e.target.checked)}
            />
            Arquivar ideia (pode restaurar depois)
          </label>
          {draft.convertedTo ? (
            <button
              type="button"
              className={s.secondary}
              disabled={dirty}
              onClick={() => onOpenContent(draft.convertedTo)}
            >
              Abrir conteúdo criado <Icon name="arrow" size={17} />
            </button>
          ) : (
            <label className={s.convertIdea}>
              <input
                type="checkbox"
                checked={convert}
                onChange={(e) => setConvert(e.target.checked)}
              />
              <span>
                <b>Transformar em rascunho de conteúdo</b>
                <small>
                  A ideia permanece no mural e ganha um cartão no quadro de
                  conteúdos.
                </small>
              </span>
            </label>
          )}
        </fieldset>
        <div className={s.dialogFooter}>
          {error && (
            <p role="alert" className={s.modalError}>
              {error}
            </p>
          )}
          <span>
            {dirty || convert
              ? "Salve para guardar suas alterações."
              : "Uma frase já é um começo."}
          </span>
          <div>
            <button
              type="button"
              className={s.secondary}
              onClick={() => exportData(draft, "rascunho-ideia")}
            >
              Baixar cópia
            </button>
            <button type="submit" className={s.primary} disabled={saving}>
              {saving
                ? "Salvando…"
                : convert
                  ? "Salvar e criar conteúdo"
                  : "Salvar ideia"}
              <Icon name="check" size={18} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
