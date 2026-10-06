import { getPublishedEditorialSelection } from "../../../lib/editorial-selection-db";
import { publishedEditorialStateKey } from "../../../lib/editorial-selection";

export const dynamic = "force-dynamic";

/** Public edition state; no assessments, evidence or internal scores. */
export async function GET() {
  const selection = await getPublishedEditorialSelection("home");
  return Response.json({ selectionStateKey: publishedEditorialStateKey(selection) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
