export const CHANNELS = [
  "Instagram",
  "Facebook",
  "WhatsApp",
  "TikTok",
  "LinkedIn",
] as const;
export const FORMATS = ["Carrossel", "Imagem", "Story", "Vídeo"] as const;
export const STAGES = ["draft", "production", "ready", "published"] as const;
export const STAGE_LABELS = {
  draft: "Rascunho",
  production: "Em produção",
  ready: "Pronto",
  published: "Publicado",
} as const;
export const PILLARS = [
  "Apresentação",
  "Benefício",
  "Como usar",
  "Confiança",
  "Retorno",
] as const;
export type Channel = (typeof CHANNELS)[number];
export type Stage = (typeof STAGES)[number];
export interface Publication {
  id: string;
  channel: Channel;
  plannedDate: string;
  publishedDate: string;
  url: string;
}
export interface MarketingContent {
  id: string;
  title: string;
  headline: string;
  alternatives: string;
  body: string;
  caption: string;
  cta: string;
  notes: string;
  references: string;
  pillar: (typeof PILLARS)[number];
  format: (typeof FORMATS)[number];
  stage: Exclude<Stage, "published">;
  week: number;
  archived: boolean;
  publications: Publication[];
  assets?: MarketingAsset[];
}
export interface MarketingAsset {
  id: string;
  name: string;
}
export const ROUTINE_STEPS = [
  "offer",
  "share",
  "content",
  "distribute",
  "close",
] as const;
export type RoutineStep = (typeof ROUTINE_STEPS)[number];
export interface RoutineOffer {
  name: string;
  variant: string;
  reason: string;
  price: string;
  conditions: string;
  url: string;
  imageUrl: string;
  verifiedAt: string;
  priceLabel?: string;
  capturedAt?: string;
}
export interface RoutineDay {
  date: string;
  currentStep: RoutineStep;
  steps: Record<
    RoutineStep,
    { status: "todo" | "done" | "deferred" | "not_planned"; note: string }
  >;
  offer: RoutineOffer;
  contentId: string;
  whatsappSent: boolean;
  storyPublished: boolean;
  distribution: string;
  summary: string;
  tomorrow: string;
}
export interface MarketingRoutine {
  activeDate: string;
  groupUrl: string;
  days: RoutineDay[];
}
export function emptyRoutine(): MarketingRoutine {
  return { activeDate: "", groupUrl: "", days: [] };
}
export interface MarketingIdea {
  id: string;
  title: string;
  text: string;
  tags: string;
  color: "lemon" | "lavender" | "mint" | "peach";
  convertedTo: string;
  archived: boolean;
}
export interface MarketingWorkspace {
  version: 1;
  contents: MarketingContent[];
  ideas: MarketingIdea[];
  scratchpad: string;
  routine?: MarketingRoutine;
}
export interface MarketingSnapshot {
  revision: number;
  updatedAt: string;
  workspace: MarketingWorkspace;
}

