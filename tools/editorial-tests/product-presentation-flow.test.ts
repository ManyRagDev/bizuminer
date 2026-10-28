import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
const require = createRequire(import.meta.url);
const { getEditorialSelectionDesk, saveEditorialAssessment } = require("../../packages/web/lib/editorial-selection-db.ts");
const { getProductPresentations, hydrateProductPresentations, selectedPublicProducts } = require("../../packages/web/lib/product-presentation-db.ts");
const { validateEditorialAssessment } = require("../../packages/web/lib/editorial-selection.ts");
const fixture = await commercialFixture();
const { pg, factory } = fixture;
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
let passed = 0;
async function scenario(name: string, fn: () => Promise<void>) { await fn(); passed++; console.log(`PASS ${name}`); }
const publicQuery = async (query: string, args: unknown[] = []) => pg.transaction(async tx => {
  await tx.exec("set local role garimpa_public_runtime"); return (await tx.query(query, args)).rows as any[];
});
const evidence = { version: 2, currency: "BRL", priceType: "exact", originalPriceKind: "source_claimed",
  variantIdentity: { state: "source_verified", key: "transmitter-32", attributes: {} }, packageContents: ["Transmissor", "Cabo USB"], packageQuantity: 1 };
const candidate = async () => (await getEditorialSelectionDesk("a", factory)).candidates.find((row: any) => row.id === "p_a");
const assessment = async (status = "published") => {
  const current = await candidate();
  return { productId: "p_a", evidenceFingerprint: current.evidenceFingerprint, expectedAssessmentId: current.assessment?.id ?? null,
    presentation: { status, title: "Transmissor Modelo X32", caveat: "Confira a compatibilidade da conexão antes da compra.", cover: { headline: "Seu áudio em uma conexão compatível", imageApproved: true } },
    audience: "Quem precisa enviar áudio para um receptor compatível.", benefit: "Transmite áudio por uma conexão compatível.",
    purchaseContents: "Um transmissor e um cabo USB.", publicRationale: "O preço desta configuração atende ao teto revisado.", criticalDoubts: ["Anotação interna não publicável"], maxPriceCents: 2600,
    dimensions: Object.fromEntries(["audience", "utility", "value", "confidence", "clarity"].map(key => [key, { level: "strong", reason: "Evidência revisada na descrição do anúncio." }])) };
};
const save = async (status = "published") => { const result = await saveEditorialAssessment(await assessment(status), "user_a", "a", factory); assert.equal(result.ok, true, JSON.stringify(result)); return result.assessment; };
try {
  await scenario("pre-migration presentation fallback is explicit", async () => {
    assert.deepEqual(await hydrateProductPresentations([{ id: "p_a", title: "Título de origem" }], "a", factory), [{ id: "p_a", title: "Título de origem", sourceTitle: "Título de origem", displayTitle: "Título de origem", titleOrigin: "source" }]);
  });
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261023041600_optimize_public_link_reads.sql", import.meta.url), "utf8"));
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261027030237_compose_homepage_editions.sql", import.meta.url), "utf8"));
  await pg.exec(await readFile(new URL("../../packages/persistence/supabase/migrations/20261028041629_durable_product_presentation.sql", import.meta.url), "utf8"));
  await pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name,status) values('aff_a','a','a','A','active'),('aff_b','b','b','B','active');
    insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('user_b','b','auth_b');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner'),('aff_b','user_b','owner');
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at,category,image_url)
      values('p_a','a','aliexpress','10','Título original longo da fonte','https://example.test/a',2500,now(),'Tecnologia','https://example.test/a.jpg'),
        ('p_b','b','aliexpress','11','Produto privado de outra conta','https://example.test/b',2500,now(),'Tecnologia','https://example.test/b.jpg');
    insert into garimpa.product_curation(tenant_id,product_id,status) values('a','p_a','approved'),('b','p_b','approved') on conflict(tenant_id,product_id) do update set status='approved';
    insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values('pub_a','a','aff_a','p_a','web','ali-10','active','https://example.test/affiliate');
  `);
  await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('obs_a','a','p_a',2500,now(),$1)", [JSON.stringify(evidence)]);
  let published: any;
  await scenario("draft never publishes; explicit human publication persists with author and evidence", async () => {
    await save("draft");
    const draftCandidate = await candidate();
    assert.equal(draftCandidate.titleOrigin, "source"); assert.equal(draftCandidate.coverImageApproved, undefined);
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "source");
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").coverHeadline, undefined);
    published = await save();
    const presentation = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(presentation.displayTitle, "Transmissor Modelo X32"); assert.equal(presentation.editorialRevisionId, published.id);
    assert.equal(presentation.coverHeadline, "Seu áudio em uma conexão compatível"); assert.equal(presentation.coverImageApproved, true);
    assert.equal(presentation.currency, "BRL"); assert.equal(presentation.priceType, "exact");
    assert.equal((await pg.query("select actor_app_user_id,snapshot->>'title' title from garimpa.editorial_assessment where id=$1", [published.id])).rows[0].actor_app_user_id, "user_a");
  });
  await scenario("desk returned after save projects the published cover within its existing snapshot", async () => {
    let clients = 0;
    const countedFactory = () => { clients++; return factory(); };
    const desk = await getEditorialSelectionDesk("a", countedFactory);
    assert.equal(clients, 1, "Projection must reuse the desk transaction, not open another connection.");
    const current = desk.candidates.find((row: any) => row.id === "p_a");
    assert.equal(current.assessment.id, published.id);
    assert.equal(current.editorialRevisionId, published.id);
    assert.equal(current.displayTitle, "Transmissor Modelo X32");
    assert.equal(current.titleOrigin, "editorial");
    assert.equal(current.benefit, published.benefit);
    assert.equal(current.coverHeadline, "Seu áudio em uma conexão compatível");
    assert.equal(current.coverImageApproved, true);
  });
  await scenario("private doubts and judgments never leak through the public role or ID enumeration", async () => {
    const result = await publicQuery("select * from garimpa.public_product_presentations('a',array['p_a','p_b'])");
    assert.equal(result.length, 1); assert.ok(!JSON.stringify(result).match(/criticalDoubts|dimensions|actor_app|tenant_id|Anotação|publicRationale|snapshot/));
    assert.equal((await publicQuery("select * from garimpa.public_product_presentations('b',array['p_a','p_b'])")).length, 0);
    await assert.rejects(publicQuery("select * from garimpa.editorial_assessment"), /permission denied/);
    await assert.rejects(publicQuery("select * from garimpa.product_presentation_rows('a',null)"), /permission denied/);
    assert.equal((await publicQuery("select * from garimpa.public_product_presentations('a',null)")).length, 0);
    await assert.rejects(pg.transaction(async tx => { await tx.exec("set local role anon"); await tx.query("select * from garimpa.public_product_presentations('a',array['p_a'])"); }), /permission denied/);
  });
  await scenario("another account cannot review and concurrent review cannot overwrite", async () => {
    const input = await assessment();
    assert.equal((await saveEditorialAssessment(input, "user_b", "a", factory)).error, "forbidden");
    const draft = await assessment("draft");
    draft.presentation.title = "Rascunho ainda não publicado";
    draft.presentation.cover.headline = "Rascunho da nova chamada";
    draft.presentation.cover.imageApproved = false;
    assert.equal((await saveEditorialAssessment(draft, "user_a", "a", factory)).ok, true);
    const postSaveCandidate = await candidate();
    assert.equal(postSaveCandidate.assessment.presentation.status, "draft");
    assert.equal(postSaveCandidate.assessment.presentation.title, draft.presentation.title);
    assert.equal(postSaveCandidate.editorialRevisionId, published.id);
    assert.equal(postSaveCandidate.displayTitle, "Transmissor Modelo X32");
    assert.equal(postSaveCandidate.coverHeadline, "Seu áudio em uma conexão compatível");
    assert.equal(postSaveCandidate.coverImageApproved, true);
    assert.equal((await saveEditorialAssessment(input, "user_a", "a", factory)).error, "assessment_conflict");
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").editorialRevisionId, published.id);
    await pg.transaction(async tx => { await tx.exec("set local role garimpa_app; select set_config('garimpa.tenant_id','b',true)"); assert.equal((await tx.query("select * from garimpa.editorial_assessment where product_id='p_a'")).rows.length, 0); });
  });
  await scenario("source wording and price recapture retain durable utility even above offer ceiling", async () => {
    await pg.exec("update garimpa.product set title='Redação atualizada no anúncio',last_price_cents=4500 where id='p_a'");
    await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('obs_price','a','p_a',4500,now()+interval '1 second',$1)", [JSON.stringify(evidence)]);
    const current = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(current.displayTitle, "Transmissor Modelo X32"); assert.equal(current.sourceTitle, "Redação atualizada no anúncio"); assert.equal(current.benefit, published.benefit);
    assert.equal(current.coverImageApproved, true);
  });
  await scenario("empty homepage edition does not own the durable product copy", async () => {
    await pg.exec("insert into garimpa.editorial_selection(tenant_id,version,status,valid_until,actor_app_user_id) values('a',1,'active',now()+interval '24 hours','user_a')");
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "editorial");
  });
  await scenario("catalog search finds both source and approved editorial title", async () => {
    for (const search of ["X32", "Redação atualizada"]) {
      const [row] = await publicQuery("select garimpa.public_catalog('a',$1) value", [JSON.stringify({ search })]);
      assert.equal(row.value.total, 1);
    }
  });
  await scenario("material configuration change invalidates before refresh and restoration cannot resurrect approval", async () => {
    await pg.query("insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values('obs_changed','a','p_a',4500,now()+interval '2 seconds',$1)", [JSON.stringify({ ...evidence, packageQuantity: 2 })]);
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "source");
    await pg.exec("delete from garimpa.price_observation where id='obs_changed'");
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "source");
    assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").coverImageApproved, undefined);
    assert.ok((await pg.query("select presentation_invalidated_at from garimpa.editorial_assessment where id=$1", [published.id])).rows[0].presentation_invalidated_at);
    const [row] = await publicQuery("select garimpa.public_catalog('a','{\"search\":\"X32\"}') value"); assert.equal(row.value.total, 0);
  });
  await scenario("new human revision restores publication; withdrawing does not resurrect an older one", async () => {
    await save(); assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "editorial");
    await save("withdrawn"); assert.equal((await getProductPresentations(["p_a"], "a", factory)).get("p_a").titleOrigin, "source");
    const withdrawn = await candidate();
    assert.equal(withdrawn.assessment.presentation.status, "withdrawn");
    assert.equal(withdrawn.titleOrigin, "source"); assert.equal(withdrawn.editorialRevisionId, undefined);
    assert.equal(withdrawn.coverHeadline, undefined); assert.equal(withdrawn.coverImageApproved, undefined);
    const hydrated = await hydrateProductPresentations([{ id: "p_a", title: "Origem", benefit: "STALE", editorialRevisionId: "old", displayTitle: "stale", coverHeadline: "stale", coverImageApproved: true }], "a", factory);
    assert.equal(hydrated[0].benefit, undefined); assert.equal(hydrated[0].editorialRevisionId, undefined);
    assert.equal(hydrated[0].coverHeadline, undefined); assert.equal(hydrated[0].coverImageApproved, undefined);
  });
  await scenario("price claims cannot be published as durable benefit and no auto approval is introduced", async () => {
    const input = await assessment(); input.benefit = "O menor preço: R$ 25 hoje";
    assert.equal(validateEditorialAssessment(input).error, "presentation_requires_durable_copy");
  });
  await scenario("selected products revalidate public eligibility and discard invalid editorial fields", async () => {
    const selected = await selectedPublicProducts(["p_a", "p_b"], factory);
    assert.equal(selected.ready, true); assert.equal(selected.products.length, 1);
    assert.equal(selected.products[0].titleOrigin, "source"); assert.equal(selected.products[0].benefit, undefined);
    await pg.exec("update garimpa.publication set status='expired' where product_id='p_a'");
    assert.equal((await selectedPublicProducts(["p_a"], factory)).products.length, 0);
    await pg.exec("update garimpa.publication set status='active' where product_id='p_a'");
    assert.deepEqual((await publicQuery("select garimpa.public_selected_products(array(select 'p_'||i from generate_series(1,25)i)) products"))[0].products, []);
  });
  await scenario("cover approval follows the reviewed image and cannot resurrect after restoration", async () => {
    await save();
    assert.equal((await selectedPublicProducts(["p_a"], factory)).products[0].coverImageApproved, true);
    await pg.exec("update garimpa.product set image_url='https://example.test/replacement.jpg' where id='p_a'");
    let current = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(current.coverHeadline, undefined); assert.equal(current.coverImageApproved, undefined);
    const invalidatedDeskCandidate = await candidate();
    assert.equal(invalidatedDeskCandidate.titleOrigin, "source"); assert.equal(invalidatedDeskCandidate.coverImageApproved, undefined);
    await pg.exec("update garimpa.product set image_url='https://example.test/a.jpg' where id='p_a'");
    current = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(current.titleOrigin, "source"); assert.equal(current.coverImageApproved, undefined);
    const review = await assessment(); review.presentation.cover.imageApproved = false;
    assert.equal((await saveEditorialAssessment(review, "user_a", "a", factory)).ok, true);
    current = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(current.titleOrigin, "editorial"); assert.equal(current.coverImageApproved, false);
    const ordinary: any = await assessment(); delete ordinary.presentation.cover;
    assert.equal((await saveEditorialAssessment(ordinary, "user_a", "a", factory)).ok, true);
    current = (await getProductPresentations(["p_a"], "a", factory)).get("p_a");
    assert.equal(current.titleOrigin, "editorial"); assert.equal(current.coverHeadline, undefined); assert.equal(current.coverImageApproved, undefined);
  });
  await scenario("database rejects malformed cover data even outside the application validator", async () => {
    const revision = await save();
    for (const cover of [null, {}, { headline: "ok", imageApproved: true }, { headline: "x".repeat(73), imageApproved: true }, { headline: "Título curto", imageApproved: "true" }]) {
      await assert.rejects(pg.query(`insert into garimpa.editorial_assessment
        (tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,assessment,snapshot)
        select tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,
          jsonb_set(assessment,'{presentation,cover}',$1::jsonb),snapshot
        from garimpa.editorial_assessment where id=$2`, [JSON.stringify(cover), revision.id]), /invalid_presentation_cover/);
    }
  });
  await scenario("page hydration remains bounded instead of one query per card", async () => {
    let count = 0;
    const counted = () => { const original = factory(); const query = (...args: any[]) => { count++; return original(...args); }; return Object.assign(query, original); };
    const started = performance.now();
    const products = Array.from({ length: 24 }, (_, i) => ({ id: i ? `absent_${i}` : "p_a", title: "Fonte" }));
    await hydrateProductPresentations(products, "a", counted);
    assert.equal(count, 2); // readiness + one set projection; 24 IDs, no per-product round trips.
    console.log(JSON.stringify({ presentationHydrationQueries: count, isolatedFixtureMs: +(performance.now() - started).toFixed(2) }));
  });
  console.log(`${passed} product presentation scenarios passed (isolated PostgreSQL WASM).`);
} finally { await pg.close(); }
