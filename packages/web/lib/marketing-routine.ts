import {
  emptyContent,
  emptyRoutine,
  ROUTINE_STEPS,
  saoPauloToday,
  type MarketingContent,
  type MarketingWorkspace,
  type RoutineDay,
  type RoutineOffer,
  type RoutineStep,
} from "./marketing-contract.ts";
import { suggestedRoutineContent } from "./marketing-editorial.ts";
import { shareableLink } from "./marketing-pauta.ts";

export const ROUTINE_LABELS: Record<RoutineStep, string> = {
  offer: "Conferir uma oferta",
  share: "WhatsApp e Stories",
  content: "Conteúdo do feed",
  distribute: "Atender e divulgar",
  close: "Fechar o dia",
};
export const ROUTINE_MINUTES: Record<RoutineStep, number> = {
  offer: 10,
  share: 10,
  content: 25,
  distribute: 10,
  close: 5,
};
export function weekday(date: string) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}
export function isFeedDay(date: string) {
  return [2, 4, 6].includes(weekday(date));
}
export function isStoryDay(date: string) {
  return [1, 2, 4, 6].includes(weekday(date));
}
export function plannedSteps(date: string): readonly RoutineStep[] {
  return weekday(date) === 0 ? ["distribute", "close"] : ROUTINE_STEPS;
}
export function stepMinutes(date: string, step: RoutineStep) {
  if (weekday(date) === 0)
    return step === "distribute" || step === "close" ? 10 : 0;
  if (weekday(date) === 6)
    return { offer: 5, share: 3, content: 5, distribute: 5, close: 2 }[step];
  return ROUTINE_MINUTES[step];
}
export function nextFeedDay(date: string): string {
  const next = new Date(date + "T12:00:00Z");
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (![2, 4, 6].includes(next.getUTCDay()));
  return next.toISOString().slice(0, 10);
}
export function newRoutineDay(date: string): RoutineDay {
  const planned = plannedSteps(date);
  return {
    date,
    currentStep: planned[0],
    steps: Object.fromEntries(
      ROUTINE_STEPS.map((step) => [
        step,
        { status: planned.includes(step) ? "todo" : "not_planned", note: "" },
      ]),
    ) as RoutineDay["steps"],
    offer: {
      name: "",
      variant: "",
      reason: "",
      price: "",
      conditions: "",
      url: "",
      imageUrl: "",
      verifiedAt: "",
    },
    contentId: "",
    whatsappSent: false,
    storyPublished: false,
    distribution: "",
    summary: "",
    tomorrow: "",
  };
}
export function startRoutineDay(
  workspace: MarketingWorkspace,
  date: string,
): MarketingWorkspace {
  const routine = workspace.routine ?? emptyRoutine();
  // Keep unresolved work. The UI offers explicit resumption instead of silently moving it.
  if (!routine.days.some((d) => d.date === date) && routine.days.length >= 90)
    throw new Error(
      "Exporte seu histórico antes de iniciar outro dia; o limite é de 90 dias.",
    );
  return {
    ...workspace,
    routine: {
      ...routine,
      activeDate: date,
      days: routine.days.some((d) => d.date === date)
        ? routine.days
        : [
            ...routine.days,
            {
              ...newRoutineDay(date),
              contentId: suggestedRoutineContent(workspace)?.id ?? "",
            },
          ],
    },
  };
}
export function updateRoutineDay(
  workspace: MarketingWorkspace,
  date: string,
  update: (day: RoutineDay) => RoutineDay,
): MarketingWorkspace {
  const routine = workspace.routine ?? emptyRoutine();
  return {
    ...workspace,
    routine: {
      ...routine,
      days: routine.days.map((day) => (day.date === date ? update(day) : day)),
    },
  };
}
export function changeRoutineOffer(
  day: RoutineDay,
  offer: RoutineOffer,
): RoutineDay {
  if (JSON.stringify(day.offer) === JSON.stringify(offer)) return day;
  return {
    ...day,
    offer,
    whatsappSent: false,
    storyPublished: false,
    steps: {
      ...day.steps,
      offer: { status: "todo", note: "" },
      share: { status: "todo", note: "" },
    },
  };
}
export function offerIssue(
  offer: RoutineOffer,
  today = saoPauloToday(),
): string {
  if (!offer.name && !offer.url)
    return "Você pode escolher um produto agora ou continuar e retomar depois.";
  if (!shareableLink(offer.url))
    return "Para compartilhar, use um link completo de compra ou da pauta. Os demais campos são opcionais.";
  if (!offer.verifiedAt || saoPauloToday(new Date(offer.verifiedAt)) !== today)
    return "Dados da pauta não equivalem a uma conferência manual. Confira as condições no link quando for divulgar; isso não bloqueia sua rotina.";
  return "";
}
export function offerMessage(offer: RoutineOffer): string {
  const observed = offer.verifiedAt || offer.capturedAt;
  const checked =
    observed && Number.isFinite(Date.parse(observed))
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(observed))
      : "";
  const price =
    offer.priceLabel ||
    (offer.price.trim()
      ? /^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(offer.price.trim())
        ? "R$ " + offer.price
        : offer.price
      : "");
  return [
    offer.name,
    offer.reason,
    offer.variant ? "Versão / conteúdo: " + offer.variant : "",
    price ? "Preço: " + price : "",
    offer.conditions,
    checked
      ? (offer.verifiedAt ? "Conferido em " : "Preço da pauta, capturado em ") +
        checked +
        ". O preço pode mudar."
      : "Preço e disponibilidade podem mudar. Confira as condições no link.",
    offer.url ? "Ver produto → " + offer.url : "",
    "Link de afiliado: podemos receber comissão pela compra, sem custo adicional para você.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function contentIssue(
  content: MarketingContent | undefined,
  publishing: boolean,
  today = saoPauloToday(),
): string {
  if (!content) return "Escolha um material ou prepare um novo carrossel.";
  if (
    ![content.title, content.body, content.caption].every((value) =>
      value.trim(),
    )
  )
    return "Você pode completar os textos depois, sem bloquear a rotina.";
  const minimum =
    content.format === "Carrossel"
      ? Math.min(
          12,
          Math.max(2, content.body.split(/\n\s*\n/).filter(Boolean).length),
        )
      : 1;
  if ((content.assets?.length ?? 0) < minimum)
    return content.format === "Carrossel"
      ? "Para montar o carrossel, faltam " +
          minimum +
          " imagens finais. O roteiro já pode ser revisado; as artes não impedem avançar."
      : "A imagem final pode ser adicionada depois. Você pode avançar na rotina.";
  if (
    publishing &&
    !content.publications.some((p) => {
      if (p.channel !== "Instagram" || p.publishedDate !== today) return false;
      try {
        const link = new URL(p.url);
        return (
          ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
            link.hostname,
          ) && /^\/(p|reel|tv)\//.test(link.pathname)
        );
      } catch {
        return false;
      }
    })
  )
    return "Depois de publicar, você pode guardar a data e o link do Instagram aqui. Esse registro é opcional.";
  return "";
}
export function stepIssue(
  day: RoutineDay,
  workspace: MarketingWorkspace,
  step: RoutineStep,
  today = saoPauloToday(),
): string {
  if (step === "offer") return offerIssue(day.offer, today);
  if (step === "share")
    return (
      offerIssue(day.offer, today) ||
      (!day.whatsappSent
        ? "Confirme o envio manual da oferta no WhatsApp."
        : isStoryDay(day.date) && !day.storyPublished
          ? "Confirme a publicação do Story de hoje."
          : "")
    );
  if (step === "content")
    return contentIssue(
      workspace.contents.find((c) => c.id === day.contentId),
      isFeedDay(day.date),
      today,
    );
  if (step === "distribute")
    return day.distribution.trim()
      ? ""
      : "Anote onde divulgou ou qual atendimento realizou.";
  return day.summary.trim() && day.tomorrow.trim()
    ? ""
    : "Anote o que conseguiu fazer e por onde retomar.";
}
export function finishStep(
  workspace: MarketingWorkspace,
  date: string,
  step: RoutineStep,
  deferredNote?: string,
  today = saoPauloToday(),
): MarketingWorkspace {
  const day = workspace.routine?.days.find((d) => d.date === date);
  if (!day) throw new Error("Inicie seu dia antes de continuar.");
  // Completion is the operator's checklist decision. It never fabricates a send, image or publication.
  return updateRoutineDay(workspace, date, (current) => {
    const steps = {
      ...current.steps,
      [step]: {
        status:
          deferredNote === undefined
            ? ("done" as const)
            : ("deferred" as const),
        note:
          deferredNote === undefined
            ? ""
            : deferredNote.trim() || "Retomar esta etapa depois.",
      },
    };
    const index = ROUTINE_STEPS.indexOf(step);
    const next = [
      ...ROUTINE_STEPS.slice(index + 1),
      ...ROUTINE_STEPS.slice(0, index),
    ].find((key) => steps[key].status === "todo");
    return { ...current, steps, currentStep: next ?? step };
  });
}
export function createRoutineContent(
  day: RoutineDay,
  id: string,
  publicationId: string,
): MarketingContent {
  const content = emptyContent(id, publicationId);
  const subject =
    day.offer.name || "Uma escolha para deixar a casa mais prática";
  return {
    ...content,
    title: subject,
    headline: "O que conferir antes de escolher",
    pillar: "Benefício",
    body: [
      "1. Qual situação este produto resolve?",
      day.offer.reason ||
        "2. Explique a utilidade com base nas características verificadas.",
      "3. Confira a versão: " +
        (day.offer.variant || "complete com o modelo escolhido."),
      "4. Veja nossas indicações atuais pelo link do perfil.",
    ].join("\n\n"),
    caption: day.offer.reason,
    cta: "Veja nossas indicações atuais no link do perfil.",
    stage: "production",
    assets: [],
    publications: [
      {
        ...content.publications[0],
        plannedDate: isFeedDay(day.date) ? day.date : nextFeedDay(day.date),
      },
    ],
  };
}
