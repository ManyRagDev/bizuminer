import { cookies } from "next/headers";
import { getPageSession, isAffiliate } from "../lib/auth";
import { catalogPage } from "../lib/db";
import { catalogStateFromSearchParams, catalogStateToDealQuery } from "../lib/deal-query";
import { toVitrineProduct } from "../lib/deal-view";
import { validUserId } from "../lib/member-contract";
import { savedProductIds } from "../lib/member-db";
import Vitrine from "./vitrine";
import { getPublishedEditorialSelection } from "../lib/editorial-selection-db";
import { publishedEditorialStateKey } from "../lib/editorial-selection";

export const dynamic = "force-dynamic";

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: HomeProps) {
  const raw = await searchParams;
  const publicParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") publicParams.set(key, value);
  }
  let initialState = catalogStateFromSearchParams(publicParams);
  const [selection, initialCatalog] = await Promise.all([
    getPublishedEditorialSelection("home"),
    catalogPage(catalogStateToDealQuery(initialState)),
  ]);
  let { page, presentation } = initialCatalog;

  // URL adulterada ou página antiga além do total volta a uma página válida.
  if (initialState.page > 1 && page.deals.length === 0) {
    initialState = { ...initialState, page: 1 };
    ({ page, presentation } = await catalogPage(catalogStateToDealQuery(initialState)));
  }
  const products = page.deals.map(toVitrineProduct);

  // Bancada em qualquer aparelho: quem está logado já vê os corações da conta.
  // Anônimo continua só no localStorage — comportamento intacto.
  const uid = (await cookies()).get("bm_uid")?.value;
  const session = await getPageSession(validUserId(uid) ? uid : null);
  const isUserAdmin = session ? await isAffiliate(session.authUser) : false;
  const initialSavedIds = session ? await savedProductIds(session.appUserId) : [];

  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date());

  return <Vitrine editorialProducts={selection.products} editorialHeroIds={selection.heroProductIds} editorialHeroValidUntil={selection.heroValidUntil} editorialStateKey={publishedEditorialStateKey(selection)} editorialVersion={selection.version} initialProducts={products} initialTotal={page.total} initialState={initialState} categories={presentation.categories} dateLabel={dateLabel} initialSavedIds={initialSavedIds} marketplaceCounts={presentation.marketplaceCounts} isUserAdmin={isUserAdmin} />;
}
