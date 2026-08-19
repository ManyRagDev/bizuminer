/**
 * Construção de link de afiliado do Mercado Livre.
 *
 * O Mercado Livre não expõe API de afiliados, então não há forma documentada de
 * gerar o link por código. O que existe é um conjunto de padrões de URL que a
 * plataforma usa para atribuição.
 *
 * NÃO SABEMOS qual funciona. Por isso este arquivo não escolhe: ele gera todos
 * os candidatos, e o teste em campo decide. Cada estratégia carrega
 * `verified: false` até que um clique real apareça no portal de afiliados.
 *
 * Quando o teste apontar a vencedora, mude `verified` para `true` e defina-a
 * como padrão em `DEFAULT_STRATEGY`. É a única alteração necessária.
 */

export interface LinkStrategy {
  readonly id: string;
  readonly description: string;
  /**
   * `true` só depois que um clique real for confirmado no portal.
   * Enquanto for `false`, o sistema deve tratar o link como não atribuível.
   */
  readonly verified: boolean;
  build(input: LinkInput): string | null;
}

export interface LinkInput {
  /** URL canônica do produto, vinda de `permalink`. */
  readonly productUrl: string;
  /** ID do item, ex.: MLB1234567890. */
  readonly itemId: string;
  /** Identificador de afiliado do cliente — vira `matt_word`. */
  readonly trackingId: string;
  /**
   * ID da ferramenta de compartilhamento — vira `matt_tool`.
   * Descoberto no trace de um link de controle (2026-08-17): o ML injeta
   * `matt_word`, `matt_tool`, `forceInApp` e um `ref` opaco ao expandir
   * shortlinks meli.la. O `matt_tool` parece fixo por conta.
   */
  readonly toolId?: string;
  /** Sub-identificador para atribuição interna, ex.: publication_id. */
  readonly subId?: string;
}

function withParams(
  url: string,
  params: Record<string, string | undefined>,
): string | null {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) {
      if (v) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Candidatos a testar. Nenhum é afirmação — são hipóteses ordenadas por
 * plausibilidade, baseadas em padrões observados em URLs do Mercado Livre.
 */
export const LINK_STRATEGIES: readonly LinkStrategy[] = [
  {
    id: "matt_full",
    description:
      "matt_word + matt_tool + forceInApp — padrão observado ao expandir shortlinks meli.la e CONFIRMADO EM CAMPO (2026-08-17): clique em URL de produto com estes params, sem o `ref` opaco, foi contabilizado no portal de afiliados. Aceita sufixo de sub-atribuição em matt_word (id_subid)",
    verified: true,
    build: ({ productUrl, trackingId, toolId, subId }) =>
      withParams(productUrl, {
        matt_word: subId ? `${trackingId}_${subId}` : trackingId,
        matt_tool: toolId,
        forceInApp: "true",
      }),
  },
  {
    id: "matt_tool",
    description: "Parâmetro matt_tool na URL do produto",
    verified: false,
    build: ({ productUrl, trackingId, subId }) =>
      withParams(productUrl, { matt_tool: trackingId, matt_word: subId }),
  },
  {
    id: "matt_word",
    description: "Somente matt_word",
    verified: false,
    build: ({ productUrl, trackingId }) =>
      withParams(productUrl, { matt_word: trackingId }),
  },
  {
    id: "tracking_id",
    description: "Parâmetro tracking_id",
    verified: false,
    build: ({ productUrl, trackingId }) =>
      withParams(productUrl, { tracking_id: trackingId }),
  },
  {
    id: "ref",
    description: "Parâmetro ref genérico",
    verified: false,
    build: ({ productUrl, trackingId }) =>
      withParams(productUrl, { ref: trackingId }),
  },
  {
    id: "forceInApp_matt",
    description: "matt_tool com forceInApp, padrão visto em campanhas",
    verified: false,
    build: ({ productUrl, trackingId }) =>
      withParams(productUrl, { matt_tool: trackingId, forceInApp: "true" }),
  },
  {
    id: "utm_full",
    description: "UTM completo com source affiliate",
    verified: false,
    build: ({ productUrl, trackingId, subId }) =>
      withParams(productUrl, {
        utm_source: "affiliate",
        utm_medium: "affiliate",
        utm_campaign: trackingId,
        utm_content: subId,
      }),
  },
  {
    id: "canonical_item",
    description: "URL canônica curta por item + matt_tool",
    verified: false,
    build: ({ itemId, trackingId }) => {
      const id = itemId.trim().toUpperCase();
      if (!/^ML[A-Z]\d+$/.test(id)) return null;
      const slug = `${id.slice(0, 3)}-${id.slice(3)}`;
      return withParams(`https://produto.mercadolivre.com.br/${slug}`, {
        matt_tool: trackingId,
      });
    },
  },
];

/**
 * Estratégia usada em produção. `null` enquanto nenhuma foi confirmada —
 * o que força o sistema a tratar o link como não atribuível em vez de
 * assumir silenciosamente que funciona.
 */
export const DEFAULT_STRATEGY: LinkStrategy | null =
  LINK_STRATEGIES.find((s) => s.verified) ?? null;

export interface LinkCandidate {
  readonly strategyId: string;
  readonly description: string;
  readonly url: string;
  readonly verified: boolean;
}

/** Gera todos os candidatos para um produto. Usado pelo experimento. */
export function buildAllCandidates(input: LinkInput): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  for (const s of LINK_STRATEGIES) {
    const url = s.build(input);
    if (url) {
      out.push({
        strategyId: s.id,
        description: s.description,
        url,
        verified: s.verified,
      });
    }
  }
  return out;
}

export interface BuiltLink {
  readonly url: string;
  readonly strategyId: string;
  /** `false` significa: publicar isto pode não gerar comissão. */
  readonly attributionVerified: boolean;
}

/**
 * Constrói o link para uso real.
 *
 * Devolve `attributionVerified: false` enquanto nenhuma estratégia tiver sido
 * confirmada em campo. Quem consome deve decidir se publica assim mesmo —
 * mas não pode alegar que não sabia.
 */
export function buildAffiliateLink(input: LinkInput): BuiltLink | null {
  const strategy = DEFAULT_STRATEGY ?? LINK_STRATEGIES[0];
  if (!strategy) return null;

  const url = strategy.build(input);
  if (!url) return null;

  return {
    url,
    strategyId: strategy.id,
    attributionVerified: strategy.verified,
  };
}
