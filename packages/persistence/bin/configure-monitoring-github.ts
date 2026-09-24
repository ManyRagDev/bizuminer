/** Configura segredos do workflow sem colocá-los em argumentos ou logs. */
import { spawnSync } from "node:child_process";

const repo = "ManyRagDev/bizuminer";
const secretNames = [
  "DATABASE_URL", "SHOPEE_APP_ID", "SHOPEE_APP_SECRET",
  "ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID",
] as const;
const missing = secretNames.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`variáveis locais ausentes: ${missing.join(", ")}`);

function gh(args: string[], input?: string): void {
  const result = spawnSync("gh", [...args, "--repo", repo], {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} falhou: ${result.stderr.trim()}`);
}

for (const name of secretNames) {
  gh(["secret", "set", name], process.env[name]!);
  console.log(`segredo configurado: ${name}`);
}
gh(["variable", "set", "SHOPEE_CAPTURE_ENABLED", "--body", "true"]);
gh(["variable", "set", "ALIEXPRESS_CAPTURE_ENABLED", "--body", "true"]);
gh(["variable", "set", "MONITOR_PLAN_BUDGET", "--body", "20"]);
console.log("flags de captura e orçamento configurados; MONITORING_ENABLED permanece desligado");
