import { NextRequest } from "next/server";
import { resolveAuthorizedAccount } from "../../../../../lib/api-auth.ts";
import { downloadPrivateArtifact } from "../../../../../lib/private-artifact-db.ts";
import { withAccountDb } from "../../../../../lib/tenant-db.ts";
import {
  lockedKit,
  validateStored,
  preparePublicationExport,
} from "../../../../../lib/commercial-workflow.ts";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await resolveAuthorizedAccount(
    request,
    request.nextUrl.searchParams.get("conta") ??
      request.cookies.get("bm_account")?.value,
  );
  if (access.kind !== "ok")
    return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const file = await downloadPrivateArtifact(
      access.context,
      (await params).id,
    );
    if (file.metadata.kind === "kit_render") {
      const owner = await withAccountDb(access.context, async (tx) => {
        const [pub] = await tx<
          any[]
        >`select p.*,k.version as kit_version from garimpa.campaign_publication p join garimpa.commercial_kit k on k.id=p.kit_id and k.tenant_id=p.tenant_id where p.kit_revision_id=${file.metadata.owner_ref} and p.tenant_id=${access.context.tenantId}`;
        if (!pub) throw new Error("revision_not_found");
        const kit = await lockedKit(
            tx,
            access.context.tenantId,
            pub.kit_id,
            pub.kit_version,
          ),
          checked = await validateStored(tx, access.context, kit);
        if (
          kit.revision_id !== file.metadata.owner_ref ||
          kit.content_digest !== file.metadata.rights.sourceDigest ||
          checked.errors.length
        )
          throw new Error("render_stale");
        return pub;
      });
      if (request.nextUrl.searchParams.get("preview") !== "1")
        await preparePublicationExport(access.context, {
          publicationId: owner.id,
          expectedVersion: owner.version,
        });
    }
    return new Response(file.bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "artifact_unavailable" }, { status: 404 });
  }
}
