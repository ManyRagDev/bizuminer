/** Release origins are exact capabilities, never substring matches or user input. */
export const PRODUCTION_ORIGIN = "https://www.bizuminer.com.br";
export const DEVELOPMENT_ORIGIN = "http://localhost:3100";
export function buildMode(args) {
  if (args.length === 0 || args.length === 1 && args[0] === "--prod") return "prod";
  if (args.length === 1 && args[0] === "--dev") return "dev";
  throw new Error("Use no flag/--prod for production, or --dev explicitly for local development.");
}
export function apiOrigin(mode) {
  if (mode === "prod") return PRODUCTION_ORIGIN;
  if (mode === "dev") return DEVELOPMENT_ORIGIN;
  throw new Error("Invalid extension build mode");
}
export function manifestForBuild(source, mode) {
  return { ...source, name: mode === "dev" ? `${source.name} (dev)` : source.name,
    host_permissions: [`${apiOrigin(mode)}/*`] };
}
export function manifestFailures(manifest, mode, version) {
  const failures = [];
  if (manifest.manifest_version !== 3) failures.push("manifest_version must be 3");
  if (manifest.version !== version) failures.push("manifest version must match package version");
  const permissions = manifest.permissions;
  const expectedPermissions = ["activeTab", "scripting", "storage", "alarms"];
  if (!Array.isArray(permissions) || permissions.length !== expectedPermissions.length
    || new Set(permissions).size !== expectedPermissions.length || expectedPermissions.some(p => !permissions.includes(p))) {
    failures.push("permissions must be exactly activeTab, scripting, storage, alarms");
  }
  if (!Array.isArray(manifest.host_permissions) || manifest.host_permissions.length !== 1
    || manifest.host_permissions[0] !== `${apiOrigin(mode)}/*`) failures.push(`host_permissions must be exactly ${apiOrigin(mode)}/*`);
  const optionalHosts = ["https://*.mercadolivre.com.br/*", "https://*.amazon.com.br/*", "https://*.aliexpress.com/*"];
  if (!Array.isArray(manifest.optional_host_permissions) || manifest.optional_host_permissions.length !== optionalHosts.length
    || new Set(manifest.optional_host_permissions).size !== optionalHosts.length
    || optionalHosts.some(host => !manifest.optional_host_permissions.includes(host))) failures.push("optional hosts must be the three supported marketplaces only");
  if (manifest.optional_permissions?.length) failures.push("additional optional permissions are not allowed");
  if (manifest.key) failures.push("release must not invent or replace the installed extension identity");
  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 0) failures.push("permanent content scripts are not allowed");
  if (manifest.background?.service_worker !== "service-worker.js") failures.push("service worker must be service-worker.js");
  if (manifest.action?.default_popup !== "popup/index.html") failures.push("popup must be popup/index.html");
  if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'self'") failures.push("CSP must contain only self script/object sources");
  if (/ML_TRACKING_ID|ML_TOOL_ID|tracking_id|tool_id/i.test(JSON.stringify(manifest))) failures.push("manifest must not contain affiliate configuration");
  return failures;
}
