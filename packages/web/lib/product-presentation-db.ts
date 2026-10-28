import { db } from "./db.ts";
import { scopedTenantId } from "./account-scope.ts";
import { applyProductPresentation, type ProductPresentation } from "./product-presentation.ts";
import { toVitrineProduct } from "./deal-view.ts";
import type { DealRow } from "./db.ts";

/** One bounded SQL projection per page; never fetches private assessments into a public response. */
export async function getProductPresentations(productIds: string[], tenantId: string | null = scopedTenantId(), sqlFactory: typeof db = db): Promise<Map<string, ProductPresentation>> {
  const result = new Map<string, ProductPresentation>();
  if (!productIds.length || (sqlFactory === db && !process.env.DATABASE_URL)) return result;
  const sql = sqlFactory();
  try {
    const [schema] = await sql<{ ready: boolean }[]>`select to_regprocedure('garimpa.public_product_presentations(text,text[])') is not null as ready`;
    if (!schema?.ready) return result; // Explicit pre-migration compatibility; SQL failures still propagate.
    const ids = [...new Set(productIds)];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const rows = await sql<{ product_id: string; presentation: ProductPresentation }[]>`select * from garimpa.public_product_presentations(${tenantId},${ids.slice(offset, offset + 200)})`;
      for (const row of rows) result.set(row.product_id, row.presentation);
    }
    return result;
  } finally { await sql.end(); }
}

export async function hydrateProductPresentations<T extends { id: string; title: string }>(products: T[], tenantId: string | null = scopedTenantId(), sqlFactory: typeof db = db): Promise<Array<T & ProductPresentation>> {
  const presentations = await getProductPresentations(products.map(product => product.id), tenantId, sqlFactory);
  return products.map(product => applyProductPresentation(product, presentations.get(product.id)));
}

export async function selectedPublicProducts(productIds: string[], sqlFactory: typeof db = db) {
  if (!productIds.length) return { ready: true, products: [] };
  if (sqlFactory === db && !process.env.DATABASE_URL) return { ready: false, products: [] };
  const ids = [...new Set(productIds)];
  if (ids.length > 24) throw new Error("selection_limit");
  const sql = sqlFactory();
  try {
    const [schema] = await sql<{ ready: boolean }[]>`select to_regprocedure('garimpa.public_selected_products(text[])') is not null as ready`;
    if (!schema?.ready) return { ready: false, products: [] };
    const [row] = await sql<{ products: DealRow[] }[]>`select garimpa.public_selected_products(${ids}) as products`;
    return { ready: true, products: (row?.products ?? []).map(toVitrineProduct) };
  } finally { await sql.end(); }
}
