import { refreshHomepageEdition } from "../lib/homepage-db.ts";
const args = process.argv.slice(2);
const index = args.indexOf("--tenant");
const tenantId = index < 0 ? "local" : args[index + 1];
if (!/^[a-z0-9._-]{1,64}$/.test(tenantId ?? "")) throw new Error("invalid_homepage_tenant");
try {
  const result = await refreshHomepageEdition(tenantId, undefined, new Date(), !args.includes("--execute"), args.includes("--initialize"));
  console.log(JSON.stringify({ mode: args.includes("--execute") ? "execute" : "dry-run", tenantId, ...result }));
  // Routine workers may coexist with the app before activation/migration.
  if (args.includes("--initialize") && (!result.ready || ("blocked" in result && result.blocked))) process.exitCode = 1;
} catch { console.error("homepage_refresh_failed"); process.exitCode = 1; }
