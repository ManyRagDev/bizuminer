/**
 * Contrato de persistência da captura.
 *
 * A interface mantém ingestão e testes independentes da infraestrutura:
 * `InMemoryStore` cobre o comportamento local e `PostgresStore` persiste no
 * Supabase/Postgres sem acoplar o serviço de ingestão ao driver SQL.
 */

export interface ProductRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly marketplace: string;
  readonly externalId: string;
  readonly title: string;
  readonly productUrl: string;
  readonly imageUrl?: string;
  readonly category?: string;
  readonly lastPriceCents: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly lastCaptureRunId?: string;
}

export interface PriceObservationRecord {
  readonly captureRunId: string;
  readonly productId: string;
  readonly priceCents: number;
  readonly originalPriceCents?: number;
  readonly claimedDiscountRate?: number;
  readonly ratingStar?: number;
  readonly salesLabel?: string;
  /** Limite inferior aproximado derivado do rótulo do marketplace. */
  readonly salesCount?: number;
  readonly observedAt: Date;
  readonly titleSnapshot: string;
  readonly productUrlSnapshot: string;
  readonly imageUrlSnapshot?: string;
  readonly categorySnapshot?: string;
}

export interface UpsertResult {
  readonly product: ProductRecord;
  readonly isNew: boolean;
  /** Preço anterior quando houve mudança; ausente na primeira observação. */
  readonly previousPriceCents?: number;
}

export interface CaptureRunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly marketplace: string;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly status: "running" | "ok" | "error";
  readonly itemsCaptured: number;
  readonly itemsNew: number;
  readonly priceChanges: number;
  readonly error?: string;
  readonly collectorRunId: string;
  readonly parameters: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

export type StartCaptureRunInput = Pick<CaptureRunRecord, "tenantId" | "marketplace" | "startedAt" | "collectorRunId" | "parameters">;
export interface FinishCaptureRunInput {
  readonly finishedAt: Date;
  readonly status: "ok" | "error";
  readonly itemsCaptured: number;
  readonly itemsNew: number;
  readonly priceChanges: number;
  readonly error?: string;
}

export interface OfferStore {
  upsertProductWithObservation(input: {
    captureRunId: string;
    tenantId: string;
    marketplace: string;
    externalId: string;
    title: string;
    productUrl: string;
    imageUrl?: string;
    category?: string;
    priceCents: number;
    originalPriceCents?: number;
    claimedDiscountRate?: number;
    ratingStar?: number;
    salesLabel?: string;
    salesCount?: number;
    observedAt: Date;
  }): Promise<UpsertResult>;

  startCaptureRun(run: StartCaptureRunInput): Promise<string>;
  finishCaptureRun(runId: string, run: FinishCaptureRunInput): Promise<void>;

  /** Menor e maior preço observados de um produto — curadoria da Phase 3. */
  priceRange(productId: string): Promise<
    { minCents: number; maxCents: number; observations: number } | null
  >;

  /** Última observação — desconto declarado para ranking na primeira varredura. */
  latestObservation(productId: string): Promise<PriceObservationRecord | null>;
}

/** Implementação em memória — testes, CLI local e bootstrap sem banco. */
export class InMemoryStore implements OfferStore {
  private readonly products = new Map<string, ProductRecord>();
  private readonly observations = new Map<string, PriceObservationRecord[]>();
  private readonly runs = new Map<string, CaptureRunRecord>();
  private seq = 0;

  async upsertProductWithObservation(input: {
    captureRunId: string;
    tenantId: string;
    marketplace: string;
    externalId: string;
    title: string;
    productUrl: string;
    imageUrl?: string;
    category?: string;
    priceCents: number;
    originalPriceCents?: number;
    claimedDiscountRate?: number;
    ratingStar?: number;
    salesLabel?: string;
    salesCount?: number;
    observedAt: Date;
  }): Promise<UpsertResult> {
    const key = `${input.tenantId}|${input.marketplace}|${input.externalId}`;
    const existing = this.products.get(key);

    let product: ProductRecord;
    let previousPriceCents: number | undefined;

    if (existing) {
      previousPriceCents = existing.lastPriceCents;
      product = {
        ...existing,
        title: input.title,
        productUrl: input.productUrl,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        category: input.category ?? existing.category,
        lastPriceCents: input.priceCents,
        lastSeenAt: input.observedAt,
        lastCaptureRunId: input.captureRunId,
      };
      this.products.set(key, product);
    } else {
      product = {
        id: `p${++this.seq}`,
        tenantId: input.tenantId,
        marketplace: input.marketplace,
        externalId: input.externalId,
        title: input.title,
        productUrl: input.productUrl,
        imageUrl: input.imageUrl,
        category: input.category,
        lastPriceCents: input.priceCents,
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastCaptureRunId: input.captureRunId,
      };
      this.products.set(key, product);
    }

    const observation: PriceObservationRecord = {
        captureRunId: input.captureRunId,
        productId: product.id,
        priceCents: input.priceCents,
        originalPriceCents: input.originalPriceCents,
        claimedDiscountRate: input.claimedDiscountRate,
        ratingStar: input.ratingStar,
        salesLabel: input.salesLabel,
        salesCount: input.salesCount,
        observedAt: input.observedAt,
        titleSnapshot: input.title,
        productUrlSnapshot: input.productUrl,
        imageUrlSnapshot: input.imageUrl,
        categorySnapshot: input.category,
    };
    const observations = this.observations.get(product.id) ?? [];
    const duplicate = observations.findIndex((item) => item.captureRunId === input.captureRunId);
    if (duplicate >= 0) observations[duplicate] = observation;
    else observations.push(observation);
    this.observations.set(product.id, observations);

    return {
      product,
      isNew: !existing,
      previousPriceCents: existing ? previousPriceCents : undefined,
    };
  }

  async startCaptureRun(run: StartCaptureRunInput): Promise<string> {
    const id = `r${++this.seq}`;
    this.runs.set(id, { id, ...run, status: "running", itemsCaptured: 0, itemsNew: 0, priceChanges: 0 });
    return id;
  }

  async finishCaptureRun(runId: string, run: FinishCaptureRunInput): Promise<void> {
    const existing = this.runs.get(runId);
    if (!existing) throw new Error(`capture_run inexistente: ${runId}`);
    this.runs.set(runId, { ...existing, ...run });
  }

  async priceRange(productId: string) {
    const obs = this.observations.get(productId);
    if (!obs || obs.length === 0) return null;
    const prices = obs.map((o) => o.priceCents);
    return {
      minCents: Math.min(...prices),
      maxCents: Math.max(...prices),
      observations: obs.length,
    };
  }

  async latestObservation(productId: string): Promise<PriceObservationRecord | null> {
    const obs = this.observations.get(productId);
    return obs && obs.length > 0 ? obs[obs.length - 1]! : null;
  }

  /** Exposto para inspeção em CLI/teste. */
  get allRuns(): readonly CaptureRunRecord[] {
    return [...this.runs.values()];
  }

  get allProducts(): readonly ProductRecord[] {
    return [...this.products.values()];
  }
}
