import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriceEvidence,
  projectCanonicalToLegacy,
  buildConfigurationKey,
  DEFAULT_PRICE_EVIDENCE_POLICY,
} from "../lib/price-evidence.ts";

const completeConfiguration = {
 packageQuantity: 1,
 fieldStates: Object.fromEntries(['sellerId','packageContents','dimensions','payment','coupon','region'].map(k=>[k,'not_applicable'])),
};

test("S-PRECO 1: E0 para produto com observação única (sem pontos anteriores)", () => {
  const currentObs = {
    id: "obs-1",
    priceCents: 5000,
    observedAt: "2026-10-14T10:00:00Z",
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "var-azul",
      variantLabel: "Azul",
      source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-14T10:00:00Z" },
    },
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-1",
    observations: [currentObs],
  });

  assert.equal(evidence.state, "E0");
  assert.equal(evidence.priorCount, 0);
  assert.equal(evidence.priorMinCents, null);
  assert.equal(evidence.allowedClaims.length, 1);
  assert.equal(evidence.allowedClaims[0].type, "observed_current_price");

  const legacy = projectCanonicalToLegacy(evidence);
  assert.equal(legacy.lowestVerified, false);
  assert.equal(legacy.previousMinPriceCents, null);
});

test("S-PRECO 2: E1 para observações sem variantKey/configuração conhecida", () => {
  const obs1 = {
    id: "obs-1",
    priceCents: 8000,
    observedAt: "2026-10-01T10:00:00Z",
    currency: "BRL",
  };
  const obs2 = {
    id: "obs-2",
    priceCents: 5000,
    observedAt: "2026-10-14T10:00:00Z",
    currency: "BRL",
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-2",
    observations: [obs1, obs2],
  });

  assert.equal(evidence.state, "E1");
  assert.equal(evidence.configurationKey, null);
  assert.equal(evidence.priorMinCents, null);
  assert.ok(evidence.unknowns.includes("configuration_unverified"));
  assert.ok(evidence.unknowns.includes("comparable_history_absent"));

  const legacy = projectCanonicalToLegacy(evidence);
  assert.equal(legacy.lowestVerified, false);
  assert.equal(legacy.previousMinPriceCents, null);
});

test("S-PRECO 3: E1 para moedas diferentes (BRL vs USD descartado)", () => {
  const obs1 = {
    id: "obs-1",
    priceCents: 8000,
    observedAt: "2026-10-01T10:00:00Z",
    currency: "USD",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "var-azul",
      source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-01T10:00:00Z" },
    },
  };
  const obs2 = {
    id: "obs-2",
    priceCents: 5000,
    observedAt: "2026-10-14T10:00:00Z",
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "var-azul",
      source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-14T10:00:00Z" },
    },
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-2",
    observations: [obs1, obs2],
  });

  assert.equal(evidence.state, "E1");
  assert.equal(evidence.priorMinCents, null);
});

test("S-PRECO 4: E1 para variantes distintas (110V vs 220V) sob o mesmo anúncio", () => {
  const obs110 = {
    id: "obs-1",
    priceCents: 9000,
    observedAt: "2026-10-01T10:00:00Z",
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "110V",
      variantLabel: "110 Volts",
      source: { marketplace: "mercadolivre", method: "http_html", url: "https://ml.com.br/item-1", capturedAt: "2026-10-01T10:00:00Z" },
    },
  };
  const obs220 = {
    id: "obs-2",
    priceCents: 5000,
    observedAt: "2026-10-14T10:00:00Z",
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "220V",
      variantLabel: "220 Volts",
      source: { marketplace: "mercadolivre", method: "http_html", url: "https://ml.com.br/item-1", capturedAt: "2026-10-14T10:00:00Z" },
    },
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-2",
    observations: [obs110, obs220],
  });

  assert.equal(evidence.state, "E1");
  assert.equal(evidence.priorMinCents, null);
  assert.equal(evidence.excludedCount, 1);
});

