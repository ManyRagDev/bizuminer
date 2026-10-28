import { cookies } from "next/headers";
import { getPageSession, isAffiliate } from "../lib/auth";
import { catalogPage } from "../lib/db";
import { catalogStateFromSearchParams, catalogStateToDealQuery } from "../lib/deal-query";
import { toVitrineProduct } from "../lib/deal-view";
import { hydrateProductPresentations } from "../lib/product-presentation-db";
import { validUserId } from "../lib/member-contract";
import { savedDeals, savedProductIds } from "../lib/member-db";
import Vitrine from "./vitrine";
import { getPublishedEditorialSelection } from "../lib/editorial-selection-db";
import { publishedEditorialStateKey } from "../lib/editorial-selection";
import { issueHomepageEngagementTicket } from "../lib/homepage-engagement-token";

export const dynamic = "force-dynamic";

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: HomeProps) {
  const raw = await searchParams;
  const publicParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") publicParams.set(key, value);
  }
  let initialState = catalogStateFromSearchParams(publicParams);
  const selection = await getPublishedEditorialSelection("home");
  const initialCatalog = await catalogPage(catalogStateToDealQuery(initialState), "local", undefined, selection);
  let { page, presentation } = initialCatalog;

  // URL adulterada ou página antiga além do total volta a uma página válida.
  if (initialState.page > 1 && page.deals.length === 0) {
    initialState = { ...initialState, page: 1 };
    ({ page, presentation } = await catalogPage(catalogStateToDealQuery(initialState), "local", undefined, selection));
  }
  const products = page.deals.map(toVitrineProduct);

  // Bancada em qualquer aparelho: quem está logado já vê os corações da conta.
  // Anônimo continua só no localStorage — comportamento intacto.
  const uid = (await cookies()).get("bm_uid")?.value;
  const session = await getPageSession(validUserId(uid) ? uid : null);
  const isUserAdmin = session ? await isAffiliate(session.authUser) : false;
  const [initialSavedIds, savedRows] = session ? await Promise.all([savedProductIds(session.appUserId), savedDeals(session.appUserId)]) : [[], []];
  const currentSavedRows = await hydrateProductPresentations(savedRows.filter((row) => row.available));
  const homepageEngagement = issueHomepageEngagementTicket(selection.homepageEditionId, !isUserAdmin);

  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date());

  return <Vitrine homepageReady={selection.homepageReady ?? false} homepageEngagement={homepageEngagement} homepageEditionId={selection.homepageEditionId ?? null} editorialProducts={selection.products} editorialHeroIds={selection.heroProductIds} editorialHeroValidUntil={selection.heroValidUntil} editorialStateKey={publishedEditorialStateKey(selection)} editorialVersion={selection.version} initialProducts={products} initialTotal={page.total} initialState={initialState} categories={presentation.categories} dateLabel={dateLabel} initialSavedIds={initialSavedIds} initialSavedProducts={currentSavedRows.map(toVitrineProduct)} cacheScope={session?.appUserId ?? null} marketplaceCounts={presentation.marketplaceCounts} isUserAdmin={isUserAdmin} />;
}
