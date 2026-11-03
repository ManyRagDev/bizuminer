"use client";

import { useEffect, useState } from "react";
import {
  emptyRoutine,
  ROUTINE_STEPS,
  saoPauloToday,
  type MarketingWorkspace as Workspace,
  type RoutineDay,
  type RoutineStep,
} from "../../../lib/marketing-contract";
import {
  changeRoutineOffer,
  finishStep,
  isFeedDay,
  newRoutineDay,
  plannedSteps,
  ROUTINE_LABELS,
  startRoutineDay,
  stepIssue,
  stepMinutes,
  updateRoutineDay,
} from "../../../lib/marketing-routine";
import { exportData } from "./ui";
import { isStarterContent } from "../../../lib/marketing-editorial";
import { useMarketingWorkspace } from "./use-marketing-workspace";
import {
  CloseStep,
  ContentStep,
  DistributionStep,
  Field,
  OfferStep,
  ShareStep,
} from "./routine-steps";
import s from "./routine.module.css";

const HELP: Record<RoutineStep, string> = {
  offer:
    "A pauta traz produtos da conta em operação e preenche os dados disponíveis. O link já está pronto para compartilhar. Os complementos e o registro de conferência manual são opcionais; confirme as condições na loja quando for divulgar uma oferta com preço.",
  share:
    "A mensagem reúne o que você conferiu na etapa anterior. Copie e envie manualmente no grupo. Nos dias de Stories, use a foto, as condições e o link para preparar a publicação no Instagram.",
  content:
    "Carrossel é uma publicação com várias imagens. Primeiro revise o texto de cada imagem e a legenda. Depois adicione as artes finais. A prévia dos textos ajuda a preparar; não substitui as imagens.",
  distribute:
    "Um convite no Status, uma indicação que alguém pediu ou uma colaboração com um perfil do mesmo assunto são ações possíveis. Registre uma ação concreta, respeitando o espaço e o interesse das pessoas.",
  close:
    "Anote o que conseguiu fazer e a primeira tarefa do próximo acesso. Etapas adiadas aparecem como pendências e podem ser retomadas a qualquer momento.",
};
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00Z"));
}
type View = "today" | "materials" | "week";

