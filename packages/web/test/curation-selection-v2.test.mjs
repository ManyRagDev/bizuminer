import assert from "node:assert/strict";
import test from "node:test";
import { composeCurationSelection } from "../lib/curation-selection-v2.ts";

const NOW = new Date("2026-11-14T12:00:00.000Z");
const FRESH = new Date(NOW.getTime() - 30 * 60_000).toISOString();
const STALE_DOM = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();

const basePolicy = {
  capacity: 4,
  categoryShare: 1,
  marketplaceShare: 0.5,
  challengerMargin: 0.1,
  dropFraction: 0.2,
  domEntryHours: 12,
  domStayHours: 24,
  shopeeHours: 1,
  pendingLimit: 24,
};

function candidate(id, marketplace, score, overrides = {}) {
  return {
    id,
    marketplace,
    category: overrides.category ?? "Casa",
    familyKey: overrides.familyKey ?? `fam:${id}`,
    equivalenceKey: overrides.equivalenceKey ?? null,
    optionKey: overrides.optionKey ?? "listing",
    priceType: "exact",
    currency: "BRL",
    priceCents: 10000,
    observationId: `obs:${id}`,
    revision: `rev:${id}`,
    verifiedAt: overrides.verifiedAt !== undefined ? overrides.verifiedAt : FRESH,
    verificationMethod: overrides.verificationMethod ?? (marketplace === "shopee" ? "id_lookup" : "listing"),
    available: overrides.available ?? "available",
    affiliateReady: overrides.affiliateReady ?? true,
    blocked: overrides.blocked ?? false,
    assessmentCurrent: overrides.assessmentCurrent ?? true,
    score,
    potentialScore: overrides.potentialScore ?? score,
    scoreVersion: "score-v2-test",
    normalizationRevision: "norm-v1",
  };
}

test("caso reproduzido: mantem tetos estritos por loja quando ha oferta diversa suficiente", () => {
  const pool = [
    candidate("shp1", "shopee", 100),
    candidate("shp2", "shopee", 99),
    candidate("shp3", "shopee", 98),
    candidate("shp4", "shopee", 97),
    candidate("amz1", "amazon", 60),
    candidate("amz2", "amazon", 59),
    candidate("amz3", "amazon", 58),
    candidate("amz4", "amazon", 57),
  ];
  const res = composeCurationSelection(pool, [], NOW, basePolicy);
  assert.deepEqual(
    res.selected.map((c) => c.id),
    ["shp1", "shp2", "amz1", "amz2"],
  );
  assert.deepEqual(res.exceptions, []);
  assert.equal(res.openSlots, 0);
  assert.deepEqual(res.exits, []);
});

test("limite por categoria: aplica categoryShare estrito e impede troca que rompa teto de categoria", () => {
  const policy = { ...basePolicy, categoryShare: 0.5, marketplaceShare: 1 };
  const pool = [
    candidate("casa1", "shopee", 100, { category: "Casa" }),
    candidate("casa2", "amazon", 99, { category: "Casa" }),
    candidate("casa3", "mercadolivre", 98, { category: "Casa" }),
    candidate("casa4", "aliexpress", 97, { category: "Casa" }),
    candidate("tec1", "mercadolivre", 60, { category: "Tecnologia" }),
    candidate("tec2", "aliexpress", 59, { category: "Tecnologia" }),
  ];
  const res = composeCurationSelection(pool, [], NOW, policy);
  assert.deepEqual(
    res.selected.map((c) => c.id),
    ["casa1", "casa2", "tec1", "tec2"],
  );
  assert.deepEqual(res.exceptions, []);
  assert.equal(res.openSlots, 0);
});

