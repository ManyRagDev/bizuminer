/** Local/worker job; performs database work only, no marketplace or model calls. */
import { db } from "../lib/db.ts";
import { aiCurationProvider } from "../lib/ai-curation-provider.ts";
import { recomputeCurationScores } from "../lib/curation-score-db.ts";

const args = process.argv.slice(2), index = args.indexOf("--tenant"), tenantId = args[index + 1];
if (index < 0 || !tenantId || !/^[a-z0-9._-]{1,64}$/.test(tenantId)) throw new Error("score_tenant_required");
if (!args.includes("--execute")) throw new Error("score_execution_requires_execute");
const provider = aiCurationProvider();
const model = provider === "openrouter" ? process.env.AI_CURATION_MODEL : process.env.GEMINI_MODEL || "gemini-2.5-flash";
if (!model) throw new Error("score_model_required");
const sql = db();
try { console.log(JSON.stringify(await recomputeCurationScores(sql, tenantId, `${provider}:${model}`))); }
finally { await sql.end(); }
