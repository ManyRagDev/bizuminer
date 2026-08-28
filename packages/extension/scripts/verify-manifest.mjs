/**
 * Verifica o manifest.json (E5): MV3, permissões mínimas documentadas, sem
 * host_permissions permanentes sobre o ML, sem código remoto. Lê o manifest da
 * raiz do pacote (fonte) — o dist/ é gerado pelo build.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

check(manifest.manifest_version === 3, "manifest_version é 3");

const allowed = new Set(["activeTab", "scripting", "storage", "alarms"]);
const permissions = manifest.permissions ?? [];
check(permissions.every((p) => allowed.has(p)), `permissions ⊆ {activeTab, scripting, storage, alarms} (atual: ${permissions.join(", ") || "—"})`);

const hostPermissions = manifest.host_permissions ?? [];
check(
  hostPermissions.length > 0 && hostPermissions.every((h) => h.includes("bizuminer.com.br") || h.includes("localhost")),
  `host_permissions só para a API BizuMiner (atual: ${hostPermissions.join(", ") || "—"})`,
);

check(
  hostPermissions.every((h) => !h.includes("mercadolivre")),
  "sem host_permission permanente sobre o Mercado Livre",
);

check(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 0, "sem content script permanente (injeção via scripting)");

check(
  manifest.background?.service_worker === "service-worker.js",
  "service worker apontado",
);

const csp = manifest.content_security_policy?.extension_pages ?? "";
check(
  !/unsafe-eval/.test(csp) && /script-src\s+'self'/.test(csp),
  "CSP sem unsafe-eval e sem código remoto",
);

check(
  !JSON.stringify(manifest).match(/ML_TRACKING_ID|ML_TOOL_ID|tracking_id|tool_id/i),
  "manifesto não contém segredo/config ML",
);

console.log(failures === 0 ? "\nManifesto OK." : `\n${failures} check(s) FALHARAM.`);
process.exit(failures === 0 ? 0 : 1);
