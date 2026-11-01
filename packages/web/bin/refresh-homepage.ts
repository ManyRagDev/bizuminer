import { refreshHomepageEdition } from "../lib/homepage-db.ts";
import { homepageRefreshExitCode } from "../lib/homepage-renewal.ts";
import { recordHomepageRenewalFailure } from "../lib/homepage-renewal-db.ts";
const args = process.argv.slice(2);
const index = args.indexOf("--tenant");
const tenantId = index < 0 ? "local" : args[index + 1];
if (!/^[a-z0-9._-]{1,64}$/.test(tenantId ?? "")) throw new Error("invalid_homepage_tenant");
try {
  const result = await refreshHomepageEdition(tenantId, undefined, new Date(), !args.includes("--execute"), args.includes("--initialize"));
  console.log(JSON.stringify({ mode: args.includes("--execute") ? "execute" : "dry-run", tenantId, ...result }));
  process.exitCode = homepageRefreshExitCode(result, args.includes("--initialize") || args.includes("--require-renewal"));
} catch {
  await recordHomepageRenewalFailure(tenantId).catch(() => {});
  console.error("homepage_refresh_failed"); process.exitCode = 1;
}
