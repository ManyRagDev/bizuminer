import { createHash } from "node:crypto";
import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { storeAffiliateSecret } from "./affiliate-secret.ts";
import { resolveAccountMarketplaceCredentials } from "../../persistence/src/account-credentials.ts";
import { ShopeeAdapter } from "../../capture/src/adapters/shopee/index.ts";
import { AliExpressAdapter } from "../../capture/src/adapters/aliexpress/index.ts";
import type { CaptureAdapter } from "../../capture/src/types.ts";

export const CONNECTION_FIELDS = {
  mercadolivre: ["trackingId", "toolId"],
  shopee: ["appId", "appSecret"],
  aliexpress: ["appKey", "appSecret", "trackingId"],
} as const;
export type StoreName = keyof typeof CONNECTION_FIELDS;
export interface ConnectionView {
  marketplace: StoreName;
  configured: boolean;
  status: "missing" | "configured" | "verified" | "failed";
  checkedAt: string | null;
  configId: string | null;
}
const owner = (c: AccountContext) => {
  if (c.actor !== "human" || !c.actorAppUserId || c.membershipRole !== "owner")
    throw new Error("owner_required");
};
async function ready(tx: any) {
  const [r] =
    await tx`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='affiliate_marketplace_config' and column_name='connection_status') as ready`;
  return r?.ready === true;
}
export async function accountConnections(
  c: AccountContext,
  factory: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      const schemaReady = await ready(tx);
      const rows = await tx<
        any[]
      >`select to_jsonb(c) as config,exists(select 1 from garimpa.affiliate_secret s where s.tenant_id=${c.tenantId} and s.marketplace=c.marketplace and s.status='active') as has_secret from garimpa.affiliate_marketplace_config c where affiliate_id=${c.affiliateId}`;
      const connections: ConnectionView[] = Object.keys(CONNECTION_FIELDS).map(
        (key) => {
          const marketplace = key as StoreName,
            row = rows.find((r) => r.config.marketplace === marketplace),
            r = row?.config;
          const house =
            c.tenantId === "local" &&
            (marketplace === "shopee"
              ? Boolean(
                  process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_SECRET,
                )
              : marketplace === "aliexpress"
                ? Boolean(
                    process.env.ALIEXPRESS_APP_KEY &&
                      process.env.ALIEXPRESS_APP_SECRET &&
                      process.env.ALIEXPRESS_TRACKING_ID,
                  )
                : false);
          const configured = r
            ? r.status === "active" &&
              (marketplace === "mercadolivre"
                ? Boolean(r.tracking_id && r.tool_id)
                : row?.has_secret || house)
            : house;
          return {
            marketplace,
            configured,
            status: configured
              ? (r?.connection_status ?? "configured")
              : "missing",
            checkedAt: r?.connection_checked_at ?? null,
            configId: r?.id ?? null,
          };
        },
      );
      return { schemaReady, connections };
    },
    factory,
  );
}
export async function saveAccountConnection(
  c: AccountContext,
  input: { marketplace: StoreName; fields: Record<string, string> },
  factory: typeof db = db,
) {
  owner(c);
  const keys = CONNECTION_FIELDS[input.marketplace];
  if (
    !keys ||
    keys.some(
      (k) =>
        typeof input.fields?.[k] !== "string" ||
        !input.fields[k]!.trim() ||
        input.fields[k]!.length > 2000,
    )
  )
    throw new Error("invalid_input");
  const fields = Object.fromEntries(
    keys.map((k) => [k, input.fields[k]!.trim()]),
  );
  return withAccountDb(
    c,
    async (tx) => {
      if (!(await ready(tx))) throw new Error("workspace_schema_required");
      if (input.marketplace !== "mercadolivre")
        await storeAffiliateSecret(
          {
            tenantId: c.tenantId,
            marketplace: input.marketplace,
            secretId: "credentials_json",
            secretValue: JSON.stringify(fields),
          },
          tx,
        );
      const version = createHash("sha256")
        .update(JSON.stringify(fields))
        .digest("hex");
      await tx`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status,connection_status,connection_version)
   values(${c.affiliateId},${input.marketplace},${fields.trackingId ?? ""},${fields.toolId ?? ""},'active','configured',${version})
   on conflict(affiliate_id,marketplace) do update set tracking_id=excluded.tracking_id,tool_id=excluded.tool_id,status='active',connection_status='configured',connection_version=excluded.connection_version,connection_checked_at=null,validated_at=null,updated_at=now()`;
      return {
        ok: true,
        message: "Dados salvos. A conexão ainda precisa ser testada.",
      };
    },
    factory,
  );
}
export async function testAccountConnection(
  c: AccountContext,
  marketplace: StoreName,
  factory: typeof db = db,
  adapters: Partial<Record<StoreName, CaptureAdapter>> = {},
) {
  owner(c);
  if (!CONNECTION_FIELDS[marketplace]) throw new Error("invalid_input");
  if (marketplace === "mercadolivre")
    return {
      ok: false,
      message:
        "Abra um link de afiliado e envie a evidência da conferência abaixo.",
    };
  const prepared = await withAccountDb(
    c,
    async (tx) => {
      if (!(await ready(tx))) throw new Error("workspace_schema_required");
      const [config] = await tx<
        any[]
      >`select connection_version from garimpa.affiliate_marketplace_config where affiliate_id=${c.affiliateId} and marketplace=${marketplace} and status='active'`;
      const {
        tenantId: _t,
        marketplace: _m,
        ...secret
      } = await resolveAccountMarketplaceCredentials(
        c.tenantId,
        marketplace,
        tx,
      );
      return {
        secret: secret as Record<string, string>,
        version: config?.connection_version ?? null,
      };
    },
    factory,
  );
  const adapter =
    adapters[marketplace] ??
    (marketplace === "shopee" ? new ShopeeAdapter() : new AliExpressAdapter());
  const ok = await adapter.validateCredential(
    { marketplace, secret: prepared.secret },
    {
      runId: crypto.randomUUID(),
      signal: AbortSignal.timeout(15000),
      log: () => {},
    },
  );
  await withAccountDb(
    c,
    async (tx) => {
      const [current] = await tx<
        any[]
      >`select connection_version from garimpa.affiliate_marketplace_config where affiliate_id=${c.affiliateId} and marketplace=${marketplace} for update`;
      if ((current?.connection_version ?? null) !== prepared.version)
        throw new Error("connection_conflict");
      await tx`insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status,connection_status,connection_checked_at)
   values(${c.affiliateId},${marketplace},${prepared.secret.trackingId ?? ""},'','active',${ok ? "verified" : "failed"},now())
   on conflict(affiliate_id,marketplace) do update set connection_status=excluded.connection_status,connection_checked_at=now()`;
    },
    factory,
  );
  return {
    ok,
    message: ok
      ? "A loja aceitou a conexão. A elegibilidade e a comissão dependem de cada oferta."
      : "A loja recusou a conexão. Revise suas credenciais.",
  };
}
