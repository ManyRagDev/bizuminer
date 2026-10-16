import {
  contentStage,
  validDay,
  type MarketingWorkspace,
  type Stage,
} from "./marketing-contract.ts";

export type MarketingDragItem =
  | { kind: "content"; contentId: string; label: string }
  | {
      kind: "publication";
      contentId: string;
      publicationId: string;
      label: string;
    };
export type MarketingDropTarget =
  | { kind: "stage"; stage: Stage; beforeId?: string }
  | { kind: "date"; date: string };

/** Keep recorded publication history separate from reversible production moves. */
export function moveMarketingContent(
  workspace: MarketingWorkspace,
  contentId: string,
  stage: Stage,
  beforeId?: string,
): MarketingWorkspace {
  const content = workspace.contents.find((c) => c.id === contentId);
  if (!content || content.archived)
    throw new Error("Conteúdo indisponível para mover.");
  if (stage === "published" || contentStage(content) === "published")
    throw new Error(
      "Confira a data real na aba Publicação. O histórico não é alterado ao arrastar.",
    );
  if (beforeId === contentId) return workspace;
  const next = { ...content, stage };
  const contents = workspace.contents.filter((c) => c.id !== contentId);
  const before = beforeId
    ? contents.findIndex(
        (c) => c.id === beforeId && contentStage(c) === stage && !c.archived,
      )
    : -1;
  if (beforeId && before < 0)
    throw new Error("Destino do cartão não encontrado.");
  contents.splice(before < 0 ? contents.length : before, 0, next);
  if (
    content.stage === stage &&
    contents.every((c, i) => c.id === workspace.contents[i].id)
  )
    return workspace;
  return { ...workspace, contents };
}

/** Rescheduling changes exactly one pending channel, never the actual publication date. */
export function rescheduleMarketingPublication(
  workspace: MarketingWorkspace,
  contentId: string,
  publicationId: string,
  date: string,
): MarketingWorkspace {
  if (date && !validDay(date)) throw new Error("Escolha uma data válida.");
  const content = workspace.contents.find((c) => c.id === contentId);
  const publication = content?.publications.find((p) => p.id === publicationId);
  if (!content || content.archived || !publication)
    throw new Error("Publicação indisponível para mover.");
  if (publication.publishedDate)
    throw new Error(
      "Publicações já feitas não podem ser reagendadas. Edite o registro real, se necessário.",
    );
  if (publication.plannedDate === date) return workspace;
  return {
    ...workspace,
    contents: workspace.contents.map((c) =>
      c.id !== contentId
        ? c
        : {
            ...c,
            publications: c.publications.map((p) =>
              p.id !== publicationId ? p : { ...p, plannedDate: date },
            ),
          },
    ),
  };
}
