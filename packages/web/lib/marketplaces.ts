/**
 * Registro único de marketplaces conhecidos pela borda web.
 *
 * O núcleo de captura (`packages/capture`) já é agnóstico de marketplace
 * (ver `CaptureAdapter`); este arquivo é o equivalente do lado web — o único
 * lugar onde a vitrine, o slug público e o `/go` sabem nomear uma plataforma.
 * Adicionar um marketplace novo é acrescentar uma entrada aqui, não espalhar
 * `if (marketplace === 'shopee')` pelo banco de queries.
 *
 * `slugPrefix` compõe o slug público (`ml-<external_id>`, `shp-<external_id>`).
 * Nunca reordene nem remova uma entrada existente — slugs já publicados
 * (WhatsApp, Telegram, `/bizu/[slug]`) dependem do prefixo permanecer estável.
 */

export type MarketplaceSlug = "mercadolivre" | "shopee" | "aliexpress";

export interface MarketplaceDef {
  readonly slug: MarketplaceSlug;
  /** Nome exibido na vitrine e no painel. */
  readonly label: string;
  /** Prefixo do slug público. Termina em "-"; nunca muda após o primeiro uso. */
  readonly slugPrefix: string;
  /** Texto de proveniência mostrado no card (substitui "dados do Mercado Livre" fixo). */
  readonly evidenceLabel: string;
  /** CTA de saída, com a preposição certa ("ver no X" / "ver na Y" — concordância varia por nome). */
  readonly ctaLabel: string;
  /** Rótulo de avaliação no destaque, mesma razão de preposição do `ctaLabel`. */
  readonly ratingLabel: string;
  /** Texto do carimbo de origem no card. Curto: vive num chip de 9px. */
  readonly stampLabel: string;
  /**
   * Tratamento visual do carimbo. A diferença é **estrutural** (preenchido vs
   * vazado), nunca de matiz — por dois motivos:
   *
   * 1. A cor neste sistema já carrega significado: `--blue` é evidência
   *    verificada NOSSA, `--acid` é alegação do vendedor, `--warning` é
   *    histórico insuficiente. Colorir por loja colidiria com a linguagem de
   *    confiança, que é o ativo do produto.
   * 2. Diferença tonal não sobrevive ao tema escuro (lá `--paper-deep` e
   *    `--ink-block` ficam ambos escuros e a distinção colapsa). Preenchido
   *    vs vazado sobrevive a qualquer inversão — e é seguro para daltônicos.
   *
   * A terceira loja usa `dashed` — contorno tracejado, terceiro degrau
   * estrutural, ainda sem recorrer a matiz.
   */
  readonly stampStyle: "filled" | "outlined" | "dashed";
  /**
   * Ícone quadrado oficial da loja (favicon/app icon). Quando presente, é
   * exibido sobre a foto do produto (canto superior esquerdo) e dentro do
   * CTA — reconhecimento pré-aprendido, não precisa ser ensinado ao usuário.
   *
   * Substituiu (28/08/2026) o recorte do símbolo do lockup horizontal: sem a
   * palavra ao lado, a mão do ML e a sacola da Shopee em 24px eram formas
   * genéricas. O ícone quadrado carrega a própria cor da marca e é legível
   * em 16–28px — é o formato que o usuário já conhece de app e favicon.
   *
   * Os arquivos vivem em `public/brand/marketplaces/quadrados/` e seguem a
   * mesma regra de origem do README da pasta: painel de afiliado da própria
   * loja (uso licenciado), nunca repositório de logos de terceiro.
   */
  readonly logo?: {
    readonly src: string;
    readonly alt: string;
  };
  /** Como a captura acontece: humano operando o navegador, ou API oficial. */
  readonly captureMode: "manual" | "api";
  /**
   * Como o link monetizado nasce — o que o `/go` precisa saber para redirecionar.
   *
   * - `minted`: construído NO MOMENTO do clique, a partir da credencial do
   *   afiliado dono da publicação (Mercado Livre: `matt_word`/`matt_tool`).
   * - `pregenerated`: já existe antes do clique, gravado em
   *   `publication.affiliate_url`. O `/go` só redireciona, sem chamar a API
   *   do marketplace no caminho crítico.
   *
   * Existe para o `/go` parar de perguntar "é Shopee?" e passar a perguntar
   * "o link já vem pronto?". Sem isto, a AliExpress caía no ramo do Mercado
   * Livre e todo produto dela virava 404 — bug real, encontrado em 28/08/2026.
   */
  readonly linkStrategy: "minted" | "pregenerated";
}

