import { NextRequest, NextResponse } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import { workspaceJson } from "../../../../lib/workspace-request.ts";
import {
  workspaceError,
  validDraftId,
} from "../../../../lib/affiliate-workspace-contract.ts";
import {
  prepareWorkDraft,
  approveWorkDraft,
  exportWorkDraft,
  confirmWorkDraft,
  saveWorkspaceAudience,
  draftPublication,
  affiliateWorkspaceEnabled,
} from "../../../../lib/affiliate-workspace-db.ts";
import { generateKitArtifact } from "../../../../lib/kit-artifact-db.ts";
import { readWorkDraft } from "../../../../lib/work-draft-db.ts";
import { registerWorkspaceOffer } from "../../../../lib/workspace-capture.ts";
import { prepareWorkspaceLink } from "../../../../lib/workspace-link.ts";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const a = await checkAffiliateUser(req);
  if (a.kind !== "ok")
    return NextResponse.json(
      { error: "Entre novamente para continuar." },
      { status: 403 },
    );
  const reply = (body: unknown, status = 200) =>
    sinkJson(a.sink, body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!(await affiliateWorkspaceEnabled(a.context)))
    return reply(
      { error: "Esta capacidade ainda não está habilitada para sua conta." },
      404,
    );
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return reply({ error: "Origem inválida." }, 403);
  try {
    const i = await workspaceJson(req, 16000);
    if (i.action === "audience")
      return reply(await saveWorkspaceAudience(a.context, i));
    if (i.action === "registerOffer")
      return reply(await registerWorkspaceOffer(a.context, i));
    if (i.action === "prepareLink")
      return reply(await prepareWorkspaceLink(a.context, i));
    if (!validDraftId(i.id) || !Number.isSafeInteger(i.expectedVersion))
      throw new Error("invalid_input");
    if (i.action === "prepare")
      return reply({ draft: await prepareWorkDraft(a.context, i) });
    if (i.action === "approve")
      return reply({ draft: await approveWorkDraft(a.context, i) });
    if (i.action === "export")
      return reply(await exportWorkDraft(a.context, i));
    if (i.action === "confirm")
      return reply({ draft: await confirmWorkDraft(a.context, i) });
    if (i.action === "render") {
      const draft = await readWorkDraft(a.context, i.id);
      if (draft.version !== i.expectedVersion || draft.state !== "prepared")
        throw new Error("draft_conflict");
      const p = await draftPublication(a.context, draft);
      if (!p) throw new Error("not_found");
      const artifact = await generateKitArtifact(a.context, {
        kitId: p.kit_id,
        expectedVersion: p.kit_version,
        origin: req.nextUrl.origin,
        format: "story",
      });
      return reply({ artifact });
    }
    throw new Error("invalid_input");
  } catch (e) {
    const conflict = e instanceof Error && /conflict/.test(e.message);
    return reply({ error: workspaceError(e) }, conflict ? 409 : 400);
  }
}