export function contentStage(content: MarketingContent): Stage {
  return content.publications.some((p) => p.publishedDate)
    ? "published"
    : content.stage;
}
export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}
export function saoPauloToday(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function emptyContent(
  id: string,
  publicationId: string,
): MarketingContent {
  return {
    id,
    title: "",
    headline: "",
    alternatives: "",
    body: "",
    caption: "",
    cta: "",
    notes: "",
    references: "",
    pillar: "Apresentação",
    format: "Carrossel",
    stage: "draft",
    week: 0,
    archived: false,
    publications: [
      {
        id: publicationId,
        channel: "Instagram",
        plannedDate: "",
        publishedDate: "",
        url: "",
      },
    ],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Formato de dados inválido.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error("Há um campo vazio ou maior que o limite permitido.");
  return value;
}
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new Error("Opção inválida.");
  return value as T;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Estado inválido.");
  return value;
}
function id(value: unknown): string {
  const result = text(value, 90, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new Error("Identificador inválido.");
  return result;
}
function day(value: unknown): string {
  const result = text(value, 10);
  if (result && !validDay(result)) throw new Error("Data inválida.");
  return result;
}
function timestamp(value: unknown): string {
  const result = text(value, 40);
  if (result && !Number.isFinite(Date.parse(result)))
    throw new Error("Data da captura inválida.");
  return result;
}
function url(value: unknown): string {
  const result = text(value, 2000);
  if (result) {
    let parsed: URL;
    try {
      parsed = new URL(result);
    } catch {
      throw new Error("Informe um link completo, começando com https://.");
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Link inválido.");
  }
  return result;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Quantidade de itens excedida.");
  return value;
}
export function validateWorkspace(value: unknown): MarketingWorkspace {
  const data = record(value);
  if (data.version !== 1) throw new Error("Versão de dados incompatível.");
  const seen = new Set<string>();
  const uniqueId = (value: unknown) => {
    const result = id(value);
    if (seen.has(result)) throw new Error("Identificadores repetidos.");
    seen.add(result);
    return result;
  };
  const contents = list(data.contents, 250).map((value): MarketingContent => {
    const item = record(value);
    const week = item.week;
    if (!Number.isInteger(week) || Number(week) < 0 || Number(week) > 52)
      throw new Error("Semana inválida.");
    return {
      id: uniqueId(item.id),
      title: text(item.title, 250, true),
      headline: text(item.headline, 500),
      alternatives: text(item.alternatives, 5000),
      body: text(item.body, 30000),
      caption: text(item.caption, 10000),
      cta: text(item.cta, 1000),
      notes: text(item.notes, 15000),
      references: text(item.references, 10000),
      pillar: choice(item.pillar, PILLARS),
      format: choice(item.format, FORMATS),
      stage: choice(item.stage, ["draft", "production", "ready"]),
      week: Number(week),
      archived: bool(item.archived),
      publications: list(item.publications, 15).map((value): Publication => {
        const p = record(value);
        return {
          id: uniqueId(p.id),
          channel: choice(p.channel, CHANNELS),
          plannedDate: day(p.plannedDate),
          publishedDate: day(p.publishedDate),
          url: url(p.url),
        };
      }),
      ...(item.assets === undefined
        ? {}
        : {
            assets: list(item.assets, 12).map((value): MarketingAsset => {
              const asset = record(value);
              return { id: id(asset.id), name: text(asset.name, 250, true) };
            }),
          }),
    };
  });
  const ideas = list(data.ideas, 250).map((value): MarketingIdea => {
    const item = record(value);
    const convertedTo = text(item.convertedTo, 90);
    if (convertedTo && !contents.some((c) => c.id === convertedTo))
      throw new Error("Conteúdo da ideia não encontrado.");
    return {
      id: uniqueId(item.id),
      title: text(item.title, 250, true),
      text: text(item.text, 15000),
      tags: text(item.tags, 500),
      color: choice(item.color, ["lemon", "lavender", "mint", "peach"]),
      convertedTo,
      archived: bool(item.archived),
    };
  });
  const result: MarketingWorkspace = {
    version: 1,
    contents,
    ideas,
    scratchpad: text(data.scratchpad, 30000),
    routine: validateRoutine(data.routine, new Set(contents.map((c) => c.id))),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 900000)
    throw new Error("Seu espaço atingiu o limite de tamanho desta versão.");
  return result;
}

function validateRoutine(
  value: unknown,
  contentIds: Set<string>,
): MarketingRoutine {
  if (value === undefined) return emptyRoutine();
  const input = record(value);
  const dates = new Set<string>();
  const days = list(input.days, 90).map((value): RoutineDay => {
    const item = record(value),
      date = day(item.date);
    if (!date || dates.has(date))
      throw new Error("Dia da rotina inválido ou repetido.");
    dates.add(date);
    const rawSteps = record(item.steps);
    const steps = Object.fromEntries(
      ROUTINE_STEPS.map((step) => {
        const entry = record(rawSteps[step]);
        const status = choice(entry.status, [
          "todo",
          "done",
          "deferred",
          "not_planned",
        ] as const);
        const note = text(entry.note, 2000);
        if (status === "deferred" && !note.trim())
          throw new Error("Informe o que falta na etapa adiada.");
        return [step, { status, note }];
      }),
    ) as RoutineDay["steps"];
    const offer = record(item.offer),
      verifiedAt = text(offer.verifiedAt, 40);
    if (verifiedAt && !Number.isFinite(Date.parse(verifiedAt)))
      throw new Error("Conferência da oferta inválida.");
    const contentId = text(item.contentId, 90);
    if (contentId && !contentIds.has(contentId))
      throw new Error("Material da rotina não encontrado.");
    return {
      date,
      currentStep: choice(item.currentStep, ROUTINE_STEPS),
      steps,
      offer: {
        name: text(offer.name, 250),
        variant: text(offer.variant, 500),
        reason: text(offer.reason, 2000),
        price: text(offer.price, 40),
        conditions: text(offer.conditions, 2000),
        url: url(offer.url),
        imageUrl: url(offer.imageUrl),
        verifiedAt,
        ...(offer.priceLabel === undefined
          ? {}
          : { priceLabel: text(offer.priceLabel, 250) }),
        ...(offer.capturedAt === undefined
          ? {}
          : { capturedAt: timestamp(offer.capturedAt) }),
      },
      contentId,
      whatsappSent: bool(item.whatsappSent),
      storyPublished: bool(item.storyPublished),
      distribution: text(item.distribution, 4000),
      summary: text(item.summary, 4000),
      tomorrow: text(item.tomorrow, 2000),
    };
  });
  const activeDate = day(input.activeDate);
  if (activeDate && !dates.has(activeDate))
    throw new Error("Dia ativo não encontrado.");
  return { activeDate, groupUrl: url(input.groupUrl), days };
}