export const MARKETPLACES: readonly MarketplaceDef[] = [
  {
    slug: "mercadolivre",
    label: "Mercado Livre",
    slugPrefix: "ml-",
    evidenceLabel: "dados do Mercado Livre",
    ctaLabel: "ver no Mercado Livre",
    ratingLabel: "avaliação no Mercado Livre",
    stampLabel: "Mercado Livre",
    stampStyle: "filled",
    logo: {
      src: "/brand/marketplaces/quadrados/mercadolivre.png",
      alt: "Mercado Livre",
    },
    captureMode: "manual",
    linkStrategy: "minted",
  },
  {
    slug: "shopee",
    label: "Shopee",
    slugPrefix: "shp-",
    evidenceLabel: "dados da Shopee",
    ctaLabel: "ver na Shopee",
    ratingLabel: "avaliação na Shopee",
    stampLabel: "Shopee",
    stampStyle: "outlined",
    logo: {
      src: "/brand/marketplaces/quadrados/shopee.png",
      alt: "Shopee",
    },
    captureMode: "api",
    linkStrategy: "pregenerated",
  },
  {
    slug: "aliexpress",
    label: "AliExpress",
    slugPrefix: "ali-",
    evidenceLabel: "dados da AliExpress",
    ctaLabel: "ver na AliExpress",
    ratingLabel: "avaliação na AliExpress",
    stampLabel: "AliExpress",
    stampStyle: "dashed",
    logo: {
      src: "/brand/marketplaces/quadrados/aliexpress.png",
      alt: "AliExpress",
    },
    captureMode: "api",
    linkStrategy: "pregenerated",
  },
];

const BY_SLUG = new Map(MARKETPLACES.map((m) => [m.slug, m]));

export function marketplaceDef(slug: string): MarketplaceDef | null {
  return BY_SLUG.get(slug as MarketplaceSlug) ?? null;
}

export function isKnownMarketplace(slug: string): slug is MarketplaceSlug {
  return BY_SLUG.has(slug as MarketplaceSlug);
}

/** Monta o slug público de um produto a partir do marketplace e do id externo. */
export function productSlug(marketplace: string, externalId: string): string {
  const def = marketplaceDef(marketplace);
  const prefix = def?.slugPrefix ?? `${marketplace}-`;
  return `${prefix}${externalId}`;
}

/**
 * Decompõe um slug público em marketplace + id externo, testando os
 * prefixos conhecidos. Slug de marketplace desconhecido devolve `null` —
 * quem chama trata como "não encontrado", nunca inventa marketplace.
 */
export function parseProductSlug(slug: string): { marketplace: MarketplaceSlug; externalId: string } | null {
  for (const def of MARKETPLACES) {
    if (slug.startsWith(def.slugPrefix)) {
      const externalId = slug.slice(def.slugPrefix.length);
      if (externalId.length > 0) return { marketplace: def.slug, externalId };
    }
  }
  return null;
}

/**
 * Expressão SQL (dialeto Postgres) que deriva o slug a partir das colunas
 * `marketplace` e `external_id` de `garimpa.product`. Mantida em sincronia
 * manual com `productSlug()` acima — coberto por teste de ida-e-volta.
 */
export function slugCaseSql(marketplaceColumn: string, externalIdColumn: string): string {
  const whens = MARKETPLACES.map(
    (def) => `when ${marketplaceColumn} = '${def.slug}' then '${def.slugPrefix}' || ${externalIdColumn}`,
  ).join("\n      ");
  return `case\n      ${whens}\n      else ${marketplaceColumn} || '-' || ${externalIdColumn}\n    end`;
}
