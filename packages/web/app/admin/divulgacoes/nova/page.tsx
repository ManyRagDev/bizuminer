import { pageAccount } from "../../../../lib/page-account.ts";
import { workspaceOffers } from "../../../../lib/affiliate-workspace-db.ts";
import { listWorkDrafts } from "../../../../lib/work-draft-db.ts";
import type { WorkDraft } from "../../../../lib/affiliate-workspace-contract.ts";
import DraftEditor from "../editor.tsx";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string; canal?: string }>;
}) {
  const c = await pageAccount();
  if (!c) return null;
  const p = await searchParams;
  const offer = p.produto
    ? (await workspaceOffers(c, p.produto)).offers.find(
        (o) => o.candidate.id === p.produto,
      )
    : null;
  const channel = p.canal === "stories" ? "stories" : "whatsapp",
    o = offer?.candidate,
    now = new Date().toISOString();
  const draft: WorkDraft = {
    id: crypto.randomUUID(),
    version: 0,
    kind: o ? "offer" : "content",
    channel,
    title: o?.displayTitle ?? o?.title ?? "Novo conteúdo",
    authorId: c.actorAppUserId!,
    state: "editing",
    publicationId: null,
    createdAt: now,
    updatedAt: now,
    productId: o?.id ?? null,
    optionKey: offer?.reference.optionKey ?? null,
    sourceUrl: o?.productUrl ?? "",
    content: {
      text: o
        ? [o.displayTitle ?? o.title, o.assessment?.benefit ?? o.benefit]
            .filter(Boolean)
            .join("\n\n")
        : "",
      notes: "",
      observationId: offer?.reference.observationId ?? "",
      evidenceFingerprint: offer?.reference.evidenceFingerprint ?? "",
      assetIds: [],
    },
  };
  const { ready } = await listWorkDrafts(c);
  return (
    <DraftEditor
      key={c.tenantId + ":" + draft.id}
      initial={draft}
      offer={offer ? JSON.parse(JSON.stringify(offer)) : null}
      ready={ready}
      owner={c.membershipRole === "owner"}
      own
    />
  );
}