test("escassez legitima: flexibiliza em passos deterministicos somente quando faltam opcoes estritas e nunca relaxa gates factuais", () => {
  const pool = [
    candidate("shp1", "shopee", 100, { category: "Casa" }),
    candidate("shp2", "shopee", 99, { category: "Casa" }),
    candidate("shp3", "shopee", 98, { category: "Casa" }),
    candidate("shp4", "shopee", 97, { category: "Casa" }),
    candidate("amz1", "amazon", 60, { category: "Tecnologia" }),
    // Candidatos de outra loja bloqueados por gates factuais nao podem ser flexibilizados
    candidate("ml_blocked", "mercadolivre", 95, { blocked: true }),
    candidate("ml_no_link", "mercadolivre", 94, { affiliateReady: false }),
    candidate("ml_no_ai", "mercadolivre", 93, { assessmentCurrent: false }),
    candidate("ml_stale", "mercadolivre", 92, { verifiedAt: STALE_DOM, potentialScore: 50 }),
    candidate("shp_same_fam", "shopee", 99, { familyKey: "fam:shp1", category: "Tecnologia" }),
  ];
  const res = composeCurationSelection(pool, [], NOW, basePolicy);
  assert.deepEqual(
    res.selected.map((c) => c.id),
    ["shp1", "shp2", "amz1", "shp3"],
  );
  assert.deepEqual(res.exceptions, [{ id: "shp3", reason: "diversity_scarcity" }]);
  assert.equal(res.openSlots, 0);
  assert.ok(!res.selected.some((c) => ["ml_blocked", "ml_no_link", "ml_no_ai", "ml_stale", "shp_same_fam"].includes(c.id)));
});

test("escassez extrema aceita vitrine menor quando nao ha equivalentes validos suficientes", () => {
  const pool = [
    candidate("shp1", "shopee", 100),
    candidate("shp2", "shopee", 99, { familyKey: "fam:shp1" }),
    candidate("amz_unavail", "amazon", 80, { available: "unavailable" }),
  ];
  const res = composeCurationSelection(pool, [], NOW, basePolicy);
  assert.deepEqual(res.selected.map((c) => c.id), ["shp1"]);
  assert.equal(res.openSlots, 3);
  assert.deepEqual(res.exceptions, []);
});

test("passos deterministicos de escassez priorizam violar menos tetos antes de violar loja e categoria juntas", () => {
  const policy = { ...basePolicy, categoryShare: 0.5, marketplaceShare: 0.5 };
  const pool = [
    candidate("shp_casa1", "shopee", 100, { category: "Casa" }),
    candidate("shp_casa2", "shopee", 99, { category: "Casa" }),
    candidate("shp_casa3", "shopee", 98, { category: "Casa" }),
    candidate("shp_tec", "shopee", 97, { category: "Tecnologia" }),
    candidate("amz_tec", "amazon", 60, { category: "Tecnologia" }),
  ];
  const res = composeCurationSelection(pool, [], NOW, policy);
  // Strict preenche [shp_casa1, shp_casa2, amz_tec]; 1 vaga aberta vai para shp_tec (excesso apenas em loja, 0 em categoria) antes de shp_casa3 (excesso duplo).
  assert.deepEqual(
    res.selected.map((c) => c.id),
    ["shp_casa1", "shp_casa2", "amz_tec", "shp_tec"],
  );
  assert.deepEqual(res.exceptions, [{ id: "shp_tec", reason: "diversity_scarcity" }]);
});

