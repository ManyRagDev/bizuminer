import { pageAccount } from "../../../../lib/page-account.ts";
import {
  workspaceOffers,
  draftPublication,
} from "../../../../lib/affiliate-workspace-db.ts";
import { readWorkDraft } from "../../../../lib/work-draft-db.ts";
import { notFound } from "next/navigation";
import DraftEditor from "../editor.tsx";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ produto?: string; canal?: string }>;
}) {
  const c = await pageAccount();
  if (!c) return null;
  const { id } = await params;
  let draft;
  try {
    draft = await readWorkDraft(c, id);
  } catch (e) {
    if (e instanceof Error && e.message === "not_found") notFound();
    throw e;
  }
  const query = await searchParams,
    selectedProduct =
      draft.productId ??
      (draft.authorId === c.actorAppUserId && draft.state === "editing"
        ? query.produto
        : null);
  const [selection, publication] = await Promise.all([
    selectedProduct
      ? workspaceOffers(c, selectedProduct)
      : Promise.resolve({ offers: [] }),
    draftPublication(c, draft),
  ]);
  const offer = selection.offers.find(
    (o) => o.candidate.id === selectedProduct,
  );
  return (
    <DraftEditor
      key={`${c.tenantId}:${draft.id}`}
      initial={JSON.parse(JSON.stringify(draft))}
      offer={offer ? JSON.parse(JSON.stringify(offer)) : null}
      publication={publication ? JSON.parse(JSON.stringify(publication)) : null}
      ready
      owner={c.membershipRole === "owner"}
      own={c.actorAppUserId === draft.authorId}
      bindingChannel={query.canal === "stories" ? "stories" : "whatsapp"}
    />
  );
}
