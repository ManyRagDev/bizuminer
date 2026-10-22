"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FORMATS,
  PILLARS,
  STAGES,
  STAGE_LABELS,
  contentStage,
  emptyContent,
  saoPauloToday,
  validateWorkspace,
  type MarketingContent,
  type MarketingIdea,
  type MarketingSnapshot,
  type MarketingWorkspace as Workspace,
  type Stage,
} from "../../../lib/marketing-contract";
import { ContentEditor, IdeaEditor } from "./editors";
import { Icon, exportData } from "./ui";
import {
  moveMarketingContent,
  rescheduleMarketingPublication,
  type MarketingDragItem,
  type MarketingDropTarget,
} from "../../../lib/marketing-moves";
import {
  DraggableMarketingItem,
  MarketingDragProvider,
  MarketingDropZone,
} from "./drag-drop";
import { MarketingMoveDialog } from "./move-dialog";
import s from "./marketing.module.css";

type View = "overview" | "contents" | "calendar" | "ideas";
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Visão geral", icon: "grid" },
  { id: "contents", label: "Conteúdos", icon: "layers" },
  { id: "calendar", label: "Calendário", icon: "calendar" },
  { id: "ideas", label: "Brainstorm", icon: "spark" },
];
const uid = () => crypto.randomUUID();
const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
function ContentCard({
  content,
  onClick,
}: {
  content: MarketingContent;
  onClick: () => void;
}) {
  const stage = contentStage(content);
  const date =
    content.publications.find((p) => p.publishedDate)?.publishedDate ||
    content.publications.find((p) => p.plannedDate)?.plannedDate;
  return (
    <DraggableMarketingItem
      item={{ kind: "content", contentId: content.id, label: content.title }}
      disabled={content.archived || stage === "published"}
    >
      <button type="button" className={s.contentCard} onClick={onClick}>
        <span className={s.cardMeta}>
          <span className={s.format}>{content.format}</span>
          <span>{content.week ? `S${content.week}` : "Livre"}</span>
        </span>
        <strong>{content.title}</strong>
        <p>{content.headline || "Uma boa ideia começa por uma frase."}</p>
        <span className={s.cardBottom}>
          <span className={s.pillar}>{content.pillar}</span>
          <span>{date ? dayLabel(date) : "Sem data"}</span>
        </span>
        <span className={s.cardChannels}>
          {[...new Set(content.publications.map((p) => p.channel))].join(
            " · ",
          ) || "Sem canal"}
          {stage === "published" && " · ✓"}
        </span>
      </button>
    </DraggableMarketingItem>
  );
}

