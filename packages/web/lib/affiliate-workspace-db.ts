import { shareBaseUrl } from "./site-url.ts";
import { generateShortCode } from "./short-code.ts";
import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { inAccountScope } from "./account-scope.ts";
import { getEditorialSelectionDesk } from "./editorial-selection-db.ts";
import {
  workspaceOffer,
  friendlyWorkspaceBlocker,
  type WorkDraft,
} from "./affiliate-workspace-contract.ts";
import {
  composeRecommendations,
  defaultChannelPolicy,
  validateChannelPolicy,
  RECOMMENDATION_POLICY_VERSION,
  type RecommendationChannel,
} from "./recommendation-policy.ts";
import { toWorkDraft, workDraftSchemaReady } from "./work-draft-db.ts";
import {
  createKitForAccount,
  validateKitForAccount,
  approveKitForAccount,
  preparePublicationExport,
  markPublicationExported,
  confirmPublication,
} from "./commercial-workflow.ts";

export function workspaceTransaction(tx: any): typeof db {
  return (() =>
    Object.assign((...args: any[]) => tx(...args), {
      unsafe: tx.unsafe.bind(tx),
      json: tx.json.bind(tx),
      begin: async (...args: any[]) => args.at(-1)(tx),
      end: async () => {},
    })) as typeof db;
}
export async function affiliateWorkspaceEnabled(
  c: AccountContext,
  factory: typeof db = db,
) {
  // Local preview is available before rollout; an explicit database flag wins.
  const preview =
    process.env.NODE_ENV === "development" && c.tenantId === "local";
  return withAccountDb(
    c,
    async (tx) => {
      const [r] =
        await tx`select to_regclass('garimpa.workspace_rollout') is not null as ready`;
      if (!r?.ready) return preview;
      const [flag] =
        await tx`select enabled from garimpa.workspace_rollout where tenant_id=${c.tenantId}`;
      return flag ? flag.enabled === true : preview;
    },
    factory,
  );
}
export async function workspaceOffers(
  c: AccountContext,
  productId?: string,
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) =>
      inAccountScope(c, async () => {
        const desk = await getEditorialSelectionDesk(
          c.tenantId,
          workspaceTransaction(tx),
          productId,
          true,
        );
        const offers = desk.candidates.map(workspaceOffer);
        const eligible = offers
          .filter(
            (o) => !o.blockers.whatsapp.length || !o.blockers.stories.length,
          )
          .map((o) => o.candidate.id);
        const links = eligible.length
          ? await tx<
              any[]
            >`select pub.product_id,bool_or(exists(select 1 from garimpa.public_monetized_target(pub.slug))) as ready
          from garimpa.publication pub where pub.tenant_id=${c.tenantId} and pub.affiliate_id=${c.affiliateId} and pub.product_id=any(${eligible}) and pub.channel='web' and pub.status='active' group by pub.product_id`
          : [];
        for (const offer of offers)
          if (
            !desk.publishedProductIds.includes(offer.candidate.id) ||
            (eligible.includes(offer.candidate.id) &&
              !links.some(
                (r) => r.product_id === offer.candidate.id && r.ready,
              ))
          )
            for (const channel of ["whatsapp", "stories"] as const)
              offer.blockers[channel].push(
                "Prepare o link de afiliado desta oferta com os dados da sua conta.",
              );
        const host = shareBaseUrl().replace(/\/$/, "");
        const slugs = offers.map((o) => o.candidate.slug);
        const codes = new Map<string, string>();
        if (slugs.length) {
          try {
            const existing = await tx<{ code: string; slug: string }[]>`
              select code, slug from garimpa.short_link
              where tenant_id = ${c.tenantId} and slug = any(${slugs})
            `;
            for (const row of existing) codes.set(row.slug, row.code);
            const missing = slugs.filter((s) => !codes.has(s));
            if (missing.length > 0) {
              const missingCodes = missing.map(() => generateShortCode());
              const inserted = await tx<{ code: string; slug: string }[]>`
                insert into garimpa.short_link (code, tenant_id, slug)
                select m.code, ${c.tenantId}, m.slug
                from unnest(${missing}::text[], ${missingCodes}::text[]) as m(slug, code)
                on conflict (tenant_id, slug) do nothing
                returning code, slug
              `.catch(() => []);
              for (const row of inserted) codes.set(row.slug, row.code);
            }
          } catch {
            // Graceful fallback: /bizu/<slug> if short links are not available
          }
        }

        const candidateIds = offers.map((o) => o.candidate.id);
        const watchersMap = new Map<string, number>();
        if (candidateIds.length > 0) {
          try {
            const counts = await tx<any[]>`
              select product_id, count(*)::int as cnt from (
                select product_id from garimpa.price_watch where product_id = any(${candidateIds})
                union all
                select product_id from garimpa.favorite where product_id = any(${candidateIds})
              ) w group by product_id
            `;
            for (const row of counts) {
              watchersMap.set(row.product_id, Number(row.cnt) || 0);
            }
          } catch {
            // Keep default 0 if tables are unmigrated or unavailable
          }
        }

        for (let i = 0; i < offers.length; i++) {
          const offer = offers[i];
          const code = codes.get(offer.candidate.slug);
          offer.shortCode = code;
          offer.shareUrl = code
            ? `${host}/p/${code}${offer.candidate.offerOptionKey ? `?opcao=${offer.candidate.offerOptionKey}` : ""}`
            : `${host}/bizu/${offer.candidate.slug}${offer.candidate.offerOptionKey ? `?opcao=${offer.candidate.offerOptionKey}` : ""}`;
          offer.storyUrl = `/api/story/${encodeURIComponent(offer.candidate.slug)}${offer.candidate.offerOptionKey ? `?opcao=${offer.candidate.offerOptionKey}` : ""}`;
          offer.bioCode = code ? `#${code.slice(-3).toUpperCase()}` : `#${i + 101}`;
          offer.watchersCount = watchersMap.get(offer.candidate.id) ?? 0;
        }

        const [ready] =
          await tx`select to_regclass('garimpa.recommendation_channel') is not null as ready`;
        if (ready?.ready)
          for (const channel of ["whatsapp", "stories"] as const) {
            const [config] = await tx<
              any[]
            >`select * from garimpa.recommendation_channel where tenant_id=${c.tenantId} and channel=${channel}`;
            const rows = await tx<
              any[]
            >`select product_id,option_key,price_cents,confirmed_at from garimpa.recommendation_exposure where tenant_id=${c.tenantId} and channel=${channel} and confirmed_at>now()-interval '30 days'`;
            const policy =
              validateChannelPolicy(config?.policy) ??
              defaultChannelPolicy(channel);
            const composed = composeRecommendations(
              offers
                .filter((o) =>
                  links.some((r) => r.product_id === o.candidate.id && r.ready),
                )
                .map((o) => o.candidate),
              channel,
              policy,
              rows.map((r) => ({
                productId: r.product_id,
                optionKey: r.option_key,
                priceCents: r.price_cents,
                confirmedAt: new Date(r.confirmed_at).toISOString(),
              })),
              new Date(),
              config?.manual_order ?? undefined,
            );
            for (const offer of offers) {
              const extra =
                composed.excluded.find(
                  (e) => e.productId === offer.candidate.id,
                )?.reasons ?? [];
              const disabled =
                !config?.enabled ||
                !validateChannelPolicy(config?.policy) ||
                config.policy_version !== RECOMMENDATION_POLICY_VERSION ||
                (config.valid_until &&
                  Date.parse(config.valid_until) <= Date.now());
              offer.blockers[channel] = [
                ...new Set(
                  [
                    ...offer.blockers[channel],
                    ...extra,
                    ...(disabled
                      ? [
                          "Ative ou revise este canal nas configurações da conta.",
                        ]
                      : []),
                  ].map(friendlyWorkspaceBlocker),
                ),
              ];
            }
          }
        return { ready: desk.schemaReady, offers };
      }),
    factory,
  );
}
export async function workspaceSettings(
  c: AccountContext,
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await workDraftSchemaReady(tx)))
        return {
          ready: false,
          version: 0,
          audience: "",
          policyId: null,
          channels: [],
        };
      const [r] = await tx<
        any[]
      >`select s.version,s.audience_policy_version_id,p.config from garimpa.workspace_settings s join garimpa.audience_policy_version p on p.id=s.audience_policy_version_id and p.tenant_id=s.tenant_id where s.tenant_id=${c.tenantId}`;
      const channels = await tx<
        any[]
      >`select channel,enabled,policy,version,manual_order,valid_until,policy_version from garimpa.recommendation_channel where tenant_id=${c.tenantId}`;
      return {
        ready: true,
        version: r?.version ?? 0,
        audience: r?.config?.audience ?? "",
        policyId: r?.audience_policy_version_id ?? null,
        channels,
      };
    },
    factory,
  );
}
export async function saveWorkspaceAudience(
  c: AccountContext,
  input: { audience: string; expectedVersion: number },
  factory: typeof db = db,
) {
  if (c.membershipRole !== "owner" || !c.actorAppUserId)
    throw new Error("owner_required");
  if (
    typeof input.audience !== "string" ||
    input.audience.trim().length < 5 ||
    input.audience.length > 1000 ||
    !Number.isSafeInteger(input.expectedVersion)
  )
    throw new Error("invalid_input");
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await workDraftSchemaReady(tx)))
        throw new Error("workspace_schema_required");
      await tx`select pg_advisory_xact_lock(hashtextextended(${`workspace-settings:${c.tenantId}`},0))`;
      const [old] = await tx<
        any[]
      >`select version from garimpa.workspace_settings where tenant_id=${c.tenantId}`;
      if ((old?.version ?? 0) !== input.expectedVersion)
        throw new Error("settings_conflict");
      const [policy] = await tx<
        any[]
      >`insert into garimpa.audience_policy(tenant_id,name,status) values(${c.tenantId},${input.audience.trim().slice(0, 200)},'draft') returning id`;
      const [version] = await tx<
        any[]
      >`insert into garimpa.audience_policy_version(tenant_id,policy_id,version,config) values(${c.tenantId},${policy.id},'manual-1',${tx.json({ schemaVersion: 1, audience: input.audience.trim(), mode: "manual", rubricStatus: "not_homologated" })}) returning id`;
      await tx`insert into garimpa.workspace_settings(tenant_id,audience_policy_version_id,updated_by) values(${c.tenantId},${version.id},${c.actorAppUserId}) on conflict(tenant_id) do update set audience_policy_version_id=excluded.audience_policy_version_id,version=garimpa.workspace_settings.version+1,updated_by=excluded.updated_by,updated_at=now()`;
      return { ok: true };
    },
    factory,
  );
}
export async function draftPublication(
  c: AccountContext,
  draft: WorkDraft,
  factory: typeof db = db,
) {
  if (!draft.publicationId) return null;
  return withAccountDb(
    c,
    async (tx) => {
      const [p] = await tx<
        any[]
      >`select p.id,p.version,p.status,p.kit_id,k.version as kit_version,k.status as kit_status,l.code,r.snapshot,r.materials
   from garimpa.campaign_publication p join garimpa.commercial_kit k on k.id=p.kit_id and k.tenant_id=p.tenant_id
   join garimpa.commercial_kit_revision r on r.id=p.kit_revision_id and r.tenant_id=p.tenant_id
   join garimpa.campaign_link l on l.publication_id=p.id and l.tenant_id=p.tenant_id
   where p.id=${draft.publicationId} and p.tenant_id=${c.tenantId}`;
      return p ?? null;
    },
    factory,
  );
}
export async function prepareWorkDraft(
  c: AccountContext,
  input: { id: string; expectedVersion: number },
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) =>
      inAccountScope(c, async () => {
        if (!(await workDraftSchemaReady(tx)))
          throw new Error("workspace_schema_required");
        const f = workspaceTransaction(tx);
        const [r] = await tx<
          any[]
        >`select * from garimpa.work_draft where id=${input.id}::uuid and tenant_id=${c.tenantId} for update`;
        if (!r) throw new Error("not_found");
        if (r.version !== input.expectedVersion)
          throw new Error("draft_conflict");
        if (r.publication_id && ["review", "prepared"].includes(r.state))
          return toWorkDraft(r);
        if (
          r.author_id !== c.actorAppUserId ||
          r.state !== "editing" ||
          !r.product_id ||
          !r.option_key
        )
          throw new Error("offer_unavailable");
        if (!["whatsapp", "stories"].includes(r.channel))
          throw new Error("invalid_input");
        const { offers } = await workspaceOffers(c, r.product_id, f),
          offer = offers.find((o) => o.candidate.id === r.product_id);
        const channel: RecommendationChannel =
          r.channel === "whatsapp" ? "whatsapp" : "stories";
        if (!offer || offer.blockers[channel].length)
          throw new Error("offer_unavailable");
        if (
          offer.reference.optionKey !== r.option_key ||
          offer.reference.observationId !== r.content.observationId ||
          offer.reference.evidenceFingerprint !== r.content.evidenceFingerprint
        )
          throw new Error("option_changed");
        const settings = await workspaceSettings(c, f);
        if (!settings.policyId) throw new Error("policy_required");
        const kit = await createKitForAccount(
          c,
          {
            campaignId: null,
            audiencePolicyVersionId: settings.policyId,
            workspaceAuthorId: c.actorAppUserId!,
            productId: r.product_id,
            optionKey: r.option_key,
            channel:
              r.channel === "whatsapp"
                ? "whatsapp_channel"
                : "instagram_stories",
            reason: offer.candidate.assessment!.publicRationale,
            copy: r.content.text,
            assetIds: r.content.assetIds,
            requestId: `draft-${r.id}-${r.version}`,
          },
          f,
        );
        const state = c.membershipRole === "owner" ? "prepared" : "review";
        if (c.membershipRole === "owner") {
          const validated = await validateKitForAccount(
            c,
            {
              kitId: kit.kitId,
              expectedVersion: kit.kitVersion,
              requestId: `validate-${r.id}-${r.version}`,
            },
            f,
          );
          if (!validated.valid)
            throw new Error("kit_invalid:" + validated.blockers.join(","));
          await approveKitForAccount(
            c,
            {
              kitId: kit.kitId,
              expectedVersion: validated.kitVersion,
              requestId: `approve-${r.id}-${r.version}`,
            },
            f,
          );
        }
        const [saved] = await tx<
          any[]
        >`update garimpa.work_draft set state=${state},publication_id=${kit.publicationId},version=version+1,updated_at=now() where id=${r.id}::uuid and tenant_id=${c.tenantId} returning *`;
        return toWorkDraft(saved);
      }),
    factory,
  );
}
export async function approveWorkDraft(
  c: AccountContext,
  input: { id: string; expectedVersion: number },
  factory: typeof db = db,
) {
  if (c.membershipRole !== "owner") throw new Error("owner_required");
  return withAccountDb(
    c,
    async (tx) => {
      const f = workspaceTransaction(tx),
        [r] = await tx<
          any[]
        >`select * from garimpa.work_draft where id=${input.id}::uuid and tenant_id=${c.tenantId} for update`;
      if (!r || r.state !== "review" || r.version !== input.expectedVersion)
        throw new Error("draft_conflict");
      const p = await draftPublication(c, toWorkDraft(r), f);
      if (!p) throw new Error("not_found");
      const validated = await validateKitForAccount(
        c,
        {
          kitId: p.kit_id,
          expectedVersion: p.kit_version,
          requestId: `validate-review-${r.id}-${r.version}`,
        },
        f,
      );
      if (!validated.valid)
        throw new Error("kit_invalid:" + validated.blockers.join(","));
      await approveKitForAccount(
        c,
        {
          kitId: p.kit_id,
          expectedVersion: validated.kitVersion,
          requestId: `approve-review-${r.id}-${r.version}`,
        },
        f,
      );
      const [saved] = await tx<
        any[]
      >`update garimpa.work_draft set state='prepared',version=version+1,updated_at=now() where id=${r.id}::uuid and tenant_id=${c.tenantId} returning *`;
      return toWorkDraft(saved);
    },
    factory,
  );
}
export async function exportWorkDraft(
  c: AccountContext,
  input: { id: string; expectedVersion: number; confirmCopy?: boolean },
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      const f = workspaceTransaction(tx),
        [r] = await tx<
          any[]
        >`select * from garimpa.work_draft where id=${input.id}::uuid and tenant_id=${c.tenantId} for update`;
      if (!r || r.version !== input.expectedVersion || r.state !== "prepared")
        throw new Error("draft_conflict");
      const p = await draftPublication(c, toWorkDraft(r), f);
      if (!p) throw new Error("not_found");
      const result = await preparePublicationExport(
        c,
        { publicationId: p.id, expectedVersion: p.version },
        f,
      );
      if (input.confirmCopy) {
        const marked = await markPublicationExported(
          c,
          {
            publicationId: p.id,
            expectedVersion: p.version,
            requestId: `export-${r.id}-${p.version}`,
          },
          f,
        );
        if (!marked.exported) throw new Error("offer_unavailable");
      }
      return result;
    },
    factory,
  );
}
export async function confirmWorkDraft(
  c: AccountContext,
  input: { id: string; expectedVersion: number; publicationUrl?: string },
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      const f = workspaceTransaction(tx),
        [r] = await tx<
          any[]
        >`select * from garimpa.work_draft where id=${input.id}::uuid and tenant_id=${c.tenantId} for update`;
      if (!r) throw new Error("not_found");
      if (r.state === "published") return toWorkDraft(r);
      if (r.version !== input.expectedVersion || r.state !== "prepared")
        throw new Error("draft_conflict");
      const p = await draftPublication(c, toWorkDraft(r), f);
      if (!p) throw new Error("not_found");
      await confirmPublication(
        c,
        {
          publicationId: p.id,
          expectedVersion: p.version,
          requestId: `confirm-${r.id}-${r.version}`,
          publicationUrl: input.publicationUrl,
        },
        f,
      );
      const [saved] = await tx<
        any[]
      >`update garimpa.work_draft set state='published',version=version+1,updated_at=now() where id=${r.id}::uuid and tenant_id=${c.tenantId} returning *`;
      return toWorkDraft(saved);
    },
    factory,
  );
}
