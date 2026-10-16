import { NextRequest } from "next/server";
import {
  resolveAuthorizedAccount,
  checkAffiliateUser,
} from "../../../../../lib/api-auth.ts";
import { savePrivateArtifact } from "../../../../../lib/private-artifact-db.ts";
import sharp from "sharp";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const session = await checkAffiliateUser(request);
  if (session.kind !== "ok")
    return Response.json({ error: "forbidden" }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 11 * 1024 * 1024)
    return Response.json({ error: "file_too_large" }, { status: 413 });
  const f = await request.formData(),
    access = await resolveAuthorizedAccount(
      request,
      String(f.get("tenantId") ?? ""),
    );
  if (access.kind !== "ok")
    return Response.json({ error: "forbidden" }, { status: 403 });
  const file = f.get("file"),
    kind = String(f.get("kind"));
  if (
    !(file instanceof File) ||
    !["kit_asset", "account_evidence"].includes(kind) ||
    file.size > 10 * 1024 * 1024 ||
    file.size === 0
  )
    return Response.json({ error: "invalid_file" }, { status: 400 });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let mime = file.type;
    if (kind === "kit_asset" || mime.startsWith("image/")) {
      const meta = await sharp(bytes, {
        limitInputPixels: 16000000,
      }).metadata();
      if (!["png", "jpeg", "webp"].includes(meta.format ?? ""))
        throw new Error("supported_image_required");
      mime = meta.format === "jpeg" ? "image/jpeg" : "image/" + meta.format;
    } else if (
      mime !== "application/pdf" ||
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
    )
      throw new Error("evidence_pdf_or_image_required");
    const rights =
      kind === "kit_asset"
        ? {
            status: String(f.get("rightsStatus")),
            sourceRef: String(f.get("rightsSource") ?? ""),
            channels: String(f.get("channels") ?? "").split(",").map(value => value.trim()).filter(Boolean),
            validUntil: String(f.get("rightsUntil") || ""),
          }
        : {};
    if (
      kind === "kit_asset" &&
      (access.context.membershipRole !== "owner" ||
        !["owned", "licensed"].includes((rights as any).status) ||
        !(rights as any).sourceRef.trim())
    )
      throw new Error("owner_asset_rights_required");
    const result = await savePrivateArtifact(access.context, {
      kind: kind as "kit_asset" | "account_evidence",
      name: file.name,
      bytes,
      mime,
      rights,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