test("S-PRECO 5: E2 com histórico comparável idêntico e política padrão (e3Enabled = false)", () => {
  const makeObs = (id, daysAgo, price) => ({
    id,
    priceCents: price,
    observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "220V-preto",
      variantLabel: "220V Preto",
      packageQuantity: 1,
      source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-01T10:00:00Z" },
    },
  });

  const obs = [
    makeObs("obs-1", 10, 10000),
    makeObs("obs-2", 7, 9500),
    makeObs("obs-3", 4, 9000),
    makeObs("obs-curr", 0, 8000),
  ];

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-curr",
    observations: obs,
  });

  // e3Enabled padrão é false, então o estado é E2
  assert.equal(evidence.state, "E2");
  assert.equal(evidence.priorCount, 3);
  assert.equal(evidence.priorMinCents, 9000);
  assert.equal(evidence.medianCents, 9500);

  // Permite observed_drop, mas NÃO historical_observed_minimum (recorde)
  const dropClaim = evidence.allowedClaims.find((c) => c.type === "observed_drop");
  assert.ok(dropClaim);
  assert.equal(evidence.allowedClaims.some((c) => c.type === "historical_observed_minimum"), false);

  // Projeção legada: lowestVerified é false (E3 off), mas previousMinPriceCents é 9000
  const legacy = projectCanonicalToLegacy(evidence);
  assert.equal(legacy.lowestVerified, false);
  assert.equal(legacy.previousMinPriceCents, 9000);
});

test("S-PRECO 6: E3 habilitado quando política comercial e3Enabled = true e critérios de cobertura atingidos", () => {
  const makeObs = (id, daysAgo, price) => ({
    id,
    priceCents: price,
    observedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "220V-preto",
      variantLabel: "220V Preto",
      source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-01T10:00:00Z" },
    },
  });

  // 10 observações espalhadas nos últimos 10 dias
  const obs = [];
  for (let i = 10; i >= 1; i--) {
    obs.push(makeObs(`obs-${i}`, i, 10000 + i * 100));
  }
  obs.push(makeObs("obs-curr", 0, 8000));

  const policyWithE3 = {
    ...DEFAULT_PRICE_EVIDENCE_POLICY,
    windowDays: 10,
    e3Enabled: true,
    minimumCoverageRatio: 0.2, // critério relaxado para este fixture
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-curr",
    observations: obs,
    policy: policyWithE3,
    policyStatus: "approved",
  });

  assert.equal(evidence.state, "E3");
  assert.equal(evidence.priorMinCents, 10100);
  assert.ok(evidence.allowedClaims.some((c) => c.type === "historical_observed_minimum"));

  const legacy = projectCanonicalToLegacy(evidence);
  assert.equal(legacy.lowestVerified, true);
  assert.equal(legacy.previousMinPriceCents, 10100);
});

test("S-PRECO 7: Preço em faixa (priceMin !== priceMax) não é considerado configuração comparável", () => {
  const evidenceRange = {
    version: 1,
      ...completeConfiguration,
    variantKey: "var-1",
    priceMinCents: 5000,
    priceMaxCents: 8000,
    source: { marketplace: "shopee", method: "official_api", url: "https://shopee.com.br/item-1", capturedAt: "2026-10-01T10:00:00Z" },
  };

  assert.equal(buildConfigurationKey(evidenceRange), null);
});

test("S-PRECO 8: Seller claimed discount é rotulado como seller_claimed_discount e não como queda histórica", () => {
  const obs = {
    id: "obs-1",
    priceCents: 5000,
    originalPriceCents: 10000, // Preço riscado do vendedor
    observedAt: "2026-10-14T10:00:00Z",
    currency: "BRL",
    offerEvidence: {
      version: 1,
      ...completeConfiguration,
      variantKey: "var-1",
      source: { marketplace: "mercadolivre", method: "http_html", url: "https://ml.com.br/item-1", capturedAt: "2026-10-14T10:00:00Z" },
    },
  };

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-1",
    observations: [obs],
  });

  assert.equal(evidence.state, "E0");
  const sellerClaim = evidence.allowedClaims.find((c) => c.type === "seller_claimed_discount");
  assert.ok(sellerClaim);
  assert.equal(sellerClaim.textParameters.discountRate, 0.5);
  // Não há alegação de queda histórica
  assert.equal(evidence.allowedClaims.some((c) => c.type === "observed_drop"), false);
});