export default function MarketingWorkspace({ tenantId }: { tenantId: string }) {
  const store = useMarketingWorkspace(tenantId);
  const [today, setToday] = useState(saoPauloToday);
  const [view, setView] = useState<View>("today"),
    [help, setHelp] = useState(false),
    [deferring, setDeferring] = useState(false),
    [deferNote, setDeferNote] = useState(""),
    [notice, setNotice] = useState("");
  const [materialId, setMaterialId] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setToday(saoPauloToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  const workspace = store.workspace;
  const selectedMaterialId =
    materialId || workspace?.contents.find(isStarterContent)?.id || "";
  const routine = workspace?.routine ?? emptyRoutine();
  const day = routine.days.find((d) => d.date === routine.activeDate);
  const step = day?.currentStep ?? "offer";
  const steps = day ? plannedSteps(day.date) : ROUTINE_STEPS;
  const issue = day && workspace ? stepIssue(day, workspace, step, today) : "";
  const completed = day
    ? steps.filter((key) => day.steps[key].status === "done").length
    : 0;
  const deferred = day
    ? steps.filter((key) => day.steps[key].status === "deferred")
    : ([] as RoutineStep[]);
  const allHandled =
    day && steps.every((key) => day.steps[key].status !== "todo");
  const pending = routine.days.filter(
    (d) =>
      d.date !== day?.date &&
      plannedSteps(d.date).some((key) => d.steps[key].status !== "done"),
  );
  function updateDay(change: (current: RoutineDay) => RoutineDay) {
    if (day)
      store.update((current) => updateRoutineDay(current, day.date, change));
  }
  function patchDay(patch: Partial<RoutineDay>) {
    updateDay((current) => ({ ...current, ...patch }));
  }
  function selectStep(next: RoutineStep) {
    patchDay({ currentStep: next });
    setHelp(false);
    setDeferring(false);
    setDeferNote("");
    setNotice("");
  }
  function start(date = today) {
    store.update((current) => startRoutineDay(current, date));
    setView("today");
    setNotice("");
    setDeferring(false);
    setHelp(false);
  }
  function finish(note?: string) {
    if (!day) return;
    store.update((current) => finishStep(current, day.date, step, note, today));
    setDeferring(false);
    setDeferNote("");
    setHelp(false);
    setNotice(
      note === undefined
        ? "Etapa marcada como feita."
        : "Pendência registrada para retomar.",
    );
  }
  const saveLabel = store.saving
    ? "Salvando…"
    : store.dirty
      ? "Alterações pendentes"
      : store.updatedAt
        ? "Progresso salvo"
        : "";
  return (
    <div className={s.workspace}>
      <header className={s.header}>
        <div>
          <span className={s.eyebrow}>BIZUMINER · MARKETING</span>
          <h1>Meu dia</h1>
          <p>Uma tarefa por vez, com o material e o próximo passo à mão.</p>
        </div>
        <span className={s.saveState} role="status">
          {saveLabel}
        </span>
      </header>
      <nav className={s.navigation} aria-label="Navegação do Marketing">
        {(
          [
            { id: "today", label: "Meu dia" },
            { id: "materials", label: "Materiais" },
            { id: "week", label: "Semana e histórico" },
          ] as const
        ).map((item) => (
          <button
            type="button"
            key={item.id}
            className={view === item.id ? s.activeTab : ""}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          className={s.exportButton}
          type="button"
          disabled={!workspace}
          onClick={() => workspace && exportData(workspace)}
        >
          Baixar minha cópia
        </button>
      </nav>
      {store.error && (
        <div className={s.error} role="alert">
          <p>{store.error}</p>
          <div className={s.inline}>
            <button
              type="button"
              className={s.button}
              onClick={() => void (workspace ? store.retry() : store.reload())}
            >
              {workspace
                ? "Tentar salvar novamente"
                : "Tentar carregar novamente"}
            </button>
            {workspace && (
              <button
                type="button"
                className={s.button}
                onClick={() => exportData(workspace)}
              >
                Baixar alterações antes de recarregar
              </button>
            )}
          </div>
          <p className={s.hint}>
            Se outra aba alterou o espaço, guarde sua cópia antes de recarregar
            a página. O texto desta tela continua disponível.
          </p>
        </div>
      )}
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {store.loading ? (
        <div className={s.empty} role="status">
          <h2>Abrindo sua rotina…</h2>
          <p>Carregando o progresso da conta em operação.</p>
        </div>
      ) : !workspace ? null : view === "today" ? (
        <>
          {!day ? (
            <section className={s.welcome}>
              <span className={s.eyebrow}>{dateLabel(today)}</span>
              <h2>Vamos começar pelo próximo passo.</h2>
              <p>
                Você vai conferir uma oferta, preparar a divulgação e deixar o
                conteúdo encaminhado. Cada etapa mostra o que fazer e quando
                terminou.
              </p>
              <button
                type="button"
                className={s.primary}
                onClick={() => start()}
              >
                Começar meu dia →
              </button>
              <p className={s.hint}>
                O progresso fica salvo na sua conta. Os materiais anteriores
                estão na aba Materiais.
              </p>
            </section>
          ) : (
            <>
              <div className={s.dayHeading}>
                <div>
                  <h2>{dateLabel(day.date)}</h2>
                  <span className={s.hint}>
                    {day.date === today
                      ? "Sua rotina de hoje"
                      : "Retomando um dia anterior. Reconfira as ofertas antes de divulgar."}
                  </span>
                </div>
                <div className={s.time}>
                  <span>Tempo reservado</span>
                  <strong>
                    {steps.reduce(
                      (sum, key) => sum + stepMinutes(day.date, key),
                      0,
                    )}{" "}
                    minutos
                  </strong>
                </div>
              </div>
              {day.date !== today && (
                <div className={s.callout}>
                  Você voltou ao ponto em que parou.{" "}
                  <button
                    type="button"
                    className={s.linkButton}
                    onClick={() => start()}
                  >
                    Abrir a rotina de hoje
                  </button>
                </div>
              )}
              {pending.length > 0 && (
                <details className={s.details}>
                  <summary>
                    Pendências de outros dias · {pending.length}
                  </summary>
                  {pending
                    .slice()
                    .reverse()
                    .map((d) => (
                      <button
                        type="button"
                        key={d.date}
                        className={s.historyButton}
                        onClick={() => start(d.date)}
                      >
                        <span>{dateLabel(d.date)}</span>
                        <span>Retomar →</span>
                      </button>
                    ))}
                </details>
              )}
              <nav className={s.steps} aria-label="Etapas do dia">
                {steps.map((key, index) => (
                  <button
                    type="button"
                    key={key}
                    className={
                      s.step + (step === key ? " " + s.selectedStep : "")
                    }
                    aria-pressed={step === key}
                    onClick={() => selectStep(key)}
                  >
                    <span className={s.stepNumber}>
                      {day.steps[key].status === "done" ? "✓" : index + 1}
                    </span>
                    <span>
                      {key === "offer"
                        ? "Oferta"
                        : key === "share"
                          ? "WhatsApp"
                          : key === "content"
                            ? "Feed"
                            : key === "distribute"
                              ? "Divulgação"
                              : "Fechamento"}
                      {day.steps[key].status === "deferred" && (
                        <small>Pendente</small>
                      )}
                    </span>
                  </button>
                ))}
              </nav>
              {allHandled && (
                <div className={s.finished}>
                  <h3>
                    {deferred.length
                      ? "Dia registrado, com pendências"
                      : "Rotina concluída"}
                  </h3>
                  <p>
                    {deferred.length
                      ? "As tarefas adiadas continuam abaixo. Você pode retomá-las quando tiver o material necessário."
                      : "Seu próximo passo ficou anotado. Você pode consultar o registro ou voltar no próximo dia."}
                  </p>
                  {deferred.map((key) => (
                    <button
                      type="button"
                      className={s.historyButton}
                      key={key}
                      onClick={() => selectStep(key)}
                    >
                      <span>
                        <strong>{ROUTINE_LABELS[key]}</strong>
                        <small>{day.steps[key].note}</small>
                      </span>
                      <span>Retomar →</span>
                    </button>
                  ))}
                  {day.date !== today && (
                    <button
                      type="button"
                      className={s.primary}
                      onClick={() => start()}
                    >
                      Começar o dia de hoje
                    </button>
                  )}
                </div>
              )}
              <section className={s.task} aria-labelledby="routine-task-title">
                <div className={s.taskMeta}>
                  <span className={s.eyebrow}>
                    ETAPA {steps.indexOf(step) + 1} DE {steps.length}
                  </span>
                  <span className={s.badge}>
                    {stepMinutes(day.date, step)} minutos
                  </span>
                </div>
                <h2 id="routine-task-title">
                  {step === "offer"
                    ? "Escolher e conferir uma oferta"
                    : step === "share"
                      ? "Compartilhar a oferta de hoje"
                      : step === "content"
                        ? isFeedDay(day.date)
                          ? "Publicar o conteúdo do feed"
                          : "Preparar o próximo conteúdo"
                        : step === "distribute"
                          ? "Responder e divulgar"
                          : "Deixar o próximo dia encaminhado"}
                </h2>
                {day.steps[step].status === "deferred" && (
                  <p className={s.callout}>
                    O que ficou faltando: {day.steps[step].note}
                  </p>
                )}
                {step === "offer" ? (
                  <OfferStep
                    key={day.date + "-offer"}
                    day={day}
                    tenantId={tenantId}
                    onChange={(offer) =>
                      updateDay((current) => changeRoutineOffer(current, offer))
                    }
                  />
                ) : step === "share" ? (
                  <ShareStep
                    key={day.date + "-share"}
                    day={day}
                    groupUrl={routine.groupUrl}
                    onChange={patchDay}
                    onGroupUrl={(groupUrl) =>
                      store.update((current) => ({
                        ...current,
                        routine: { ...current.routine!, groupUrl },
                      }))
                    }
                  />
                ) : step === "content" ? (
                  <ContentStep
                    key={day.date + "-content"}
                    day={day}
                    workspace={workspace}
                    tenantId={tenantId}
                    onWorkspace={store.update}
                  />
                ) : step === "distribute" ? (
                  <DistributionStep
                    key={day.date + "-distribute"}
                    day={day}
                    groupUrl={routine.groupUrl}
                    onChange={patchDay}
                  />
                ) : (
                  <CloseStep
                    key={day.date + "-close"}
                    day={day}
                    onChange={patchDay}
                  />
                )}
                {help && (
                  <div className={s.help} id="routine-help">
                    {HELP[step]}
                  </div>
                )}
                {deferring && (
                  <div className={s.defer}>
                    <Field
                      label="O que falta para retomar?"
                      hint="Ex.: faltam as quatro imagens finais do carrossel."
                    >
                      <textarea
                        autoFocus
                        value={deferNote}
                        maxLength={2000}
                        onChange={(e) => setDeferNote(e.target.value)}
                      />
                    </Field>
                    <div className={s.inline}>
                      <button
                        type="button"
                        className={s.button}
                        onClick={() => setDeferring(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className={s.primary}
                        onClick={() => finish(deferNote)}
                      >
                        Guardar pendência e continuar
                      </button>
                    </div>
                  </div>
                )}
                <div className={s.taskActions}>
                  <button
                    type="button"
                    className={s.button}
                    aria-expanded={help}
                    aria-controls="routine-help"
                    onClick={() => setHelp((value) => !value)}
                  >
                    Preciso de ajuda
                  </button>
                  <div className={s.inline}>
                    <button
                      type="button"
                      className={s.button}
                      onClick={() => {
                        setDeferring(true);
                        setDeferNote(day.steps[step].note);
                      }}
                    >
                      Deixar para depois
                    </button>
                    <button
                      type="button"
                      className={s.primary}
                      onClick={() => finish()}
                    >
                      Concluir etapa →
                    </button>
                  </div>
                </div>
                <p className={s.hint}>
                  Campos opcionais. Você pode avançar sem preencher tudo.
                  Concluir uma etapa não envia mensagens nem publica nas redes.
                </p>
                {issue && (
                  <p className={s.hint} role="status">
                    {issue}
                  </p>
                )}
              </section>
              <footer className={s.dayFooter}>
                <span>
                  {completed} de {steps.length} etapas concluídas
                  {deferred.length
                    ? " · " + deferred.length + " pendente(s)"
                    : ""}
                </span>
                <span>{store.dirty ? "Aguardando salvamento" : saveLabel}</span>
              </footer>
            </>
          )}
        </>
      ) : view === "materials" ? (
        <section className={s.task}>
          <h2>Seus materiais</h2>
          <p>
            A sequência de organização e iluminação tem{" "}
            {workspace.contents.filter(isStarterContent).length} roteiros com
            texto de cada imagem, legenda, chamada e direção de arte. Seus
            materiais anteriores continuam disponíveis.
          </p>
          <Field label="Abrir material">
            <select
              value={selectedMaterialId}
              onChange={(e) => setMaterialId(e.target.value)}
            >
              <option value="">Escolher um material…</option>
              <optgroup label="Sequência de organização e iluminação">
                {workspace.contents.filter(isStarterContent).map((c) => (
                  <option key={c.id} value={c.id}>
                    Semana {c.week} · {c.title}
                    {c.archived ? " · arquivado" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outros materiais e rascunhos anteriores">
                {workspace.contents
                  .filter((c) => !isStarterContent(c))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.archived ? " · arquivado" : ""}
                    </option>
                  ))}
              </optgroup>
            </select>
          </Field>
          {selectedMaterialId ? (
            <ContentStep
              key={selectedMaterialId}
              library
              day={{
                ...(day ?? newRoutineDay(today)),
                contentId: selectedMaterialId,
              }}
              workspace={workspace}
              tenantId={tenantId}
              onWorkspace={(change) => store.update(change)}
            />
          ) : (
            <p className={s.hint}>
              {workspace.contents.length} materiais salvos. Escolha um material
              para revisar.
            </p>
          )}
          {workspace.ideas.length > 0 && (
            <details className={s.details}>
              <summary>Ideias anteriores · {workspace.ideas.length}</summary>
              {workspace.ideas.map((idea) => (
                <div key={idea.id} className={s.example}>
                  <h3>{idea.title}</h3>
                  <p className={s.preserveLines}>{idea.text}</p>
                </div>
              ))}
            </details>
          )}
          {workspace.scratchpad && (
            <details className={s.details}>
              <summary>Anotações anteriores</summary>
              <p className={s.preserveLines}>{workspace.scratchpad}</p>
            </details>
          )}
        </section>
      ) : (
        <section className={s.task}>
          <h2>Sua semana</h2>
          <p>
            As ofertas são conferidas nos dias úteis. Os materiais de sábado
            ficam preparados na sexta.
          </p>
          <div className={s.week}>
            {[
              "Segunda",
              "Terça",
              "Quarta",
              "Quinta",
              "Sexta",
              "Sábado",
              "Domingo",
            ].map((label, index) => (
              <div key={label}>
                <strong>{label}</strong>
                <span>
                  {
                    [
                      "Preparar o conteúdo de terça; oferta, Stories e divulgação.",
                      "Publicar conteúdo e Stories; revisar pedidos e comissões.",
                      "Preparar o conteúdo de quinta; oferta e atendimento.",
                      "Publicar conteúdo, Stories e divulgar.",
                      "Preparar o material de sábado; oferta e divulgação.",
                      "Conferir a oferta, publicar o material pronto e divulgar. Até 20 minutos.",
                      "Responder pendências e encaminhar a segunda. Até 20 minutos.",
                    ][index]
                  }
                </span>
              </div>
            ))}
          </div>
          <h3>Dias registrados</h3>
          {!routine.days.length ? (
            <p className={s.hint}>
              Comece seu primeiro dia para registrar o progresso.
            </p>
          ) : (
            routine.days
              .slice()
              .reverse()
              .map((d) => (
                <button
                  type="button"
                  key={d.date}
                  className={s.historyButton}
                  onClick={() => start(d.date)}
                >
                  <span>
                    {dateLabel(d.date)}
                    <small>
                      {
                        plannedSteps(d.date).filter(
                          (key) => d.steps[key].status === "done",
                        ).length
                      }{" "}
                      de {plannedSteps(d.date).length} etapas concluídas
                    </small>
                  </span>
                  <span>Abrir →</span>
                </button>
              ))
          )}
        </section>
      )}
    </div>
  );
}
