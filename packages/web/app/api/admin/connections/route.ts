import { NextRequest, NextResponse } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import {
  accountConnections,
  saveAccountConnection,
  testAccountConnection,
} from "../../../../lib/account-connections.ts";
import { workspaceError } from "../../../../lib/affiliate-workspace-contract.ts";
import { workspaceJson } from "../../../../lib/workspace-request.ts";
export const dynamic = "force-dynamic";
async function handle(req: NextRequest, write = false) {
  const access = await checkAffiliateUser(req);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: "Entre novamente para acessar sua conta." },
      { status: 403 },
    );
  const reply = (body: unknown, status = 200) =>
    sinkJson(access.sink, body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (write && req.headers.get("origin") !== req.nextUrl.origin)
    return reply({ error: "Origem inválida." }, 403);
  try {
    if (!write) return reply(await accountConnections(access.context));
    const input = await workspaceJson(req, 16000);
    return reply(
      input.action === "test"
        ? await testAccountConnection(access.context, input.marketplace)
        : await saveAccountConnection(access.context, input),
    );
  } catch (e) {
    return reply({ error: workspaceError(e) }, 400);
  }
}
export const GET = (r: NextRequest) => handle(r);
export const POST = (r: NextRequest) => handle(r, true);
