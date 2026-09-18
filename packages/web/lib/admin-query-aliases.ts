/**
 * Canonicalização das query params das páginas administrativas (09/09/2026).
 *
 * Canônico aceito: `?aba=selecao|excecoes|auditoria|bussola` + `?sub=singulars|grupos|spotcheck|espera`.
 * Legados aceitos (migrados para o canônico via redirect, nunca quebrados):
 *  - `?aba=hoje`            → `?aba=excecoes&sub=singulars`
 *  - `?aba=grupos`          → `?aba=excecoes&sub=grupos`
 *  - `?aba=espera`          → `?aba=auditoria&sub=espera`
 *  - `?aba=aprendizados`    → `?aba=bussola`
 *  - `?fila=held`           → `?aba=auditoria&sub=espera`
 *  - `?modo=grupos`         → `?sub=grupos` (em excecoes)
 *  - `?modo=hoje`           → `?sub=singulars` (em excecoes)
 *  - `?subaba=espera`       → `?sub=espera` (em auditoria)
 *  - `?subaba=spotcheck`    → `?sub=spotcheck` (em auditoria)
 *
 * A página chama `canonicalAdminQuery(...)` e, se `redirectNeeded`, faz
 * `redirect(canonicalAdminUrl(...))` — o aliase segue funcionando sem que a
 * lógica de aba leia duas gramáticas.
 */

export type AdminQueryRaw = Record<string, string | undefined>;

export type AdminQueryCanonical = {
  aba: string;
  sub: string;
  redirectNeeded: boolean;
};

const ABA_ALIASES: Record<string, { aba: string; sub?: string }> = {
  hoje: { aba: "excecoes", sub: "singulars" },
  grupos: { aba: "excecoes", sub: "grupos" },
  espera: { aba: "auditoria", sub: "espera" },
  aprendizados: { aba: "bussola" },
  selecao: { aba: "selecao" },
  excecoes: { aba: "excecoes" },
  auditoria: { aba: "auditoria" },
  bussola: { aba: "bussola" },
  pipeline: { aba: "pipeline" },
  lotes: { aba: "pipeline" },
};

const DEFAULT_SUB: Record<string, string> = {
  excecoes: "singulars",
  auditoria: "spotcheck",
};

const SUB_VALUES = new Set(["singulars", "grupos", "spotcheck", "espera"]);

const MODO_TO_SUB: Record<string, string> = {
  grupos: "grupos",
  hoje: "singulars",
};

export function canonicalAdminQuery(raw: AdminQueryRaw): AdminQueryCanonical {
  const { aba: abaRaw, fila, sub: subRaw, modo, subaba } = raw;

  let aba = "selecao";
  let abaLegacy = false;
  let aliasSub = "";
  if (abaRaw && abaRaw in ABA_ALIASES) {
    const alias = ABA_ALIASES[abaRaw]!;
    aba = alias.aba;
    aliasSub = alias.sub ?? "";
    abaLegacy = abaRaw !== aba;
  } else if (fila === "held") {
    aba = "auditoria";
  }

  let sub = "";
  let subLegacy = false;
  if (fila === "held") {
    sub = "espera";
  } else if (subRaw && SUB_VALUES.has(subRaw)) {
    sub = subRaw;
  } else if (subaba && SUB_VALUES.has(subaba)) {
    sub = subaba;
    subLegacy = true;
  } else if (modo && modo in MODO_TO_SUB) {
    sub = MODO_TO_SUB[modo]!;
    subLegacy = true;
  } else if (aliasSub && !subRaw) {
    sub = aliasSub;
  } else {
    sub = DEFAULT_SUB[aba] ?? "";
  }

  const redirectNeeded =
    abaLegacy || subLegacy || fila === "held" || modo !== undefined || subaba !== undefined;
  return { aba, sub, redirectNeeded };
}

/**
 * Monta a URL canônica para `/admin/curadoria`, preservando params
 * desconhecidos (ex.: `grupo`, `page`). Só muda o que é de navegação.
 */
export function canonicalAdminUrl(pathname: string, raw: AdminQueryRaw): string {
  const { aba, sub } = canonicalAdminQuery(raw);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "aba" || key === "sub" || key === "fila" || key === "modo" || key === "subaba") continue;
    if (value !== undefined) params.set(key, value);
  }
  params.set("aba", aba);
  if (sub) params.set("sub", sub);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}