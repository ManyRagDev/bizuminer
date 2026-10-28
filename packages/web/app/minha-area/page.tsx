import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPageSession, isAffiliate } from "../../lib/auth";
import { catalogCategories } from "../../lib/db";
import { toVitrineProduct } from "../../lib/deal-view";
import { hydrateProductPresentations } from "../../lib/product-presentation-db";
import { allowedProfileCategories, validUserId } from "../../lib/member-contract";
import { memberSnapshot, type MemberSnapshot } from "../../lib/member-db";
import MemberArea, { type MemberRec, type MemberSaved, type MemberWatch } from "./member-area";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Minha área | BizuMiner",
  description: "Seus salvos, acompanhamento de preço e recomendações.",
  robots: { index: false, follow: false },
};

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

function serializeSnapshot(snapshot: MemberSnapshot) {
  const saved: MemberSaved[] = snapshot.saved.map((row) => ({
    ...toVitrineProduct(row),
    savedAt: iso(row.saved_at)!,
    available: row.available,
  }));
  const watches: MemberWatch[] = snapshot.watches.map((row) => ({
    watchId: row.watch_id,
    productId: row.product_id,
    title: row.title,
    slug: row.slug,
    imageUrl: row.image_url,
    category: row.category,
    baselineCents: row.baseline_price_cents,
    baselineCurrency: row.baseline_currency,
    targetCents: row.target_price_cents,
    currentCents: row.current_price_cents,
    currentObservedAt: iso(row.current_observed_at),
    watchedAt: iso(row.watched_at)!,
    comparisonStatus: row.comparison_status,
    available: row.available,
    benefit: row.benefit, audience: row.audience, caveat: row.caveat, purchaseContents: row.purchaseContents,
  }));
  const recommended: MemberRec[] = snapshot.recommended.map((row) => ({
    ...toVitrineProduct(row),
    reasonOrigin: row.reason_origin,
  }));
  return { saved, watches, recommended, profile: snapshot.profile };
}

export default async function MinhaAreaPage() {
  const uid = (await cookies()).get("bm_uid")?.value;
  const session = await getPageSession(validUserId(uid) ? uid : null);
  if (!session) redirect("/entrar?next=/minha-area");
  const { authUser: user, appUserId } = session;

  const [snapshot, categories] = await Promise.all([
    memberSnapshot(appUserId),
    catalogCategories(),
  ]);
  const [saved, recommended] = await Promise.all([hydrateProductPresentations(snapshot.saved), hydrateProductPresentations(snapshot.recommended)]);
  const data = serializeSnapshot({ ...snapshot, saved, recommended });
  const profileCategories = allowedProfileCategories(categories, snapshot.profile.preferredCategories);

  return (
    <MemberArea
      identified
      isAdmin={await isAffiliate(user)}
      userName={user.name ?? undefined}
      userEmail={user.email ?? undefined}
      categories={profileCategories}
      initialSaved={data.saved}
      initialWatches={data.watches}
      recommended={data.recommended}
      initialProfile={data.profile}
    />
  );
}
