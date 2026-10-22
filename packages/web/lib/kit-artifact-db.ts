import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import { lockedKit, validateStored } from "./commercial-workflow.ts";
import { renderKitPng, resolveKitFormat, kitTemplateVersion, type KitArtifactFormat } from "./kit-renderer.ts";
import {
  savePrivateArtifact,
  downloadPrivateArtifact,
  type PrivateObjectStore,
} from "./private-artifact-db.ts";
export async function generateKitArtifact(
  c: AccountContext,
  i: { kitId: string; expectedVersion: number; origin: string; format?: KitArtifactFormat },
  factory: typeof db = db,
  store?: PrivateObjectStore,
) {
  const prepared = await withAccountDb(
    c,
    async (tx) => {
      const kit = await lockedKit(tx, c.tenantId, i.kitId, i.expectedVersion),
        checked = await validateStored(tx, c, kit);
      if (checked.errors.length)
        throw new Error("kit_invalid:" + checked.errors.join(","));
      const material = kit.materials[0];
      if (!material) throw new Error("material_required");
      const [link] = await tx<
        any[]
      >`select code from garimpa.campaign_link where id=${material.campaignLinkId!} and tenant_id=${c.tenantId} and monetization_status='valid'`;
      if (!link) throw new Error("link_invalid");
      return { kit, material, link };
    },
    factory,
  );
  const assetId = prepared.material.assetRefs?.[0],
    asset = assetId
      ? await downloadPrivateArtifact(c, assetId, factory, store)
      : null;
  const format=resolveKitFormat(prepared.material.channel,i.format);
  const templateVersion=kitTemplateVersion(format);
  const bytes = await renderKitPng(
    prepared.kit.snapshot,
    prepared.material,
    new URL("/p/" + prepared.link.code, i.origin).toString(),
    asset?.bytes,
    format,
  );
  const artifact = await savePrivateArtifact(
    c,
    {
      kind: "kit_render",
      name: `kit-${templateVersion}-${prepared.kit.revision_id}.png`,
      bytes,
      mime: "image/png",
      ownerRef: prepared.kit.revision_id,
      rights: {
        templateVersion,
        format,
        sourceDigest: prepared.kit.content_digest,
      },
    },
    factory,
    store,
  );
  // Rendering/upload is external to SQL. Reject stale approval/facts after I/O as well.
  await withAccountDb(
    c,
    async (tx) => {
      const kit = await lockedKit(tx, c.tenantId, i.kitId, i.expectedVersion);
      const checked = await validateStored(tx, c, kit);
      if (kit.revision_id !== prepared.kit.revision_id || checked.errors.length)
        throw new Error("render_became_stale");
    },
    factory,
  );
  return { ...artifact, revisionId: prepared.kit.revision_id };
}
