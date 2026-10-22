import type postgres from "postgres";
import { db } from "./db.ts";
import { withAccountDb, validTenantId, type AccountContext } from "./tenant-db.ts";
import {
  type WorkbenchAction,
  type WorkbenchActionType,
  type WorkbenchItem,
  type WorkbenchPage,
  type WorkbenchQuery,
  compareWorkbenchActions,
  decodeWorkbenchCursor,
  encodeWorkbenchCursor,
} from "./workbench-contract.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

interface ProductBaseRow {
  productId: string;
  title: string;
  marketplace: string;
  externalId: string;
  priceCents: number;
  imageUrl: string | null;
  category: string | null;
  familyKey: string | null;
  freshestObservedAt?: string;
}

/**
 * Consulta unificada e paginada da Bancada de Trabalho do Operador.
 * Executada sob transação isolada de AccountContext com RLS ativo.
 */
export async function getWorkbenchPage(
  context: AccountContext,
  query?: WorkbenchQuery,
  sqlFactory: typeof db = db,
): Promise<WorkbenchPage> {
  if (!validTenantId(context.tenantId)) {
    throw new Error("tenant_id inválido");
  }

  const limit = Math.max(1, Math.min(query?.limit ?? 20, 100));
  const filterAction = query?.filterActionType;
  const filterMarketplace = query?.filterMarketplace;
  const cursor = query?.cursor ? decodeWorkbenchCursor(query.cursor) : null;

  return await withAccountDb(
    context,
    async (tx) => {
      const productMap = new Map<string, ProductBaseRow>();
      const actionMap = new Map<string, WorkbenchAction[]>();

      const addAction = (prod: ProductBaseRow, action: WorkbenchAction) => {
        if (!productMap.has(prod.productId)) {
          productMap.set(prod.productId, prod);
        }
        const existing = actionMap.get(prod.productId) ?? [];
        existing.push(action);
        actionMap.set(prod.productId, existing);
      };

      // 1. Curadoria Humana Pendente / Retida / Adiamento vencido
      const curationRows = await tx<{
        product_id: string;
        title: string;
        marketplace: string;
        external_id: string;
        last_price_cents: number;
        image_url: string | null;
        category: string | null;
        family_key: string | null;
        status: string;
        reason_code: string | null;
        reason_detail: string | null;
        actionable_since: string;
        observed_at: string | null;
      }[]>`
        select
          p.id as product_id,
          p.title,
          p.marketplace,
          p.external_id,
          coalesce(p.last_price_cents, 0) as last_price_cents,
          p.image_url,
          p.category,
          p.family_key,
          pc.status,
          pc.reason_code,
          pc.reason_detail,
          coalesce(pc.updated_at, pc.created_at, p.created_at)::text as actionable_since,
          p.last_seen_at::text as observed_at
        from garimpa.product p
        join garimpa.product_curation pc on pc.product_id = p.id and pc.tenant_id = p.tenant_id
        where p.tenant_id = ${context.tenantId}
          and (
            pc.status in ('pending', 'awaiting', 'held')
            or (pc.status = 'deferred' and pc.deferred_until is not null and pc.deferred_until <= clock_timestamp())
          )
      `;

      for (const r of curationRows) {
        const prod: ProductBaseRow = {
          productId: r.product_id,
          title: r.title,
          marketplace: r.marketplace,
          externalId: r.external_id,
          priceCents: Number(r.last_price_cents) || 0,
          imageUrl: r.image_url,
          category: r.category,
          familyKey: r.family_key,
          freshestObservedAt: r.observed_at ?? undefined,
        };

        const isHeld = r.status === "held";
        const isDoubtful = Boolean(r.reason_code && (r.reason_code.includes("range") || r.reason_code.includes("doubt") || r.reason_code.includes("anomaly")));
        const suggestedDecision = isHeld || isDoubtful ? "held" : "approved";
        const action: WorkbenchAction = {
          id: `curation:${r.product_id}`,
          actionType: "review_curation",
          label: isHeld ? "Avaliar oferta retida" : "Revisar triagem pendente",
          href: isHeld ? `/admin/curadoria?aba=excecoes&sub=retidos` : `/admin/curadoria?aba=excecoes&sub=singulars`,
          reason: r.reason_detail || r.reason_code || (isHeld ? "Oferta em retenção" : "Pendente de decisão"),
          actionableSince: new Date(r.actionable_since).toISOString(),
          suggestedDecision,
        };

        addAction(prod, action);
      }

      // 2. Oportunidades Comerciais (Radar / Priorizadas)
      try {
        const oppRows = await tx<{
          opp_id: string;
          product_id: string;
          title: string;
          marketplace: string;
          external_id: string;
          last_price_cents: number;
          image_url: string | null;
          category: string | null;
          family_key: string | null;
          state: string;
          opp_class: string;
          audience_key: string;
          channel: string;
          reasons: string[];
          actionable_since: string;
          observed_at: string | null;
        }[]>`
          select
            o.id as opp_id,
            p.id as product_id,
            p.title,
            p.marketplace,
            p.external_id,
            coalesce(p.last_price_cents, 0) as last_price_cents,
            p.image_url,
            p.category,
            p.family_key,
            o.state,
            o.class as opp_class,
            o.audience_key,
            o.channel,
            o.reasons,
            coalesce(o.updated_at, o.created_at)::text as actionable_since,
            p.last_seen_at::text as observed_at
          from garimpa.opportunity o
          join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
          where o.tenant_id = ${context.tenantId}
            and o.state in ('candidate', 'monitored', 'prioritized')
            and (o.valid_until is null or o.valid_until > clock_timestamp())
        `;

        for (const r of oppRows) {
          const prod: ProductBaseRow = {
            productId: r.product_id,
            title: r.title,
            marketplace: r.marketplace,
            externalId: r.external_id,
            priceCents: Number(r.last_price_cents) || 0,
            imageUrl: r.image_url,
            category: r.category,
            familyKey: r.family_key,
            freshestObservedAt: r.observed_at ?? undefined,
          };

          let actionType: WorkbenchActionType = "monitor_radar";
          let label = "Acompanhar no Radar";
          let href = `/admin/curadoria?aba=radar`;

          if (r.state === "prioritized") {
            actionType = "create_kit_draft";
            label = "Criar rascunho de kit";
            href = `/admin/campanhas?conta=${encodeURIComponent(context.tenantId)}&productId=${encodeURIComponent(r.product_id)}&opportunityId=${encodeURIComponent(r.opp_id)}&channel=${encodeURIComponent(r.channel)}&audienceKey=${encodeURIComponent(r.audience_key)}`;
          } else if (r.state === "candidate") {
            actionType = "review_evidence";
            label = "Revisar evidências da oportunidade";
            href = `/admin/curadoria?aba=radar`;
          }

          const action: WorkbenchAction = {
            id: `opp:${r.opp_id}`,
            actionType,
            label,
            href,
            reason: r.reasons?.[0] ?? `Classe ${r.opp_class}`,
            actionableSince: new Date(r.actionable_since).toISOString(),
            opportunityId: r.opp_id,
            audienceKey: r.audience_key,
            channel: r.channel,
          };

          addAction(prod, action);
        }
      } catch (err: any) {
        // Ignora graciosamente caso a tabela de oportunidades ainda não tenha sido criada no ambiente
        if (err?.code !== "42P01") throw err;
      }

      // 3. Kits Comerciais e Publicações
      try {
        const kitRows = await tx<{
          kit_id: string;
          kit_status: string;
          opportunity_id: string;
          product_id: string;
          title: string;
          marketplace: string;
          external_id: string;
          last_price_cents: number;
          image_url: string | null;
          category: string | null;
          family_key: string | null;
          audience_key: string;
          channel: string;
          pub_id: string | null;
          pub_status: string | null;
          actionable_since: string;
          observed_at: string | null;
        }[]>`
          select
            k.id as kit_id,
            k.status as kit_status,
            o.id as opportunity_id,
            p.id as product_id,
            p.title,
            p.marketplace,
            p.external_id,
            coalesce(p.last_price_cents, 0) as last_price_cents,
            p.image_url,
            p.category,
            p.family_key,
            o.audience_key,
            o.channel,
            pub.id as pub_id,
            pub.status as pub_status,
            coalesce(pub.created_at, k.created_at)::text as actionable_since,
            p.last_seen_at::text as observed_at
          from garimpa.commercial_kit k
          join garimpa.opportunity o on o.id = k.opportunity_id and o.tenant_id = k.tenant_id
          join garimpa.product p on p.id = o.product_id and p.tenant_id = o.tenant_id
          left join garimpa.campaign_publication pub on pub.kit_id = k.id and pub.tenant_id = k.tenant_id
          where k.tenant_id = ${context.tenantId}
            and k.status in ('draft', 'validating', 'needs_revision', 'approved')
        `;

        for (const r of kitRows) {
          const prod: ProductBaseRow = {
            productId: r.product_id,
            title: r.title,
            marketplace: r.marketplace,
            externalId: r.external_id,
            priceCents: Number(r.last_price_cents) || 0,
            imageUrl: r.image_url,
            category: r.category,
            familyKey: r.family_key,
            freshestObservedAt: r.observed_at ?? undefined,
          };

          let actionType: WorkbenchActionType = "revise_kit";
          let label = "Revisar kit comercial";
          let href = `/admin/campanhas?conta=${encodeURIComponent(context.tenantId)}&productId=${encodeURIComponent(r.product_id)}`;

          if (r.kit_status === "validating") {
            actionType = "approve_kit";
            label = "Aprovar kit comercial";
          } else if (r.kit_status === "approved") {
            if (r.pub_status === "exported") {
              actionType = "confirm_publication";
              label = "Confirmar publicação";
              href = `/admin/campanhas?conta=${encodeURIComponent(context.tenantId)}&productId=${encodeURIComponent(r.product_id)}`;
            } else if (r.pub_status === "failed") {
              actionType = "reconcile_publication";
              label = "Reconciliar publicação falha";
            } else {
              actionType = "export_kit";
              label = "Exportar material do kit";
            }
          }

          const action: WorkbenchAction = {
            id: `kit:${r.kit_id}${r.pub_id ? `:${r.pub_id}` : ""}`,
            actionType,
            label,
            href,
            reason: `Kit em status ${r.kit_status}`,
            actionableSince: new Date(r.actionable_since).toISOString(),
            opportunityId: r.opportunity_id,
            audienceKey: r.audience_key,
            channel: r.channel,
            kitId: r.kit_id,
            publicationId: r.pub_id ?? undefined,
          };

          addAction(prod, action);
        }
      } catch (err: any) {
        if (err?.code !== "42P01") throw err;
      }

      // 4. Montagem e ordenação dos WorkbenchItems
      const items: WorkbenchItem[] = [];
      let totalActionsCount = 0;

      for (const [productId, prod] of productMap.entries()) {
        const rawActions = actionMap.get(productId) ?? [];
        if (rawActions.length === 0) continue;

        // Ordena ações por relevância/prioridade determinística
        const sortedActions = [...rawActions].sort(compareWorkbenchActions);
        const primaryAction = sortedActions[0]!;
        const subordinateActions = sortedActions.slice(1);

        // O actionableSince do produto é a pendência mais antiga executável
        const earliestTimestamp = sortedActions.reduce((earliest, act) => {
          const actTime = new Date(act.actionableSince).getTime();
          const curTime = new Date(earliest).getTime();
          return actTime < curTime ? act.actionableSince : earliest;
        }, primaryAction.actionableSince);

        // Aplica filtros se houver
        if (filterMarketplace && prod.marketplace !== filterMarketplace) {
          continue;
        }

        if (filterAction && primaryAction.actionType !== filterAction && !subordinateActions.some((a) => a.actionType === filterAction)) {
          continue;
        }

        totalActionsCount += sortedActions.length;

        items.push({
          productId: prod.productId,
          title: prod.title,
          marketplace: prod.marketplace,
          externalId: prod.externalId,
          currentPriceCents: prod.priceCents,
          imageUrl: prod.imageUrl,
          category: prod.category,
          familyKey: prod.familyKey,
          primaryAction,
          subordinateActions,
          actionableSince: earliestTimestamp,
          freshestObservedAt: prod.freshestObservedAt,
        });
      }

      // Ordenação canônica estável: actionableSince ASC, productId ASC
      items.sort((a, b) => {
        const timeA = new Date(a.actionableSince).getTime();
        const timeB = new Date(b.actionableSince).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.productId.localeCompare(b.productId);
      });

      const totalProductsCount = items.length;

      // Paginação por cursor composto
      let filteredItems = items;
      if (cursor) {
        const cursorTime = new Date(cursor.actionableSince).getTime();
        filteredItems = items.filter((it) => {
          const itTime = new Date(it.actionableSince).getTime();
          if (itTime > cursorTime) return true;
          if (itTime === cursorTime && it.productId > cursor.productId) return true;
          return false;
        });
      }

      const pageItems = filteredItems.slice(0, limit);
      const hasMore = filteredItems.length > limit;
      let nextCursor: string | null = null;

      if (hasMore && pageItems.length > 0) {
        const lastItem = pageItems[pageItems.length - 1]!;
        nextCursor = encodeWorkbenchCursor(lastItem.actionableSince, lastItem.productId);
      }

      return {
        items: pageItems,
        nextCursor,
        totalProductsCount,
        totalActionsCount,
      };
    },
    sqlFactory,
  );
}
