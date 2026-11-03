import { NextRequest, NextResponse } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import {
  listWorkDrafts,
  readWorkDraft,
  saveWorkDraft,
  changeDraftState,
} from "../../../../lib/work-draft-db.ts";
import { workspaceError } from "../../../../lib/affiliate-workspace-contract.ts";
import { workspaceJson } from "../../../../lib/workspace-request.ts";
import { affiliateWorkspaceEnabled } from "../../../../lib/affiliate-workspace-db.ts";
export const dynamic = "force-dynamic";
async function handle(req: NextRequest, write = false) {
  const a = await checkAffiliateUser(req);
  if (a.kind !== "ok")
    return NextResponse.json(
      { error: "Entre novamente para acessar seus rascunhos." },
      { status: 403 },
    );
  const reply = (body: unknown, status = 200) =>
    sinkJson(a.sink, body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!(await affiliateWorkspaceEnabled(a.context)))
    return reply(
      {
        error:
          "O novo espaço de divulgações ainda não está habilitado nesta conta.",
      },
      404,
    );
  if (write && req.headers.get("origin") !== req.nextUrl.origin)
    return reply({ error: "Origem inválida." }, 403);
  try {
    if (!write) {
      const id = req.nextUrl.searchParams.get("id");
      return reply(
        id
          ? { draft: await readWorkDraft(a.context, id) }
          : await listWorkDrafts(a.context),
      );
    }
    const i = await workspaceJson(req);
    return reply({
      draft:
        i.action === "state"
          ? await changeDraftState(a.context, i)
          : await saveWorkDraft(a.context, i),
    });
  } catch (e) {
    const conflict = e instanceof Error && /conflict/.test(e.message);
    return reply({ error: workspaceError(e), conflict }, conflict ? 409 : 400);
  }
}
export const GET = (r: NextRequest) => handle(r);
export const POST = (r: NextRequest) => handle(r, true);
