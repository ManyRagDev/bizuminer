import assert from "node:assert/strict";
import test from "node:test";
import { MARKETPLACES, isKnownMarketplace, marketplaceDef, parseProductSlug, productSlug, slugCaseSql } from "../lib/marketplaces.ts";

test("productSlug e parseProductSlug fazem ida-e-volta para todo marketplace do registro", () => {
  for (const def of MARKETPLACES) {
    const slug = productSlug(def.slug, "ABC123");
    assert.equal(slug, `${def.slugPrefix}ABC123`);
    const parsed = parseProductSlug(slug);
    assert.deepEqual(parsed, { marketplace: def.slug, externalId: "ABC123" });
  }
});

test("slug legado ml-<external_id> continua resolvendo mercadolivre (M-R4)", () => {
  const parsed = parseProductSlug("ml-MLB1234567890");
  assert.deepEqual(parsed, { marketplace: "mercadolivre", externalId: "MLB1234567890" });
});

test("parseProductSlug devolve null para slug sem prefixo conhecido", () => {
  assert.equal(parseProductSlug("desconhecido-123"), null);
  assert.equal(parseProductSlug(""), null);
});

test("parseProductSlug devolve null quando o prefixo aparece sem id externo", () => {
  assert.equal(parseProductSlug("ml-"), null);
});

test("isKnownMarketplace e marketplaceDef concordam com o registro", () => {
  assert.equal(isKnownMarketplace("mercadolivre"), true);
  assert.equal(isKnownMarketplace("shopee"), true);
  assert.equal(isKnownMarketplace("amazon"), false);
  assert.equal(marketplaceDef("shopee")?.label, "Shopee");
  assert.equal(marketplaceDef("amazon"), null);
});

test("todo marketplace do registro declara evidenceLabel, ctaLabel e ratingLabel não vazios", () => {
  for (const def of MARKETPLACES) {
    assert.ok(def.evidenceLabel.length > 0, `${def.slug} sem evidenceLabel`);
    assert.ok(def.ctaLabel.length > 0, `${def.slug} sem ctaLabel`);
    assert.ok(def.ratingLabel.length > 0, `${def.slug} sem ratingLabel`);
  }
});

test("todo marketplace declara carimbo de origem (rótulo + tratamento)", () => {
  for (const def of MARKETPLACES) {
    assert.ok(def.stampLabel.length > 0, `${def.slug} sem stampLabel`);
    assert.ok(["filled", "outlined", "dashed"].includes(def.stampStyle), `${def.slug} com stampStyle inválido`);
  }
});

test("carimbos são visualmente distintos entre si — o ponto do recurso", () => {
  // Se duas lojas ganharem o mesmo par (rótulo + tratamento), o carimbo deixa
  // de identificar e vira ruído. Trava a regra antes da terceira loja entrar.
  const assinaturas = MARKETPLACES.map((def) => `${def.stampLabel}|${def.stampStyle}`);
  assert.equal(new Set(assinaturas).size, MARKETPLACES.length, "há carimbos duplicados no registro");
});

test("logo declarado aponta para /brand/marketplaces e tem alt e altura", () => {
  for (const def of MARKETPLACES) {
    if (!def.logo) continue;
    assert.match(def.logo.src, /^\/brand\/marketplaces\/[a-z0-9-]+\.(svg|png)$/, `${def.slug}: caminho de logo fora do padrão`);
    assert.ok(def.logo.alt.length > 0, `${def.slug}: logo sem alt (leitor de tela perde a origem)`);
    assert.ok(def.logo.height > 0, `${def.slug}: logo sem altura`);
  }
});

test("carimbo textual continua declarado mesmo com logo — é o fallback do 404", () => {
  // O logo vem do painel de afiliado e pode não estar no disco ainda.
  // Sem stampLabel, essa janela deixaria o card sem identificar a loja.
  for (const def of MARKETPLACES) {
    assert.ok(def.stampLabel.length > 0, `${def.slug}: sem fallback textual`);
  }
});

test("carimbo não usa cor como diferenciador (a cor já significa confiança)", () => {
  // --blue = evidência nossa, --acid = alegação do vendedor. Se um stampStyle
  // virar "azul"/"verde", colidiu com a linguagem de confiança do produto.
  const permitidos = new Set(["filled", "outlined", "dashed"]);
  for (const def of MARKETPLACES) {
    assert.ok(permitidos.has(def.stampStyle), `${def.slug}: stampStyle deve ser estrutural, não cromático`);
  }
});

test("slugCaseSql produz um WHEN por marketplace do registro", () => {
  const sqlText = slugCaseSql("p.marketplace", "p.external_id");
  for (const def of MARKETPLACES) {
    assert.match(sqlText, new RegExp(`when p\\.marketplace = '${def.slug}' then '${def.slugPrefix}' \\|\\| p\\.external_id`));
  }
});