test("desafiante pode substituir ocupante sem romper diversidade e respeitando margem de 10%", () => {
  const occupants = [
    { id: "shp1", entryScore: 100, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "shp2", entryScore: 85, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "amz1", entryScore: 60, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "amz2", entryScore: 55, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
  ];
  const pool = [
    candidate("shp1", "shopee", 100),
    candidate("shp2", "shopee", 85),
    candidate("amz1", "amazon", 60),
    candidate("amz2", "amazon", 55),
    candidate("shp3", "shopee", 96),  // > 85 * 1.1 (93.5) -> pode substituir shp2 mantendo 2 Shopee
    candidate("shp4", "shopee", 84),  // > 55 * 1.1, mas nao pode substituir amz2 porque romperia teto Shopee
    candidate("amz3", "amazon", 62),  // > 55 * 1.1 (60.5) -> substitui amz2 mantendo 2 Amazon
  ];
  const res = composeCurationSelection(pool, occupants, NOW, basePolicy);
  assert.deepEqual(
    res.selected.map((c) => c.id),
    ["shp1", "shp3", "amz1", "amz3"],
  );
  assert.deepEqual(res.exceptions, []);
  assert.deepEqual(res.exits, [
    { id: "shp2", reason: "better_challenger" },
    { id: "amz2", reason: "better_challenger" },
  ]);
});

test("evita falsa escassez por beco guloso combinatorio em loja e categoria (com e sem ocupante)", () => {
  const strictDualCap = {
    ...basePolicy,
    capacity: 2,
    marketplaceShare: 0.5, // max 1 por loja
    categoryShare: 0.5,    // max 1 por categoria
  };

  // Sem ocupantes: Shopee/Casa (100) bloqueia tanto Shopee/Tec (90) quanto Amazon/Casa (80).
  // A selecao deve escolher Shopee/Tec + Amazon/Casa sem declarar diversity_scarcity.
  const noOccupants = composeCurationSelection(
    [
      candidate("shp_casa", "shopee", 100, { category: "Casa" }),
      candidate("shp_tec", "shopee", 90, { category: "Tecnologia" }),
      candidate("amz_casa", "amazon", 80, { category: "Casa" }),
    ],
    [],
    NOW,
    strictDualCap,
  );
  assert.deepEqual(
    noOccupants.selected.map((c) => c.id),
    ["shp_tec", "amz_casa"],
  );
  assert.deepEqual(noOccupants.exceptions, []);
  assert.equal(noOccupants.openSlots, 0);

  // Com ocupante anterior que trava a combinacao estrita: quando chegam alternativas que
  // permitem preencher todas as vagas estritamente, reconsidera o ocupante para evitar falsa escassez.
  const withDeadlockOccupant = composeCurationSelection(
    [
      candidate("shp_casa", "shopee", 100, { category: "Casa" }),
      candidate("shp_tec", "shopee", 90, { category: "Tecnologia" }),
      candidate("amz_casa", "amazon", 80, { category: "Casa" }),
    ],
    [{ id: "shp_casa", entryScore: 100, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" }],
    NOW,
    strictDualCap,
  );
  assert.deepEqual(
    withDeadlockOccupant.selected.map((c) => c.id),
    ["shp_tec", "amz_casa"],
  );
  assert.deepEqual(withDeadlockOccupant.exceptions, []);
  assert.deepEqual(withDeadlockOccupant.exits, [{ id: "shp_casa", reason: "duplicate_or_capacity" }]);
});

test("composicao anterior formada sob escassez quando surgem alternativas diversas: restaura tetos estritos ou registra excecao real", () => {
  const previousScarcity = [
    { id: "shp1", entryScore: 95, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "shp2", entryScore: 94, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "shp3", entryScore: 93, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
    { id: "shp4", entryScore: 80, scoreVersion: "score-v2-test", normalizationRevision: "norm-v1" },
  ];

  // 0) Sem alternativas diversas, os 4 ocupantes Shopee permanecem com registro explicito de diversity_scarcity
  const resStillScarce = composeCurationSelection(
    [
      candidate("shp1", "shopee", 95),
      candidate("shp2", "shopee", 94),
      candidate("shp3", "shopee", 93),
      candidate("shp4", "shopee", 80),
    ],
    previousScarcity,
    NOW,
    basePolicy,
  );
  assert.deepEqual(resStillScarce.selected.map((c) => c.id), ["shp1", "shp2", "shp3", "shp4"]);
  assert.deepEqual(resStillScarce.exceptions, [
    { id: "shp3", reason: "diversity_scarcity" },
    { id: "shp4", reason: "diversity_scarcity" },
  ]);

  // 1) Quando chegam alternativas Amazon suficientes (60, 59), os tetos estritos sao restaurados
  // mesmo sem +10% sobre shp3/shp4, enquanto histerese continua protegendo shp1/shp2 de shp_extra (99).
  const resWeakDiverse = composeCurationSelection(
    [
      candidate("shp1", "shopee", 95),
      candidate("shp2", "shopee", 94),
      candidate("shp3", "shopee", 93),
      candidate("shp4", "shopee", 80),
      candidate("shp_extra", "shopee", 99),
      candidate("amz1", "amazon", 60),
      candidate("amz2", "amazon", 59),
    ],
    previousScarcity,
    NOW,
    basePolicy,
  );
  assert.deepEqual(resWeakDiverse.selected.map((c) => c.id), ["shp1", "shp2", "amz1", "amz2"]);
  assert.deepEqual(resWeakDiverse.exceptions, []);
  assert.deepEqual(resWeakDiverse.exits, [
    { id: "shp3", reason: "duplicate_or_capacity" },
    { id: "shp4", reason: "duplicate_or_capacity" },
  ]);

  // 2) Com apenas 1 Amazon (amz_strong), restaura o maximo estrito possivel (3 vagas) e
  // retem apenas shp3 sob escassez explicita, removendo shp4.
  const resStrongDiverse = composeCurationSelection(
    [
      candidate("shp1", "shopee", 95, { category: "Casa" }),
      candidate("shp2", "shopee", 94, { category: "Casa" }),
      candidate("shp3", "shopee", 93, { category: "Casa" }),
      candidate("shp4", "shopee", 80, { category: "Casa" }),
      candidate("amz_strong", "amazon", 92, { category: "Tecnologia" }),
    ],
    previousScarcity,
    NOW,
    { ...basePolicy, categoryShare: 0.5, marketplaceShare: 0.5 },
  );
  assert.deepEqual(resStrongDiverse.selected.map((c) => c.id), ["shp1", "shp2", "amz_strong", "shp3"]);
  assert.deepEqual(resStrongDiverse.exits, [{ id: "shp4", reason: "duplicate_or_capacity" }]);
  assert.deepEqual(resStrongDiverse.exceptions, [{ id: "shp3", reason: "diversity_scarcity" }]);

  // 3) Quando ocupante excedente expira ou sofre queda >20%, vaga aberta e preenchida estritamente por alternativa diversa
  const resVacancyRebalanced = composeCurationSelection(
    [
      candidate("shp1", "shopee", 95),
      candidate("shp2", "shopee", 94),
      candidate("shp3", "shopee", 70), // caiu >20% de 93 (70 < 74.4)
      // shp4 ausente/expirado
      candidate("shp_extra", "shopee", 90),
      candidate("amz1", "amazon", 60),
      candidate("amz2", "amazon", 59),
    ],
    previousScarcity,
    NOW,
    basePolicy,
  );
  assert.deepEqual(
    resVacancyRebalanced.selected.map((c) => c.id),
    ["shp1", "shp2", "amz1", "amz2"],
  );
  assert.deepEqual(resVacancyRebalanced.exceptions, []);
});

test("avaliacao hipotetica de pedidos de conferencia respeita estritos antes de flexibilizar e nao pede troca que rompa teto", () => {
  // Cenario A: vitrine cheia e estrita; candidato Shopee vencido com potentialScore alto
  // nao deve entrar em pending se sua entrada hipotetica romperia o teto de loja.
  const fullPool = [
    candidate("shp1", "shopee", 100),
    candidate("shp2", "shopee", 99),
    candidate("amz1", "amazon", 60),
    candidate("amz2", "amazon", 59),
    candidate("shp_stale", "shopee", 20, { verifiedAt: STALE_DOM, potentialScore: 95 }),
    candidate("amz_stale", "amazon", 20, { verifiedAt: STALE_DOM, potentialScore: 80 }),
  ];
  const resFull = composeCurationSelection(fullPool, [], NOW, basePolicy);
  assert.deepEqual(resFull.pending.map((c) => c.id), ["amz_stale"]);

  // Cenario B: ha 2 vagas abertas; candidatas Amazon pendentes devem preencher antes de flexibilizar Shopee
  const openPool = [
    candidate("shp1", "shopee", 100),
    candidate("shp2", "shopee", 99),
    candidate("shp_stale", "shopee", 20, { verifiedAt: STALE_DOM, potentialScore: 95 }),
    candidate("amz_stale1", "amazon", 20, { verifiedAt: STALE_DOM, potentialScore: 60 }),
    candidate("amz_stale2", "amazon", 20, { verifiedAt: STALE_DOM, potentialScore: 59 }),
  ];
  const resOpen = composeCurationSelection(openPool, [], NOW, basePolicy);
  assert.deepEqual(
    resOpen.pending.map((c) => c.id),
    ["amz_stale1", "amz_stale2"],
  );
});