test("RX-07: Política draft ou padrão (e3Enabled = false) NUNCA autoriza E3", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const observations = [
    {
      id: "obs-1",
      priceCents: 10000,
      observedAt: "2026-10-01T10:00:00Z",
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
    {
      id: "obs-2",
      priceCents: 9000,
      observedAt: "2026-10-05T10:00:00Z",
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
    {
      id: "obs-3",
      priceCents: 8000,
      observedAt: "2026-10-10T10:00:00Z",
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
    {
      id: "obs-current",
      priceCents: 7000,
      observedAt: now.toISOString(),
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
  ];

  // Com política padrão (e3Enabled: false), mesmo com histórico farto, o estado é E2 e NUNCA E3
  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-current",
    observations,
    now,
  });

  assert.equal(evidence.state, "E2", "deve ser E2, nunca E3 sem política aprovada");
  assert.equal(evidence.allowedClaims.some((c) => c.type === "historical_observed_minimum"), false, "não deve permitir claim de mínimo histórico");
});

test("RX-07: Observações anteriores fora da janela da política (windowDays) são descartadas", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const observations = [
    {
      // 40 dias atrás: fora da janela de 30 dias
      id: "obs-old",
      priceCents: 5000,
      observedAt: "2026-09-01T10:00:00Z",
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
    {
      // Dentro da janela
      id: "obs-recent",
      priceCents: 9000,
      observedAt: "2026-10-10T10:00:00Z",
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
    {
      id: "obs-current",
      priceCents: 8000,
      observedAt: now.toISOString(),
      currency: "BRL",
      offerEvidence: { ...completeConfiguration, variantKey: "var-1" },
    },
  ];

  const evidence = calculatePriceEvidence({
    tenantId: "tenant-1",
    productId: "prod-1",
    currentObservationId: "obs-current",
    observations,
    policy: { ...DEFAULT_PRICE_EVIDENCE_POLICY, windowDays: 30 },
    now,
  });

  // obs-old tem preço 5000, mas está fora da janela, então priorMinCents deve ser 9000 (de obs-recent)
  assert.equal(evidence.priorCount, 1, "somente 1 observação dentro da janela");
  assert.equal(evidence.priorMinCents, 9000, "menor preço anterior deve desconsiderar pontos fora da janela");
  assert.equal(evidence.excludedCount, 1, "observação fora da janela deve constar como excluída");
});

test("unknown material conditions and missing currency never become comparable; policy must be approved",()=>{
 const now=new Date();const base={id:'current',priceCents:5000,observedAt:now.toISOString(),offerEvidence:{...completeConfiguration,variantKey:'one'}};
 const priors=Array.from({length:5},(_,i)=>({...base,id:`prior-${i}`,priceCents:10000,observedAt:new Date(now.getTime()-(i+1)*86400000).toISOString()}));
 const input={tenantId:'a',productId:'p',currentObservationId:'current',observations:[...priors,base],now,policy:{...DEFAULT_PRICE_EVIDENCE_POLICY,windowDays:5,e3Enabled:true,minimumCoverageRatio:0.5}};
 assert.equal(calculatePriceEvidence(input).state,'E1');
 const currencyInput={...input,observations:input.observations.map(o=>({...o,currency:'BRL'}))};
 assert.equal(calculatePriceEvidence({...currencyInput,policyStatus:'draft'}).state,'E2');
 assert.equal(calculatePriceEvidence({...currencyInput,policyStatus:'approved'}).state,'E3');
 assert.equal(buildConfigurationKey({variantKey:'one'}),null);
 assert.throws(()=>calculatePriceEvidence({...input,policy:{...input.policy,bucketHours:0}}),/invalid_policy/);
});