export default function MarketingWorkspace() {
  const [snapshot, setSnapshot] = useState<MarketingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const [pillar, setPillar] = useState("");
  const [week, setWeek] = useState("");
  const [archives, setArchives] = useState(false);
  const [editing, setEditing] = useState<MarketingContent | null>(null);
  const [idea, setIdea] = useState<MarketingIdea | null>(null);
  const [scratchpad, setScratchpad] = useState("");
  const [month, setMonth] = useState(() => saoPauloToday().slice(0, 7));
  const [editorDirty, setEditorDirty] = useState(false);
  const [publicationEditor, setPublicationEditor] = useState(false);
  const [moving, setMoving] = useState<MarketingDragItem | null>(null);
  const workspace = snapshot?.workspace;
  const dirty =
    editorDirty || (workspace != null && scratchpad !== workspace.scratchpad);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/marketing", {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível abrir o espaço.");
      setSnapshot(result);
      setScratchpad(result.workspace.scratchpad);
    } catch (reason) {
      if (!signal?.aborted)
        setError(
          reason instanceof Error ? reason.message : "Falha ao carregar.",
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function save(next: Workspace): Promise<boolean> {
    if (!snapshot || busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const validated = validateWorkspace({ ...next, scratchpad });
      const response = await fetch("/api/admin/marketing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: snapshot.revision,
          workspace: validated,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      setSnapshot(result);
      setNotice("Tudo salvo no seu espaço privado.");
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao salvar. Tente novamente.",
      );
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function newContent(date = "") {
    const draft = emptyContent(uid(), uid());
    draft.publications[0].plannedDate = date;
    setEditorDirty(false);
    setEditing(draft);
  }
  function newIdea() {
    setEditorDirty(false);
    setIdea({
      id: uid(),
      title: "",
      text: "",
      tags: "",
      color: "lemon",
      convertedTo: "",
      archived: false,
    });
  }
  async function saveContent(content: MarketingContent) {
    if (!workspace) return;
    const exists = workspace.contents.some((c) => c.id === content.id);
    if (
      await save({
        ...workspace,
        contents: exists
          ? workspace.contents.map((c) => (c.id === content.id ? content : c))
          : [...workspace.contents, content],
      })
    ) {
      setEditing(null);
      setPublicationEditor(false);
      setEditorDirty(false);
    }
  }
  async function moveItem(
    item: MarketingDragItem,
    target: MarketingDropTarget,
  ): Promise<boolean> {
    if (!workspace || busy.current) return false;
    const content = workspace.contents.find((c) => c.id === item.contentId);
    if (!content || content.archived) return false;
    if (
      item.kind === "content" &&
      target.kind === "stage" &&
      target.stage === "published"
    ) {
      setMoving(null);
      setPublicationEditor(true);
      setEditorDirty(false);
      setEditing(content);
      setNotice(
        "Confirme o canal e a data real na aba Publicação. Nenhum registro foi alterado.",
      );
      return true;
    }
    try {
      const next =
        item.kind === "content" && target.kind === "stage"
          ? moveMarketingContent(
              workspace,
              item.contentId,
              target.stage,
              target.beforeId,
            )
          : item.kind === "publication" && target.kind === "date"
            ? rescheduleMarketingPublication(
                workspace,
                item.contentId,
                item.publicationId,
                target.date,
              )
            : workspace;
      if (next === workspace) return true;
      if (!(await save(next))) {
        setNotice("Movimento não salvo. A posição anterior foi mantida.");
        return false;
      }
      setNotice(
        target.kind === "stage"
          ? `Conteúdo movido para ${STAGE_LABELS[target.stage]}.`
          : target.date
            ? `Data planejada alterada para ${dayLabel(target.date)}.`
            : "Publicação devolvida à lista sem data.",
      );
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível mover.",
      );
      return false;
    }
  }
  async function saveIdea(value: MarketingIdea, convert = false) {
    if (!workspace) return;
    let contents = workspace.contents;
    let next = value;
    if (convert && !value.convertedTo) {
      const draft = {
        ...emptyContent(uid(), uid()),
        title: value.title,
        headline: value.title,
        body: value.text,
        notes: value.tags ? `Ideia original · ${value.tags}` : "",
      };
      contents = [...contents, draft];
      next = { ...value, convertedTo: draft.id };
    }
    const ideas = workspace.ideas.some((i) => i.id === next.id)
      ? workspace.ideas.map((i) => (i.id === next.id ? next : i))
      : [...workspace.ideas, next];
    if (await save({ ...workspace, contents, ideas })) {
      setIdea(null);
      setEditorDirty(false);
      if (convert) {
        setView("contents");
        setNotice("Ideia transformada em rascunho. Vamos lapidar?");
      }
    }
  }
  const active = workspace?.contents.filter((c) => !c.archived) || [];
  const visible =
    workspace?.contents.filter(
      (c) =>
        c.archived === archives &&
        (!format || c.format === format) &&
        (!pillar || c.pillar === pillar) &&
        (!week || c.week === Number(week)) &&
        `${c.title} ${c.headline} ${c.caption} ${c.body}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    ) || [];
  const ideas =
    workspace?.ideas.filter(
      (i) =>
        i.archived === archives &&
        `${i.title} ${i.text} ${i.tags}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    ) || [];
  const counts = Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      active.filter((c) => contentStage(c) === stage).length,
    ]),
  ) as Record<Stage, number>;
  const planned = active
    .flatMap((content) =>
      content.publications
        .filter((p) => !p.publishedDate && p.plannedDate)
        .map((p) => ({ content, p })),
    )
    .sort((a, b) => a.p.plannedDate.localeCompare(b.p.plannedDate));

  return (
    <MarketingDragProvider
      disabled={saving || !!editing || !!idea || !!moving}
      onDrop={(item, target) => {
        void moveItem(item, target);
      }}
      onChoose={(item) => {
        setError("");
        setMoving(item);
      }}
    >
      <div className={s.workspace}>
        <div className={s.topline}>
          <div>
            <span className={s.eyebrow}>BIZUMINER / ESTÚDIO DE MARKETING</span>
            <h1>
              Boas ideias. Fora do papel<span>.</span>
            </h1>
            <p>Um lugar para pensar, criar e colocar sua marca no mundo.</p>
          </div>
          <div className={s.saveState}>
            <span className={saving ? s.pulse : s.savedDot} />
            {saving
              ? "Salvando…"
              : dirty
                ? "Alterações não salvas"
                : snapshot
                  ? "Seu espaço está salvo"
                  : "Seu espaço criativo"}
            {snapshot && (
              <small>
                Último salvamento ·{" "}
                {new Date(snapshot.updatedAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })}
              </small>
            )}
          </div>
        </div>
        <div className={s.navigation}>
          <nav aria-label="Seções de marketing">
            {VIEWS.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                className={view === item.id ? s.activeTab : ""}
                onClick={() => {
                  setView(item.id);
                  setArchives(false);
                  setSearch("");
                }}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
                {item.id === "ideas" && workspace && (
                  <span className={s.navCount}>
                    {
                      workspace.ideas.filter(
                        (i) => !i.archived && !i.convertedTo,
                      ).length
                    }
                  </span>
                )}
              </button>
            ))}
          </nav>
          {workspace && (
            <button
              type="button"
              className={s.exportButton}
              title="Baixar uma cópia do seu espaço em JSON"
              onClick={() =>
                exportData({
                  ...snapshot,
                  workspace: { ...workspace, scratchpad },
                })
              }
            >
              <Icon name="download" size={17} />
              <span>Exportar</span>
            </button>
          )}
        </div>
        {error && (
          <div role="alert" className={s.error}>
            <strong>Não foi possível concluir.</strong> {error}
            {!workspace && (
              <button type="button" onClick={() => void load()}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className={s.toast} role="status">
            <Icon name="check" size={18} />
            {notice}
          </div>
        )}
        {loading && !workspace && (
          <div className={s.loading}>
            <span className={s.loader} />
            <h2>Abrindo seu espaço criativo…</h2>
            <p>Preparando seus conteúdos e ideias.</p>
          </div>
        )}
        {workspace && (
          <>
            {view === "overview" && (
              <>
                <section className={s.hero}>
                  <div className={s.heroCopy}>
                    <span className={s.heroLabel}>
                      <span /> DA IDEIA À PUBLICAÇÃO
                    </span>
                    <h2>
                      Seu próximo
                      <br />
                      grande <em>bizu</em>
                      <br />
                      começa aqui.
                    </h2>
                    <p>
                      Conte a história do BizuMiner, mostre como ele ajuda e dê
                      às pessoas um motivo para voltar.
                    </p>
                    <div className={s.actions}>
                      <button
                        className={s.primary}
                        type="button"
                        onClick={() => newContent()}
                      >
                        <Icon name="plus" />
                        Criar conteúdo
                      </button>
                      <button
                        className={s.heroSecondary}
                        type="button"
                        onClick={newIdea}
                      >
                        Anotar uma ideia <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  </div>
                  <div className={s.heroArt} aria-hidden="true">
                    <span className={s.orbit} />
                    <div className={s.artNote}>
                      <span>LEMBRETE CRIATIVO</span>
                      <strong>
                        O produto
                        <br />é o <em>BizuMiner.</em>
                      </strong>
                      <p>
                        A história que vamos contar
                        <br />é a da sua marca.
                      </p>
                      <span className={s.artLine} />
                    </div>
                    <div className={s.artSpark}>✳</div>
                    <div className={s.artBadge}>
                      <Icon name="spark" size={24} />
                      <span>
                        Ideias boas
                        <br />
                        <b>merecem sair.</b>
                      </span>
                    </div>
                    <span className={s.artStar}>✦</span>
                  </div>
                </section>
                <div className={s.stats}>
                  {STAGES.map((stage, i) => (
                    <button
                      type="button"
                      key={stage}
                      onClick={() => {
                        setView("contents");
                        setArchives(false);
                      }}
                    >
                      <span className={`${s.statIcon} ${s[`tone${i}`]}`}>
                        <Icon
                          name={
                            i === 3
                              ? "check"
                              : i === 2
                                ? "spark"
                                : i === 1
                                  ? "layers"
                                  : "grid"
                          }
                        />
                      </span>
                      <span>
                        <small>{STAGE_LABELS[stage]}</small>
                        <strong>
                          {counts[stage].toString().padStart(2, "0")}
                        </strong>
                      </span>
                      <span className={s.statArrow}>↗</span>
                    </button>
                  ))}
                </div>
                <div className={s.overviewGrid}>
                  <section className={s.section}>
                    <div className={s.sectionHeading}>
                      <div>
                        <span className={s.eyebrow}>PRÓXIMO PASSO</span>
                        <h2>
                          {planned.length
                            ? "Na sua agenda"
                            : "Vamos colocar em movimento?"}
                        </h2>
                      </div>
                      <button
                        type="button"
                        className={s.textButton}
                        onClick={() => setView("contents")}
                      >
                        Ver conteúdos <Icon name="arrow" size={17} />
                      </button>
                    </div>
                    <p className={s.muted}>
                      {planned.length
                        ? "Datas escolhidas por você. A publicação nas redes continua manual."
                        : "Escolha um rascunho, ajuste o texto e defina quando publicar."}
                    </p>
                    <div className={s.nextList}>
                      {(planned.length
                        ? planned.slice(0, 3).map(({ content, p }) => ({
                            content,
                            label: `${dayLabel(p.plannedDate)} · ${p.channel}`,
                          }))
                        : active
                            .filter((c) => contentStage(c) !== "published")
                            .slice(0, 3)
                            .map((content) => ({
                              content,
                              label: content.week
                                ? `Semana ${content.week} · ${content.format}`
                                : content.format,
                            }))
                      ).map(({ content, label }, i) => (
                        <button
                          key={`${content.id}-${i}`}
                          type="button"
                          onClick={() => setEditing(content)}
                        >
                          <span className={s.nextNumber}>0{i + 1}</span>
                          <span>
                            <small>{label}</small>
                            <strong>{content.title}</strong>
                          </span>
                          <Icon name="arrow" size={18} />
                        </button>
                      ))}
                      {!active.length && (
                        <p className={s.muted}>
                          Seu primeiro conteúdo pode começar com uma ideia
                          simples.
                        </p>
                      )}
                    </div>
                  </section>
                  <aside className={s.direction}>
                    <div className={s.directionIcon}>
                      <Icon name="spark" size={25} />
                    </div>
                    <span className={s.eyebrow}>NOSSO NORTE</span>
                    <h2>
                      Divulgar a marca.
                      <br />
                      Sem complicar.
                    </h2>
                    <p>
                      Fale sobre o BizuMiner: o que é, como usar e como ele pode
                      ajudar na pesquisa de uma compra.
                    </p>
                    <div className={s.directionTags}>
                      <span>Carrosséis</span>
                      <span>Imagens</span>
                      <span>Vídeos opcionais</span>
                    </div>
                    <button
                      type="button"
                      className={s.textButton}
                      onClick={() => setView("ideas")}
                    >
                      Soltar as ideias <Icon name="arrow" size={17} />
                    </button>
                  </aside>
                </div>
                <details className={s.guide}>
                  <summary>
                    Como usar este espaço{" "}
                    <span>Um fluxo simples, do começo ao fim</span>
                  </summary>
                  <div>
                    <p>
                      <b>1. Pense.</b> Use o brainstorm para guardar frases,
                      dúvidas do público e possibilidades. Não precisa estar
                      pronto.
                    </p>
                    <p>
                      <b>2. Crie.</b> Transforme a ideia em rascunho. Edite
                      headline, roteiro do carrossel, legenda e chamada para
                      ação.
                    </p>
                    <p>
                      <b>3. Organize.</b> Escolha canal e data, produza a arte e
                      mude a etapa para “Pronto”.
                    </p>
                    <p>
                      <b>4. Publique.</b> Poste na rede social e registre aqui a
                      data real e o link. O painel não publica automaticamente.
                    </p>
                    <p>
                      Os 12 rascunhos iniciais estão distribuídos em 4 semanas
                      relativas, sem calendário obrigatório. Vídeo não é
                      requisito. Se fizer um, pode ser uma gravação da tela do
                      BizuMiner; não precisa comprar nem testar produtos.
                    </p>
                  </div>
                </details>
              </>
            )}
            {view === "contents" && (
              <section>
                <div className={s.pageHeading}>
                  <div>
                    <span className={s.eyebrow}>
                      DA PRIMEIRA FRASE AO POST NO AR
                    </span>
                    <h2>Seu conteúdo, em movimento.</h2>
                    <p>
                      Arraste entre etapas ou reorganize os cartões. Clique para
                      editar; use a alça para escolher um destino.
                    </p>
                  </div>
                  <button
                    className={s.primary}
                    type="button"
                    onClick={() => newContent()}
                  >
                    <Icon name="plus" />
                    Novo conteúdo
                  </button>
                </div>
                <div className={s.filters}>
                  <label className={s.search}>
                    <Icon name="search" size={18} />
                    <input
                      aria-label="Buscar conteúdos"
                      placeholder="Buscar uma ideia, título ou texto…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filtrar formato"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="">Todos os formatos</option>
                    {FORMATS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar pilar"
                    value={pillar}
                    onChange={(e) => setPillar(e.target.value)}
                  >
                    <option value="">Todos os pilares</option>
                    {PILLARS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar semana"
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                  >
                    <option value="">Todas as semanas</option>
                    {[...new Set(workspace.contents.map((c) => c.week))]
                      .sort((a, b) => a - b)
                      .map((w) => (
                        <option key={w} value={w}>
                          {w ? `Semana ${w}` : "Sem semana"}
                        </option>
                      ))}
                  </select>
                  <label className={s.archiveFilter}>
                    <input
                      type="checkbox"
                      checked={archives}
                      onChange={(e) => setArchives(e.target.checked)}
                    />
                    Arquivados
                  </label>
                </div>
                <div className={s.board} aria-busy={saving}>
                  {STAGES.map((stage, i) => (
                    <MarketingDropZone
                      key={stage}
                      target={{ kind: "stage", stage }}
                      className={s.column}
                      label={`Etapa ${STAGE_LABELS[stage]}`}
                    >
                      <h3>
                        <span className={`${s.columnDot} ${s[`tone${i}`]}`} />
                        {STAGE_LABELS[stage]}
                        <span>
                          {
                            visible.filter((c) => contentStage(c) === stage)
                              .length
                          }
                        </span>
                      </h3>
                      <div className={s.columnCards}>
                        {visible
                          .filter((c) => contentStage(c) === stage)
                          .map((content) => (
                            <MarketingDropZone
                              key={content.id}
                              target={{
                                kind: "stage",
                                stage,
                                beforeId: content.id,
                              }}
                              label={`Antes de ${content.title}`}
                              insertion
                            >
                              <ContentCard
                                content={content}
                                onClick={() => setEditing(content)}
                              />
                            </MarketingDropZone>
                          ))}
                        {!visible.some((c) => contentStage(c) === stage) && (
                          <div className={s.emptyColumn}>
                            {stage === "draft"
                              ? "Toda boa publicação começa aqui."
                              : stage === "production"
                                ? "Ideias ganhando forma."
                                : stage === "ready"
                                  ? "Tudo pronto para ir ao ar."
                                  : "Suas publicações aparecerão aqui."}
                          </div>
                        )}
                      </div>
                    </MarketingDropZone>
                  ))}
                </div>
                <p className={s.footnote}>
                  Soltar em “Publicado” abre a confirmação de canal e data real.
                  Registros já publicados não são movidos nem apagados ao
                  arrastar.
                </p>
              </section>
            )}
            {view === "calendar" && (
              <Calendar
                contents={active}
                month={month}
                setMonth={setMonth}
                onEdit={setEditing}
                onNew={newContent}
                saving={saving}
              />
            )}
            {view === "ideas" && (
              <section>
                <div className={s.pageHeading}>
                  <div>
                    <span className={s.eyebrow}>SEM FILTRO. SEM PRESSÃO.</span>
                    <h2>Um lugar para o “e se…?”</h2>
                    <p>
                      Guarde uma frase, uma pergunta ou o começo de alguma coisa
                      boa.
                    </p>
                  </div>
                  <button className={s.primary} type="button" onClick={newIdea}>
                    <Icon name="plus" />
                    Nova ideia
                  </button>
                </div>
                <div className={s.filters}>
                  <label className={s.search}>
                    <Icon name="search" size={18} />
                    <input
                      aria-label="Buscar ideias"
                      placeholder="Buscar nas suas ideias…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className={s.archiveFilter}>
                    <input
                      type="checkbox"
                      checked={archives}
                      onChange={(e) => setArchives(e.target.checked)}
                    />
                    Arquivadas
                  </label>
                </div>
                <div className={s.brainGrid}>
                  <div className={s.notesGrid}>
                    {ideas.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`${s.ideaCard} ${s[item.color]}`}
                        onClick={() => setIdea(item)}
                      >
                        <span className={s.ideaTop}>
                          <Icon name="spark" size={17} />
                          {item.convertedTo
                            ? "Virou conteúdo ✓"
                            : "IDEIA SOLTA"}
                        </span>
                        <h3>{item.title}</h3>
                        <p>
                          {item.text || "Clique para desenvolver esta ideia."}
                        </p>
                        <span className={s.ideaTags}>
                          {item.tags || "Sem etiquetas"}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={s.addIdea}
                      onClick={newIdea}
                    >
                      <Icon name="plus" size={28} />
                      <strong>
                        {ideas.length
                          ? "Cabe mais uma ideia."
                          : "Qual é a sua primeira ideia?"}
                      </strong>
                      <span>Não precisa estar perfeita.</span>
                    </button>
                  </div>
                  <aside className={s.scratchpad}>
                    <span className={s.eyebrow}>RASCUNHO LIVRE</span>
                    <h3>Pensamentos de passagem.</h3>
                    <p>Um bloco para despejar ideias antes de organizar.</p>
                    <label className={s.srOnly} htmlFor="scratchpad">
                      Bloco de brainstorm
                    </label>
                    <textarea
                      id="scratchpad"
                      maxLength={30000}
                      value={scratchpad}
                      onChange={(e) => setScratchpad(e.target.value)}
                      placeholder={
                        "E se a gente explicasse…\n\nDúvida que alguém me fez…\n\nUma headline para testar…"
                      }
                    />
                    <button
                      type="button"
                      className={s.secondary}
                      disabled={saving || scratchpad === workspace.scratchpad}
                      onClick={() => void save(workspace)}
                    >
                      {saving ? "Salvando…" : "Salvar anotações"}
                    </button>
                    <small>
                      {scratchpad === workspace.scratchpad
                        ? "Anotações salvas."
                        : "Clique em salvar para guardar suas anotações."}
                    </small>
                  </aside>
                </div>
              </section>
            )}
          </>
        )}
        {editing && (
          <ContentEditor
            key={editing.id}
            content={editing}
            saving={saving}
            error={error}
            onSave={saveContent}
            onClose={() => {
              setEditing(null);
              setPublicationEditor(false);
              setEditorDirty(false);
            }}
            onDirty={setEditorDirty}
            initialTab={publicationEditor ? "publication" : "text"}
          />
        )}
        {idea && (
          <IdeaEditor
            key={idea.id}
            idea={idea}
            saving={saving}
            error={error}
            onSave={saveIdea}
            onClose={() => {
              setIdea(null);
              setEditorDirty(false);
            }}
            onDirty={setEditorDirty}
            onOpenContent={(id) => {
              setIdea(null);
              setEditorDirty(false);
              setEditing(workspace?.contents.find((c) => c.id === id) || null);
            }}
          />
        )}
        {moving &&
          workspace?.contents.find((c) => c.id === moving.contentId) && (
            <MarketingMoveDialog
              key={
                moving.kind === "publication"
                  ? moving.publicationId
                  : moving.contentId
              }
              item={moving}
              content={
                workspace.contents.find((c) => c.id === moving.contentId)!
              }
              saving={saving}
              error={error}
              onMove={moveItem}
              onClose={() => setMoving(null)}
            />
          )}
      </div>
    </MarketingDragProvider>
  );
}

function Calendar({
  contents,
  month,
  setMonth,
  onEdit,
  onNew,
  saving,
}: {
  contents: MarketingContent[];
  month: string;
  setMonth: (value: string) => void;
  onEdit: (c: MarketingContent) => void;
  onNew: (date?: string) => void;
  saving: boolean;
}) {
  const today = saoPauloToday();
  const date = new Date(`${month}-01T12:00:00`);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const offset = (date.getDay() + 6) % 7;
  function move(delta: number) {
    const next = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const unscheduled = contents.flatMap((content) =>
    content.publications
      .filter((p) => !p.plannedDate && !p.publishedDate)
      .map((p) => ({ content, p })),
  );
  return (
    <section>
      <div className={s.pageHeading}>
        <div>
          <span className={s.eyebrow}>UM PASSO DE CADA VEZ</span>
          <h2>Espaço na agenda. Presença na rede.</h2>
          <p>
            Arraste da lista para um dia ou entre datas. Cada cartão move
            somente aquele canal; publicações já feitas ficam protegidas.
          </p>
        </div>
        <button type="button" className={s.primary} onClick={() => onNew()}>
          <Icon name="plus" />
          Agendar conteúdo
        </button>
      </div>
      <div className={s.calendarLayout}>
        <div className={s.calendar}>
          <div className={s.monthHeading}>
            <h3>
              {new Intl.DateTimeFormat("pt-BR", {
                month: "long",
                year: "numeric",
              }).format(date)}
            </h3>
            <div>
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => move(-1)}
              >
                ‹
              </button>
              <button type="button" onClick={() => setMonth(today.slice(0, 7))}>
                Hoje
              </button>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => move(1)}
              >
                ›
              </button>
            </div>
          </div>
          <div className={s.weekdays}>
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
          <div className={s.days} aria-busy={saving}>
            {Array.from(
              { length: Math.ceil((days + offset) / 7) * 7 },
              (_, index) => {
                const day = index - offset + 1;
                if (day < 1 || day > days)
                  return <div key={index} className={s.otherDay} />;
                const value = `${month}-${String(day).padStart(2, "0")}`;
                const events = contents.flatMap((content) =>
                  content.publications
                    .filter((p) => (p.publishedDate || p.plannedDate) === value)
                    .map((p) => ({ content, p })),
                );
                return (
                  <MarketingDropZone
                    key={index}
                    target={{ kind: "date", date: value }}
                    label={`Dia ${dayLabel(value)}`}
                    className={`${s.day} ${value === today ? s.today : ""}`}
                  >
                    <button
                      type="button"
                      className={s.dayNumber}
                      title={`Criar conteúdo para ${dayLabel(value)}`}
                      onClick={() => onNew(value)}
                    >
                      {day}
                    </button>
                    {events.map(({ content, p }) => (
                      <DraggableMarketingItem
                        key={p.id}
                        compact
                        disabled={!!p.publishedDate}
                        item={{
                          kind: "publication",
                          contentId: content.id,
                          publicationId: p.id,
                          label: `${content.title} · ${p.channel}`,
                        }}
                      >
                        <button
                          type="button"
                          className={`${s.event} ${p.publishedDate ? s.publishedEvent : ""}`}
                          title={`${content.title} · ${p.channel}`}
                          onClick={() => onEdit(content)}
                        >
                          <span>
                            {p.publishedDate ? "✓ " : ""}
                            {p.channel}
                          </span>
                          {content.title}
                        </button>
                      </DraggableMarketingItem>
                    ))}
                  </MarketingDropZone>
                );
              },
            )}
          </div>
          <div className={s.calendarLegend}>
            <span>● Planejado</span>
            <span>✓ Publicado</span>
            <small>Horário de referência: Brasília</small>
          </div>
        </div>
        <MarketingDropZone
          target={{ kind: "date", date: "" }}
          label="Ainda sem data"
          className={s.unscheduled}
        >
          <span className={s.eyebrow}>SEM PRESSA, MAS COM DIREÇÃO</span>
          <h3>
            Ainda sem data <span>{unscheduled.length}</span>
          </h3>
          <p>
            Arraste um canal para o dia desejado. Solte aqui para retirar uma
            data planejada.
          </p>
          <div>
            {unscheduled.map(({ content, p }) => (
              <DraggableMarketingItem
                key={p.id}
                item={{
                  kind: "publication",
                  contentId: content.id,
                  publicationId: p.id,
                  label: `${content.title} · ${p.channel}`,
                }}
              >
                <button type="button" onClick={() => onEdit(content)}>
                  <small>
                    {p.channel} · {content.format}
                  </small>
                  <strong>{content.title}</strong>
                  <span>Arrastar para uma data ↗</span>
                </button>
              </DraggableMarketingItem>
            ))}
            {!unscheduled.length && <p>Tudo com data definida. Boa!</p>}
          </div>
        </MarketingDropZone>
      </div>
    </section>
  );
}
