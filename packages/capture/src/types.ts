/**
 * Contrato de captura — agnóstico de marketplace.
 *
 * Toda fonte de ofertas (API oficial, endpoint JSON, scraping) implementa
 * `CaptureAdapter`. O núcleo do sistema nunca conhece a Shopee, o Awin ou
 * qualquer loja: conhece apenas este contrato.
 *
 * Consequência prática: adicionar um marketplace é escrever um arquivo novo,
 * não tocar no worker, na fila ou no banco.
 */

/**
 * Método pelo qual a oferta foi obtida. Gravado em toda oferta.
 *
 * `http_html`: HTML público renderizado no servidor, lido por fetch simples
 * (sem navegador). Distinto de `browser` — sem Puppeteer, sem risco ToS de
 * automação de navegador — e de `http_json`, que é endpoint JSON.
 */
export type CaptureSource = "official_api" | "http_json" | "http_html" | "browser";

/** Marketplace identificado por slug estável. Nunca use enum — ver README. */
export type MarketplaceSlug = string;

/**
 * Credencial de um marketplace. O formato varia por adapter, então o núcleo
 * trata como opaco. O adapter valida o formato que espera.
 *
 * NUNCA logar, serializar em resposta de API ou enviar para observabilidade.
 */
export interface Credential {
  readonly marketplace: MarketplaceSlug;
  /** Campos específicos do adapter. Ex.: { appId, appSecret } */
  readonly secret: Readonly<Record<string, string>>;
}

/** Tag de afiliado do cliente final. Diferente da credencial de captura. */
export interface AffiliateTag {
  readonly marketplace: MarketplaceSlug;
  readonly trackingId: string;
  /** Sub-identificadores para atribuição. Shopee aceita até 5. */
  readonly subIds?: readonly string[];
  /**
   * ID da ferramenta de compartilhamento (Mercado Livre: `matt_tool`).
   * Descoberto em campo 2026-08-17; fixo por conta de afiliado.
   */
  readonly toolId?: string;
}

/**
 * Oferta normalizada.
 *
 * Valores monetários em CENTAVOS (inteiro). Ponto flutuante em dinheiro
 * acumula erro e é a origem clássica de divergência de centavos em relatório.
 */
export interface RawOffer {
  readonly marketplace: MarketplaceSlug;

  /** Identidade natural do produto no marketplace de origem. */
  readonly externalId: string;
  /** Shopee identifica por itemId + shopId. Amazon por ASIN apenas. */
  readonly externalShopId?: string;

  readonly title: string;
  readonly productUrl: string;
  readonly imageUrl?: string;
  readonly categoryPath?: readonly string[];

  /** Preço atual em centavos. */
  readonly priceCents: number;
  /** Preço "de", quando o marketplace informa. Não confiar sem histórico. */
  readonly originalPriceCents?: number;

  /** Fração entre 0 e 1. O marketplace afirma; nós verificamos depois. */
  readonly claimedDiscountRate?: number;
  /** Fração entre 0 e 1. */
  readonly commissionRate?: number;
  /** Comissão estimada em centavos, quando informada. */
  readonly commissionCents?: number;

  /** Limite inferior aproximado derivado do rótulo (não é contagem exata). */
  readonly salesCount?: number;
  readonly ratingStar?: number;
  readonly salesLabel?: string;

  /** Janela de validade da campanha, quando houver. */
  readonly startsAt?: Date;
  readonly endsAt?: Date;

  readonly capturedAt: Date;
  readonly source: CaptureSource;

  /**
   * Resposta original do marketplace, para depuração e para reprocessar
   * o mapeamento sem nova chamada. Não persistir indefinidamente.
   */
  readonly raw?: unknown;
}

/** Uma página de resultados. */
export interface OfferPage {
  readonly offers: readonly RawOffer[];
  /** Cursor opaco para a próxima página. Ausente = fim. */
  readonly nextCursor?: string;
}

export interface FetchParams {
  /** Termo de busca, quando o adapter suportar. */
  readonly keyword?: string;
  /** Restringe a uma loja específica. */
  readonly shopId?: string;
  /** Desconto mínimo declarado, fração 0..1. Filtro na origem quando possível. */
  readonly minClaimedDiscount?: number;
  /** Itens por página. O adapter aplica seu próprio teto. */
  readonly pageSize?: number;
  /** Continua de onde parou. */
  readonly cursor?: string;
  /** Teto de páginas desta execução; também fica registrado para auditoria. */
  readonly maxPages?: number;
}

/** Contexto injetado pelo worker. Permite cancelar e observar. */
export interface CaptureContext {
  readonly signal?: AbortSignal;
  readonly runId: string;
  readonly log: (event: LogEvent) => void;
}

export interface LogEvent {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly msg: string;
  /** Nunca inclua credencial aqui. */
  readonly data?: Record<string, unknown>;
}

export interface AdapterCapabilities {
  /** Consegue buscar por palavra-chave. */
  readonly search: boolean;
  /** Tem endpoint de campanhas e ofertas relâmpago. */
  readonly offerFeed: boolean;
  /** Consegue gerar link de afiliado programaticamente. */
  readonly linkGeneration: boolean;
  /** Expõe relatório de conversão. */
  readonly conversionReport: boolean;
  /** Método usado — relevante para conformidade e para o custo de infra. */
  readonly source: CaptureSource;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly checkedAt: Date;
}

/**
 * Contrato que todo marketplace implementa.
 */
export interface CaptureAdapter {
  readonly marketplace: MarketplaceSlug;
  readonly capabilities: AdapterCapabilities;

  /**
   * Confirma que a credencial funciona. Chamado no onboarding e
   * periodicamente — credencial expira e o cliente não avisa.
   */
  validateCredential(cred: Credential, ctx: CaptureContext): Promise<ValidationResult>;

  /** Uma página de ofertas. A paginação fica a cargo do chamador. */
  fetchOffers(
    cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): Promise<OfferPage>;

  /**
   * Percorre todas as páginas. Implementação padrão em `paginate()`.
   * Async generator para que o worker processe página a página sem
   * carregar o catálogo inteiro em memória.
   */
  streamOffers(
    cred: Credential,
    params: FetchParams,
    ctx: CaptureContext,
  ): AsyncGenerator<readonly RawOffer[], void, undefined>;

  /**
   * Gera o link afiliado do CLIENTE a partir da URL do produto.
   * Separado da captura de propósito: capturamos com a nossa credencial,
   * o cliente afilia com a dele.
   */
  buildAffiliateLink?(
    cred: Credential,
    productUrl: string,
    tag: AffiliateTag,
    ctx: CaptureContext,
  ): Promise<string>;
}

/**
 * Percorre páginas até o fim, com teto de segurança.
 * Adapters reutilizam isto em `streamOffers`.
 */
export async function* paginate(
  adapter: Pick<CaptureAdapter, "fetchOffers">,
  cred: Credential,
  params: FetchParams,
  ctx: CaptureContext,
  maxPages = params.maxPages ?? 100,
): AsyncGenerator<readonly RawOffer[], void, undefined> {
  let cursor = params.cursor;
  for (let page = 0; page < maxPages; page++) {
    if (ctx.signal?.aborted) return;

    const result = await adapter.fetchOffers(cred, { ...params, cursor }, ctx);
    if (result.offers.length > 0) yield result.offers;

    if (!result.nextCursor) return;
    cursor = result.nextCursor;
  }

  ctx.log({
    level: "warn",
    msg: "paginação interrompida no teto de páginas",
    data: { maxPages },
  });
}
