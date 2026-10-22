import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  recordManualConversion,
  recordCommissionEntry,
  recordSaaSRevenueEntry,
  recordOperationalCost,
  createOrGetImportBatchPreview,
  commitImportBatch: commitSelectedImportBatch,
  getImportBatch,
  getCommercialResults,
} = require("../../packages/web/lib/commercial-financial-db.ts");

const {
  calculateCommissionSummary,
  calculateSaaSRevenueSummary,
  calculateOperationalCostsSummary,
} = require("../../packages/web/lib/commercial-financial-contract.ts");

const {
  parseCanonicalCommissionCsv,
  calculateCanonicalReportDigest,
  sanitizeCsvCell,
  formatCsvRow,
  exportFinancialLedgerCsv,
} = require("../../packages/web/lib/commission-import-contract.ts");


// Explicit test operator selection: production service has no implicit "all" mode.
async function commitImportBatch(context:any,input:any,sqlFactory:any){
 if(input.selectedRowIds===undefined){const snapshot=await getImportBatch(context,input.batchId,sqlFactory);input={...input,selectedRowIds:snapshot?.rows.filter((r:any)=>r.decision==='imported').map((r:any)=>r.id)??[]};}
 return commitSelectedImportBatch(context,input,sqlFactory);
}
const { pg, factory } = await commercialFixture();

console.log("--- D09 COMMERCIAL FINANCIAL, COMMISSION LEDGER & IMPORT TESTS ---");

// Helper context generator
const ctx = (t: string, user = `user_${t}`, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: `auth_${user}`,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

// Seed test accounts
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_fin_a', 'fin_a', 'fin-a', 'Conta Financeira A'),
    ('aff_fin_b', 'fin_b', 'fin-b', 'Conta Financeira B'),
    ('aff_local', 'local', 'local', 'Conta Operadora Plataforma')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_fin_a', 'fin_a', 'auth_user_fin_a'),
    ('user_fin_b', 'fin_b', 'auth_user_fin_b'),
    ('user_local', 'local', 'auth_user_local')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_fin_a', 'afiliado'),
    ('user_fin_b', 'afiliado'),
    ('user_local', 'afiliado')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_fin_a', 'user_fin_a', 'owner'),
    ('aff_fin_b', 'user_fin_b', 'owner'),
    ('aff_local', 'user_local', 'owner')
  on conflict do nothing;
`);

const contextA = ctx("fin_a");
const contextB = ctx("fin_b");
const contextLocal = ctx("local");

// OS-020 / BUG-001: decimal comma survives adapter -> preview -> persisted ledger.
await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values ('aff_fin_br','fin_br','fin-br','CSV BR');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_fin_br','user_fin_a','owner');`);
const brContext = {...contextA,tenantId:"fin_br",affiliateId:"aff_fin_br"};
const br = await createOrGetImportBatchPreview(brContext, {marketplace:"shopee", csvContent:
  "Order id;Order time;Order amount;Estimated commission;Currency;Status\nORDER-BR-020;2026-10-15;150,50;15,05;BRL;Completed"}, factory);
await commitImportBatch(brContext,{batchId:br.batchId,expectedDigest:br.preview.fileDigest,committedBy:"user_fin_a"},factory);
const brValues = await pg.query("select order_value_cents,currency,status from garimpa.conversion where external_order_id='ORDER-BR-020'");
assert.deepEqual(brValues.rows.map((r:any)=>[r.order_value_cents,r.currency,r.status]), [[15050,"BRL","confirmed"]]);
const brCommission = await pg.query("select amount_cents from garimpa.commission_entry where conversion_id in (select id from garimpa.conversion where external_order_id='ORDER-BR-020')");
assert.equal(brCommission.rows[0]?.amount_cents,1505);
console.log("PASS OS-020 Brazilian CSV through committed ledger");

// ============================================================================
// 1. Idempotência de Arquivo e Reordenação (Mesmo Request / Arquivo Reordenado)
// ============================================================================
console.log("1. Testando idempotência de importação, reordenação e detecção de sobreposição...");

