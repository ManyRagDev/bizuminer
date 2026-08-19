/**
 * Rastreamento de cadeia de redirects de um link do Mercado Livre.
 *
 * É a peça que transforma a investigação de atribuição em medição: ao seguir os
 * redirects de um link de afiliado gerado MANUALMENTE pelo portal (o controle),
 * vemos exatamente quais parâmetros o ML injeta em cada hop — se `matt_word`,
 * `matt_tool` ou outro aparecer lá com o identificador de afiliado, a estratégia
 * deixa de ser hipótese e passa a ser cópia do comportamento oficial.
 *
 * Usa `redirect: "manual"` para ver hop a hop sem cookie e sem executar JS.
 */

export interface TraceHop {
  /** 1-based. */
  readonly hop: number;
  readonly url: string;
  readonly status: number;
  /** Headers relevantes injetados pelo servidor (set-cookie resumido). */
  readonly location?: string;
  /** true quando o hop não redireciona mais. */
  readonly final: boolean;
}

export interface TraceResult {
  readonly hops: readonly TraceHop[];
  /** URL final depois do último redirect. */
  readonly finalUrl: string;
  /** Parâmetros de query acumulados na URL final. */
  readonly finalParams: Readonly<Record<string, string>>;
}

export interface TraceOptions {
  readonly maxHops?: number;
  readonly fetchImpl?: typeof fetch;
  /** User-Agent de navegador, porque o ML pode responder diferente a bots. */
  readonly userAgent?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Segue a cadeia de redirects manualmente.
 *
 * Nunca lança por status de erro — um 4xx/5xx no meio da cadeia é informação,
 * não falha: ele aparece como hop com status e encerra o rastreamento.
 */
export async function traceRedirects(
  startUrl: string,
  opts: TraceOptions = {},
): Promise<TraceResult> {
  const { maxHops = 15, fetchImpl = fetch, userAgent = BROWSER_UA } = opts;

  const hops: TraceHop[] = [];
  let current = startUrl;

  for (let hop = 1; hop <= maxHops; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        headers: { "user-agent": userAgent, accept: "text/html,*/*" },
      });
    } catch (err) {
      // Falha de rede encerra a cadeia registrando o hop.
      hops.push({ hop, url: current, status: 0, final: true });
      break;
    }

    const status = response.status;
    // `redirect: "manual"` devolve 3xx com `Location`; opaqueredirect em alguns
    // runtimes devolve 0 — nesse caso não há como continuar.
    const location = response.headers.get("location") ?? undefined;

    hops.push({ hop, url: current, status, location, final: true });

    const isRedirect =
      status >= 300 && status < 400 && location != null && location !== "";

    if (!isRedirect) break;

    current = new URL(location, current).toString();
    hops[hops.length - 1] = { ...hops[hops.length - 1]!, final: false };
    if (hop === maxHops) {
      // Teto atingido — o último hop fica marcado como não final para o
      // chamador saber que a cadeia não terminou.
      break;
    }
  }

  const finalUrl = hops[hops.length - 1]?.url ?? startUrl;
  let finalParams: Record<string, string> = {};
  try {
    finalParams = Object.fromEntries(new URL(finalUrl).searchParams.entries());
  } catch {
    // URL final inválida — params vazios.
  }

  return { hops, finalUrl, finalParams };
}

/**
 * Diff simples: params que existem na URL final e NÃO existiam na URL inicial.
 *
 * É o atalho para a descoberta: o que o ML injetou no caminho?
 */
export function injectedParams(startUrl: string, finalUrl: string): string[] {
  const keys = (u: string): Set<string> => {
    try {
      return new Set(new URL(u).searchParams.keys());
    } catch {
      return new Set();
    }
  };
  const before = keys(startUrl);
  return [...keys(finalUrl)].filter((k) => !before.has(k));
}