const csvOrder1 = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-alpha,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub-1,confirmed,confirmed
ord-beta,item-2,2026-10-14T11:00:00Z,20000,1000,BRL,shopee,sub-2,confirmed,confirmed`;

const csvOrder2Reordered = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-beta,item-2,2026-10-14T11:00:00Z,20000,1000,BRL,shopee,sub-2,confirmed,confirmed
ord-alpha,item-1,2026-10-14T10:00:00Z,10000,500,BRL,shopee,sub-1,confirmed,confirmed`;

// Primeiro upload
const res1 = await createOrGetImportBatchPreview(contextA, {
  marketplace: "shopee",
  csvContent: csvOrder1,
}, factory);
assert.equal(res1.alreadyExisted, false);
assert.equal(res1.preview.validRowsCount, 2);

// Re-upload exato mesmo arquivo: recupera mesmo lote
const res1Repeat = await createOrGetImportBatchPreview(contextA, {
  marketplace: "shopee",
  csvContent: csvOrder1,
}, factory);
assert.equal(res1Repeat.alreadyExisted, true);
assert.equal(res1Repeat.batchId, res1.batchId);

// Comitar lote 1
const commit1 = await commitImportBatch(contextA, {
  batchId: res1.batchId,
  expectedDigest: res1.preview.fileDigest,
}, factory);
assert.equal(commit1.committedRowsCount, 2);
assert.equal(commit1.alreadyCommitted, false);

// Recomitar o mesmo lote comitado é idempotente
const commit1Repeat = await commitImportBatch(contextA, {
  batchId: res1.batchId,
  expectedDigest: res1.preview.fileDigest,
}, factory);
assert.equal(commit1Repeat.alreadyCommitted, true);
assert.equal(commit1Repeat.committedRowsCount, 0);

// Agora fazer upload do arquivo reordenado com as mesmas ordens
const res2 = await createOrGetImportBatchPreview(contextA, {
  marketplace: "shopee",
  csvContent: csvOrder2Reordered,
}, factory);
// O canonicalDigest DEVE ser idêntico
assert.equal(res2.preview.canonicalDigest, res1.preview.canonicalDigest);
// Mas como as comissões já existem no ledger do tenant, ambas as linhas são marcadas como duplicatas!
assert.equal(res2.preview.duplicateCount, 2, "Linhas já comitadas devem ser marcadas como duplicate no novo lote");
assert.equal(res2.preview.validRowsCount, 0);

// Comitar lote 2 não deve duplicar nenhuma comissão
const commit2 = await commitImportBatch(contextA, {
  batchId: res2.batchId,
  expectedDigest: res2.preview.fileDigest,
}, factory);
assert.equal(commit2.committedRowsCount, 0, "Lote sobreposto com duplicatas comita 0 linhas");

console.log("✔ Idempotência de arquivo, reordenação e detecção de sobreposição validadas.");

// ============================================================================
// 2. Concorrência: Duas Confirmações Disputam Uma Gravação
// ============================================================================
console.log("2. Testando disputa concorrente de gravação de lote...");

const csvConcurrent = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-race-1,item-r1,2026-10-14T12:00:00Z,15000,750,BRL,mercadolivre,sub-r1,confirmed,confirmed
ord-race-2,item-r2,2026-10-14T13:00:00Z,25000,1250,BRL,mercadolivre,sub-r2,confirmed,confirmed`;

const resConc = await createOrGetImportBatchPreview(contextA, {
  marketplace: "mercadolivre",
  csvContent: csvConcurrent,
}, factory);

// Disparar dois commits concorrentes
const [race1, race2] = await Promise.allSettled([
  commitImportBatch(contextA, {
    batchId: resConc.batchId,
    expectedDigest: resConc.preview.fileDigest,
  }, factory),
  commitImportBatch(contextA, {
    batchId: resConc.batchId,
    expectedDigest: resConc.preview.fileDigest,
  }, factory),
]);

// Exatamente um deve vencer a disputa e o outro é rejeitado ou idempotente
const fulfilled = [race1, race2].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
const rejected = [race1, race2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

assert.ok(fulfilled.length >= 1, "Pelo menos um commit deve ser completado");
if (rejected.length > 0) {
  assert.match(rejected[0].reason.message, /concurrent_commit_conflict/);
} else {
  // Se ambos foram fulfilled sequencialmente, o segundo deve ter alreadyCommitted: true
  const [f1, f2] = fulfilled;
  assert.ok(f1.value.committedRowsCount === 2 || f2.value.committedRowsCount === 2);
  assert.ok(f1.value.alreadyCommitted || f2.value.alreadyCommitted);
}

console.log("✔ Disputa de concorrência com lease atômico validada.");

// ============================================================================
// 3. Falta de ID Seguro Exige Revisão & Linha Inválida Não Soma
// ============================================================================
console.log("3. Testando detecção de ID inseguro (revisão) e isolamento de linhas inválidas...");

const csvMixed = `externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState
ord-clean-1,it-1,2026-10-14T14:00:00Z,10000,500,BRL,shopee,sub-c1,confirmed,confirmed
,it-bad,2026-10-14T14:00:00Z,10000,500,BRL,shopee,sub-c2,confirmed,confirmed
ord-bad-date,it-3,not-a-date,10000,500,BRL,shopee,sub-c3,confirmed,confirmed
ord-bad-cents,it-4,2026-10-14T14:00:00Z,10000,-500,BRL,shopee,sub-c4,confirmed,confirmed
UNKNOWN,it-review,2026-10-14T14:00:00Z,20000,1000,BRL,shopee,sub-c5,confirmed,confirmed
ord-clean-1,it-1,2026-10-14T14:00:00Z,10000,500,BRL,shopee,sub-c1,confirmed,confirmed`;

const previewMixed = parseCanonicalCommissionCsv(csvMixed);
assert.equal(previewMixed.validRowsCount, 2, "Apenas ord-clean-1 e UNKNOWN são válidas sintaticamente");
assert.equal(previewMixed.errorRowsCount, 3, "3 linhas inválidas (id ausente, data ruim, centavos negativos)");
assert.equal(previewMixed.duplicateCount, 1, "1 duplicata dentro do arquivo");
assert.equal(previewMixed.reviewRequiredCount, 1, "1 linha com ID UNKNOWN exige revisão");

// Linhas inválidas e duplicadas NÃO devem somar nos totais!
assert.equal(previewMixed.totalOrderValueCents, 30000, "10000 + 20000 = 30000");
assert.equal(previewMixed.totalCommissionCents, 1500, "500 + 1000 = 1500");

// Registrar lote com review_required
const resMixed = await createOrGetImportBatchPreview(contextA, {
  marketplace: "shopee",
  csvContent: csvMixed,
}, factory);

// Operador seleciona explicitamente apenas 'imported', 'review_required' NÃO é selecionada explicitamente
const commitMixedAuto = await commitImportBatch(contextA, {
  batchId: resMixed.batchId,
  expectedDigest: resMixed.preview.fileDigest,
}, factory);
assert.equal(commitMixedAuto.committedRowsCount, 1, "Apenas ord-clean-1 selecionada explicitamente");

console.log("✔ Detecção de ID inseguro e rejeição de linhas inválidas validadas.");

// ============================================================================
// 4. Predecessores, Ajustes e Estornos (Reversed Reduz Net Cash)
// ============================================================================
console.log("4. Testando cadeia de predecessores e conciliação de estorno no caixa...");

// Criar conversão manual
const convRes = await recordManualConversion(contextA, {
  marketplace: "mercadolivre",
  externalOrderId: "ord-chain-100",
  occurredAt: "2026-10-14T10:00:00Z",
  orderValueCents: 50000,
  currency: "BRL",
  evidenceRef: "comprovante-01",
  verification: "documented",
  requestId: "req-chain-100",
}, factory);

// 1. Lançamento inicial: pending
const entryPending = await recordCommissionEntry(contextA, {
  conversionId: convRes.conversionId,
  sourceKey: "ml:chain:100:pen",
  amountCents: 2500,
  currency: "BRL",
  state: "pending",
  occurredAt: "2026-10-14T10:30:00Z",
  sourceRef: "relatorio-01",
}, factory);

// 2. Transição para confirmed
const entryConfirmed = await recordCommissionEntry(contextA, {
  conversionId: convRes.conversionId,
  sourceKey: "ml:chain:100:conf",
  amountCents: 2500,
  currency: "BRL",
  state: "confirmed",
  occurredAt: "2026-10-14T11:00:00Z",
  sourceRef: "relatorio-02",
  predecessorId: entryPending.entryId,
}, factory);

// 3. Transição para received (caixa efetivo)
const entryReceived = await recordCommissionEntry(contextA, {
  conversionId: convRes.conversionId,
  sourceKey: "ml:chain:100:rec",
  amountCents: 2500,
  currency: "BRL",
  state: "received",
  occurredAt: "2026-10-14T12:00:00Z",
  sourceRef: "extrato-bancario-01",
  predecessorId: entryConfirmed.entryId,
}, factory);

// 4. Estorno parcial: reversed de 500 centavos
const entryReversed = await recordCommissionEntry(contextA, {
  conversionId: convRes.conversionId,
  sourceKey: "ml:chain:100:rev",
  amountCents: 500,
  currency: "BRL",
  state: "reversed",
  occurredAt: "2026-10-14T13:00:00Z",
  sourceRef: "estorno-solicitado",
  predecessorId: entryReceived.entryId,
}, factory);

// Verificar conciliação via calculateCommissionSummary
const entriesList = [
  {
    id: entryPending.entryId,
    tenantId: "fin_a",
    conversionId: convRes.conversionId,
    sourceKey: "ml:chain:100:pen",
    amountCents: 2500,
    currency: "BRL",
    state: "pending" as const,
    occurredAt: "2026-10-14T10:30:00Z",
    sourceRef: "relatorio-01",
    createdAt: "2026-10-14T10:30:00Z",
  },
  {
    id: entryConfirmed.entryId,
    tenantId: "fin_a",
    conversionId: convRes.conversionId,
    sourceKey: "ml:chain:100:conf",
    amountCents: 2500,
    currency: "BRL",
    state: "confirmed" as const,
    occurredAt: "2026-10-14T11:00:00Z",
    sourceRef: "relatorio-02",
    predecessorId: entryPending.entryId,
    createdAt: "2026-10-14T11:00:00Z",
  },
  {
    id: entryReceived.entryId,
    tenantId: "fin_a",
    conversionId: convRes.conversionId,
    sourceKey: "ml:chain:100:rec",
    amountCents: 2500,
    currency: "BRL",
    state: "received" as const,
    occurredAt: "2026-10-14T12:00:00Z",
    sourceRef: "extrato-bancario-01",
    predecessorId: entryConfirmed.entryId,
    createdAt: "2026-10-14T12:00:00Z",
  },
  {
    id: entryReversed.entryId,
    tenantId: "fin_a",
    conversionId: convRes.conversionId,
    sourceKey: "ml:chain:100:rev",
    amountCents: 500,
    currency: "BRL",
    state: "reversed" as const,
    occurredAt: "2026-10-14T13:00:00Z",
    sourceRef: "estorno-solicitado",
    predecessorId: entryReceived.entryId,
    createdAt: "2026-10-14T13:00:00Z",
  },
];

const summaryChain = calculateCommissionSummary(entriesList, "BRL");
assert.equal(summaryChain.pendingCents, 0, "Pending foi superado");
assert.equal(summaryChain.confirmedCents, 0, "Confirmed foi superado");
assert.equal(summaryChain.reversedCents, 500, "500 centavos revertidos");
assert.equal(summaryChain.receivedCashCents, 2000, "Caixa líquido recebido = 2500 - 500 = 2000");

console.log("✔ Cadeia de predecessores e redução de caixa por estorno validadas.");

// ============================================================================
// 5. Isolamento de Moeda e Preservação de Ausência de Valor (Null != 0)
// ============================================================================
console.log("5. Testando isolamento de moeda e não fabricação de zero monetário...");

const multiCurrencyEntries = [
  {
    id: "brl-1",
    tenantId: "fin_a",
    sourceKey: "brl-comm",
    amountCents: 1000,
    currency: "BRL",
    state: "confirmed" as const,
    occurredAt: "2026-10-14T10:00:00Z",
    sourceRef: "test",
    createdAt: "2026-10-14T10:00:00Z",
  },
  {
    id: "usd-1",
    tenantId: "fin_a",
    sourceKey: "usd-comm",
    amountCents: 5000,
    currency: "USD",
    state: "confirmed" as const,
    occurredAt: "2026-10-14T10:00:00Z",
    sourceRef: "test",
    createdAt: "2026-10-14T10:00:00Z",
  },
];

const summaryBrl = calculateCommissionSummary(multiCurrencyEntries, "BRL");
assert.equal(summaryBrl.confirmedCents, 1000, "BRL não deve incluir valores de USD");

const summaryUsd = calculateCommissionSummary(multiCurrencyEntries, "USD");
assert.equal(summaryUsd.confirmedCents, 5000, "USD não deve incluir valores de BRL");

// Gravar venda com valor desconhecido (null)
const convNull = await recordManualConversion(contextA, {
  marketplace: "aliexpress",
  externalOrderId: "ord-null-val",
  occurredAt: "2026-10-14T10:00:00Z",
  orderValueCents: null, // Ausente
  currency: "BRL",
  requestId: "req-null-val",
}, factory);

const resultsA = await getCommercialResults(contextA, factory);
const convFound = resultsA.conversions.find((c: any) => c.id === convNull.conversionId);
assert.ok(convFound);
assert.equal(convFound.order_value_cents, null, "Ausência de valor deve persistir como null, nunca 0");

// Gravar custo de tempo humano sem tarifa (em segundos)
const costRes = await recordOperationalCost(contextA, {
  requestId: "req-cost-time-1",
  kind: "human_time",
  durationSeconds: 3600,
  amountCents: null, // Sem tarifa
  source: "revisao-editorial",
  periodStart: "2026-10-14T09:00:00Z",
  periodEnd: "2026-10-14T10:00:00Z",
}, factory);
assert.equal(costRes.alreadyExisted, false);

const costsSummary = calculateOperationalCostsSummary([
  {
    id: "c1",
    tenantId: "fin_a",
    kind: "human_time",
    durationSeconds: 3600,
    amountCents: null,
    source: "revisao-editorial",
    periodStart: "2026-10-14T09:00:00Z",
    periodEnd: "2026-10-14T10:00:00Z",
    verification: "declared",
    createdAt: "2026-10-14T10:00:00Z",
  },
], "BRL");
assert.equal(costsSummary.totalMonetaryCostCents, 0);
assert.equal(costsSummary.monetaryCostsByKindCents.human_time, 0);
assert.equal(costsSummary.unallocatedHumanSeconds, 3600, "Tempo humano sem tarifa permanece como segundos não alocados");

console.log("✔ Isolamento de moedas e integridade de nulos validados.");

// ============================================================================
// 6. Segurança de Acesso e RLS (Tenant A vs Tenant B / Anon)
// ============================================================================
console.log("6. Testando isolamento RLS e proteção de preview adulterado...");

// Tenant B tenta consultar lote de Tenant A
const batchCross = await getImportBatch(contextB, res1.batchId, factory);
assert.equal(batchCross, null, "Tenant B não deve enxergar lote de Tenant A");

// Tenant B tenta comitar lote de Tenant A
await assert.rejects(
  async () => {
    await commitImportBatch(contextB, {
      batchId: res1.batchId,
      expectedDigest: res1.preview.fileDigest,
    }, factory);
  },
  /batch_not_found/,
  "Tenant B não deve conseguir comitar lote de Tenant A",
);

// Preview adulterado: digest esperado divergente
await assert.rejects(
  async () => {
    await commitImportBatch(contextA, {
      batchId: resMixed.batchId,
      expectedDigest: "digest-falso-adulterado",
    }, factory);
  },
  /preview_digest_mismatch/,
  "Commit com digest adulterado deve ser rejeitado",
);

console.log("✔ Isolamento RLS e proteção contra preview adulterado validados.");

// ============================================================================
// 7. Visibilidade da Assinatura da Plataforma (Invisível ao Cliente)
// ============================================================================
console.log("7. Testando invisibilidade da receita SaaS para contas de clientes...");

// Gravar receita SaaS na conta da plataforma (local)
const saasRes = await recordSaaSRevenueEntry(contextLocal, {
  obligationKey: "sub-pilot-2026-10",
  eventKey: "sub-pilot-billed-01",
  contractRef: "contrato-piloto-01",
  amountCents: 29900,
  currency: "BRL",
  state: "billed",
  occurredAt: "2026-10-01T00:00:00Z",
  sourceRef: "fatura-01",
}, factory);
assert.ok(saasRes.entryId);

// Conta de cliente (fin_a) tenta registrar receita SaaS: negado!
await assert.rejects(
  async () => {
    await recordSaaSRevenueEntry(contextA, {
      obligationKey: "sub-fake",
      eventKey: "sub-fake-event",
      contractRef: "fake",
      amountCents: 1000,
      currency: "BRL",
      state: "billed",
      occurredAt: "2026-10-01T00:00:00Z",
      sourceRef: "fake",
    }, factory);
  },
  /platform_owner_required/,
  "Apenas o owner da plataforma pode registrar receita SaaS",
);

// Conta de cliente (fin_a) consulta resultados comerciais: receitas SaaS permanecem vazias
const resultsClient = await getCommercialResults(contextA, factory);
assert.deepEqual(resultsClient.revenues, [], "Receitas SaaS da plataforma devem ser invisíveis ao cliente");

// Conta da plataforma consulta resultados: enxerga a receita
const resultsPlatform = await getCommercialResults(contextLocal, factory);
assert.ok(resultsPlatform.revenues.length >= 1, "Owner da plataforma deve enxergar receita SaaS");

console.log("✔ Invisibilidade de receita SaaS para clientes validada.");

// ============================================================================
// 8. Sanitização de Injeção de Fórmulas no Export CSV (CSV Injection)
// ============================================================================
console.log("8. Testando higienização estrita de injeção de fórmulas no export CSV...");

const dangerousCells = [
  "=cmd|' /C calc'!A0",
  "+5-2",
  "-100",
  "@SUM(A1:A10)",
  "\tTAB_INJECT",
  "\rCARRIAGE_INJECT",
  "TextoNormal",
  "123",
];

const sanitizedCells = dangerousCells.map(sanitizeCsvCell);
assert.equal(sanitizedCells[0], "'=cmd|' /C calc'!A0", "= deve ser prefixado com '");
assert.equal(sanitizedCells[1], "'+5-2", "+ deve ser prefixado com '");
assert.equal(sanitizedCells[2], "'-100", "- deve ser prefixado com '");
assert.equal(sanitizedCells[3], "'@SUM(A1:A10)", "@ deve ser prefixado com '");
assert.equal(sanitizedCells[6], "TextoNormal", "Texto normal permanece inalterado");
assert.equal(sanitizedCells[7], "123", "Número permanece inalterado");

// Exportação completa de extrato com dados maliciosos tratados
const exportCsv = exportFinancialLedgerCsv(
  [
    {
      marketplace: "shopee",
      occurredAt: "2026-10-14T10:00:00Z",
      orderValueCents: 10000,
      currency: "BRL",
      verification: "=HYPERLINK(\"http://evil.com\")",
      status: "confirmed",
      externalOrderId: "@malicious-id",
    },
  ],
  [
    {
      sourceKey: "+calc-entry",
      amountCents: 500,
      currency: "BRL",
      state: "confirmed",
      occurredAt: "2026-10-14T10:00:00Z",
      sourceRef: "-cmd",
    },
  ],
);

// Nenhuma linha deve iniciar com fórmulas perigosas desprotegidas
const lines = exportCsv.split("\n");
for (const line of lines.slice(1)) {
  const parts = line.split(",");
  for (const part of parts) {
    const unquoted = part.replace(/^"|"$/g, "");
    assert.ok(
      !unquoted.startsWith("=") &&
      !unquoted.startsWith("+") &&
      !unquoted.startsWith("-") &&
      !unquoted.startsWith("@"),
      `Célula perigosa não sanitizada encontrada: ${part}`,
    );
  }
}

console.log("✔ Sanitização de injeção de fórmulas no export CSV validada.");

console.log("\nTODOS OS 8 TESTES DE INTEGRAÇÃO DO LEDGER FINANCEIRO E IMPORTAÇÃO PASSARAM COM SUCESSO!");
