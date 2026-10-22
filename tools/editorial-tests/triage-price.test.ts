import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url);
const { loadAutomatedTriageCandidates, triageInputStillCurrent } = require("../../packages/web/lib/triage-candidates-db.ts");
const { processIngestionPipeline } = require("../../packages/web/lib/curation-pipeline.ts");
const { applyAutomatedTriageDecisions, curationQueue, curationSummary, reviewProduct } = require("../../packages/web/lib/curation-db.ts");
const { confirmSpotCheck, rejectAndLearnSpotCheck, getRecentSpotCheckProducts } = require("../../packages/web/lib/editorial-compass.ts");
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
const pg = new PGlite();
function adapter(client: Pick<PGlite, "query" | "exec">): any {
  const sql: any = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const parameters: unknown[] = [];
    let query = parts[0];
    for (let index = 0; index < values.length; index++) {
      const value = values[index] as any;
      if (value?.rawFragment !== undefined) query += value.rawFragment;
      else { parameters.push(value); query += `$${parameters.length}`; }
      query += parts[index + 1];
    }
    return (await client.query(query, parameters)).rows;
  };
  sql.unsafe = (query: string, values: unknown[] = []) => ({ rawFragment: query,
    then: (resolve: any, reject: any) => client.query(query, values).then((result) => result.rows).then(resolve, reject) });
  sql.json = (value: unknown) => JSON.stringify(value);
  sql.end = async () => {};
  sql.begin = async (run: (tx: any) => Promise<unknown>) => pg.transaction((tx) => run(adapter(tx)));
  return sql;
}
const sql = adapter(pg);
const factory: any = () => adapter(pg);
let passed = 0;
async function scenario(label: string, run: () => Promise<void>) {
  await run(); passed++; console.log(`PASS ${label}`);
}

await pg.exec(`
  create schema garimpa;
  create table garimpa.product(id text,tenant_id text,marketplace text,title text,category text,
    family_key text,last_seen_at timestamptz,primary key(id,tenant_id));
  create table garimpa.product_curation(product_id text,tenant_id text,status text,reason_code text,
    deferred_until timestamptz,created_at timestamptz,primary key(product_id,tenant_id));
  create table garimpa.curation_event(id bigint generated always as identity primary key,
    product_id text,tenant_id text,actor_type text,to_status text,reason_code text,metadata jsonb);
  alter table garimpa.product_curation add reason_detail text,
    add reviewed_by_app_user_id text,add reviewed_at timestamptz,add updated_at timestamptz;
  alter table garimpa.curation_event add from_status text,add reason_detail text,
    add from_reason_code text,add from_reason_detail text,add from_deferred_until timestamptz,
    add actor_app_user_id text,add policy_version text,add triage_run_id text;
  create table garimpa.price_observation(id text primary key,tenant_id text,product_id text,price_cents int,
    original_price_cents int,rating_star float,sales_count int,observed_at timestamptz,offer_evidence jsonb);
  create table garimpa.capture_run(id text primary key,tenant_id text,parameters jsonb);
  alter table garimpa.price_observation add capture_run_id text;
  alter table garimpa.product add external_id text default '123',
    add product_url text default 'https://example.com/product',add image_url text;
  alter table garimpa.curation_event add created_at timestamptz default now(),
    add group_id text,add review_session_id text,add bulk_action_id text;
  create view garimpa.curation_queue_facts as select p.*,c.status,c.reason_code,c.reason_detail,c.deferred_until,
    null::text as family_label,null::text as family_method,null::text as family_version,
    c.created_at as queued_at,o.price_cents,o.rating_star,o.sales_count,o.observed_at,o.original_price_cents,
    null::float as claimed_discount_rate,null::text as sales_label,
    4::int as observation_count,14::int as history_days,10000::int as previous_min_price_cents,true as lowest_verified,
    null::text as presenting_capture_run_id,null::text as presenting_marketplace,
    null::text as presenting_plan_id,null::text as presenting_query_id,null::text as presenting_mode,
    null::text as presenting_target_category,null::text as presenting_target_family
    from garimpa.product p join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
    join lateral (select * from garimpa.price_observation o where o.product_id=p.id and o.tenant_id=p.tenant_id
      order by observed_at desc,id desc limit 1) o on true;
`);
const evidence = { version: 1, variantKey: "mixer-completo", packageQuantity: 1, packageContents: ["Mixer", "Cabo"] };
async function reset() {
  await pg.exec("truncate garimpa.curation_event,garimpa.price_observation,garimpa.product_curation,garimpa.product restart identity");
}
async function seed(options: {
  id?: string; tenant?: string; status?: string; reason?: string | null; price?: number;
  previousPrice?: number; latestEvidence?: unknown; priorEvidence?: unknown;
  ages?: number[]; actor?: string; metadata?: unknown;
} = {}) {
  const { id = "flash", tenant = "local", status = "pending", reason = null, price = 1100,
    previousPrice = 10000, latestEvidence = evidence, priorEvidence = evidence,
    ages = [14,10,7], actor, metadata = {} } = options;
  await pg.query("insert into garimpa.product(id,tenant_id,marketplace,title,category,family_key,last_seen_at) values($1,$2,'shopee','Mixer portátil','Cozinha',null,now())", [id,tenant]);
  await pg.query("insert into garimpa.product_curation(product_id,tenant_id,status,reason_code,created_at) values($1,$2,$3,$4,now()-interval '2 days')", [id,tenant,status,reason]);
  await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,original_price_cents,rating_star,sales_count,observed_at,offer_evidence) values($1,$2,$3,$4,10000,4.8,100,now(),$5)`,
    [`${tenant}:${id}:current`,tenant,id,price,JSON.stringify(latestEvidence)]);
  for (const [index, age] of ages.entries()) {
    await pg.query(`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,original_price_cents,rating_star,sales_count,observed_at,offer_evidence) values($1,$2,$3,$4,10000,4.8,100,now()-($5*interval '1 day'),$6)`,
      [`${tenant}:${id}:prior-${index}`,tenant,id,previousPrice,age,JSON.stringify(priorEvidence)]);
  }
  if (actor) await pg.query(`insert into garimpa.curation_event(product_id,tenant_id,actor_type,to_status,reason_code,metadata)
    values($1,$2,$3,$4,$5,$6)`, [id,tenant,actor,status,reason,JSON.stringify(metadata)]);
}
const load = (tenant = "local", limit = 100) => loadAutomatedTriageCandidates(sql,tenant,limit);
const evaluator = async (items: any[]) => items.map((item) => ({ productId: item.productId,
  desirabilityScore: 5, hasMisleadingClaim: false, isAdultOrUnsafe: false,
  editorialCategory: "gadget_util", justification: "Produto útil; caso isolado de teste." }));

try {
  await scenario("Triagem do lote exclui produtos capturados em outro lote e tenant", async () => {
    await reset(); await seed({id:"in-batch",price:4000}); await seed({id:"other-batch",price:4000});
    const batch="00000000-0000-0000-0000-000000000001";
    await pg.query("insert into garimpa.capture_run values('batch-run','local',$1)",[JSON.stringify({operationBatchId:batch})]);
    await pg.exec("update garimpa.price_observation set capture_run_id='batch-run' where product_id='in-batch'");
    assert.deepEqual((await loadAutomatedTriageCandidates(sql,"local",20,2000,batch)).map((p:any)=>p.id),["in-batch"]);
    assert.equal((await loadAutomatedTriageCandidates(sql,"local",20)).length,2);
  });
  await scenario("SQL real permite R$ 100 para R$ 11 e entrega a referência à IA", async () => {
    await reset(); await seed();
    const [candidate] = await load();
    assert.equal(candidate.comparablePriceHistory.referencePriceCents,10000);
    assert.equal(candidate.comparablePriceHistory.observationCount,3);
    assert.equal(candidate.comparablePriceHistory.historyDays,7);
    const [decision] = await processIngestionPipeline([candidate],{autoPublish:true,evaluator});
    assert.equal(decision.status,"approved");
    assert.equal(decision.pricePolicy.outcome,"verified_discount");
    assert.equal(await triageInputStillCurrent(sql,"local",candidate.id,candidate.inputVersion),true);
  });
  await scenario("Preço riscado sem observações anteriores não comprova valor", async () => {
    await reset(); await seed({ages:[]});
    const [decision] = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
    assert.equal(decision.reasonCode,"insufficient_evidence");
  });
  await scenario("Histórico de variante, quantidade ou conteúdo diferentes não abre exceção", async () => {
    for (const latestEvidence of [{...evidence,variantKey:"so-cabo"},
      {...evidence,packageQuantity:2},{...evidence,packageContents:["Cabo"]}]) {
      await reset(); await seed({latestEvidence});
      const [decision] = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
      assert.equal(decision.reasonCode,"insufficient_evidence");
    }
  });
  await scenario("Preço de faixa, chave vazia ou identidade ausente não comprova configuração", async () => {
    for (const latestEvidence of [null,{...evidence,variantKey:""},{...evidence,variantKey:123},
      {...evidence,priceMinCents:1100,priceMaxCents:10000}]) {
      await reset(); await seed({latestEvidence});
      const [decision] = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
      assert.equal(decision.reasonCode,"insufficient_evidence");
    }
  });
  await scenario("Exclui a observação atual e exige três anteriores em sete dias dentro de 90", async () => {
    for (const ages of [[14,7],[6,3,1],[120,110,100]]) {
      await reset(); await seed({ages});
      const [decision] = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
      assert.equal(decision.reasonCode,"insufficient_evidence");
    }
  });
  await scenario("Um preço anterior baixo impede escolher só as referências altas", async () => {
    await reset(); await seed();
    await pg.query("update garimpa.price_observation set price_cents=1500 where id=$1",["local:flash:prior-1"]);
    const [decision] = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
    assert.equal(decision.reasonCode,"weak_offer");
  });
  await scenario("Recupera retenção automática antiga pelo piso somente com evidência válida", async () => {
    await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule"});
    const candidates = await load();
    assert.equal(candidates.length,1);
    assert.equal((await processIngestionPipeline(candidates,{autoPublish:true,evaluator}))[0].status,"approved");
    await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule",ages:[]});
    assert.equal((await load()).length,0);
  });
  await scenario("Falta de evidência do piso volta quando há histórico; outros motivos ficam preservados", async () => {
    await reset(); await seed({status:"held",reason:"insufficient_evidence",actor:"rule",
      metadata:{automation:{pricePolicy:{version:"triage-value-v1",outcome:"unverified_value"}}}});
    assert.equal((await load()).length,1);
    await reset(); await seed({status:"held",reason:"insufficient_evidence",actor:"rule"});
    assert.equal((await load()).length,0);
  });
  await scenario("Não reavalia decisões humanas, aprovados, rejeitados, saturação ou anotados", async () => {
    for (const options of [
      {status:"held",reason:"weak_offer",actor:"human"},
      {status:"approved",actor:"human"},{status:"rejected",reason:"low_utility",actor:"llm"},
      {status:"held",reason:"family_saturation",actor:"rule"}, {status:"pending",actor:"llm"},
    ]) {
      await reset(); await seed(options);
      assert.equal((await load()).length,0,JSON.stringify(options));
    }
  });
  await scenario("Decisão humana posterior prevalece mesmo se o status held for o mesmo", async () => {
    await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule"});
    const [candidate] = await load();
    await pg.exec(`insert into garimpa.curation_event(product_id,tenant_id,actor_type,to_status,reason_code,metadata)
      values('flash','local','human','held','weak_offer','{}')`);
    assert.equal((await load()).length,0);
    assert.equal(await triageInputStillCurrent(sql,"local",candidate.id,candidate.inputVersion),false);
  });
  await scenario("Mudança de preço ou evidência invalida o contexto mesmo no mesmo ID de observação", async () => {
    for (const change of ["price_cents=1500",`offer_evidence='{"variantKey":"outra"}'::jsonb`,"observed_at=now()+interval '1 minute'"]) {
      await reset(); await seed();
      const [candidate] = await load();
      await pg.exec(`update garimpa.price_observation set ${change} where id='local:flash:current'`);
      assert.equal(await triageInputStillCurrent(sql,"local",candidate.id,candidate.inputVersion),false);
    }
  });
  await scenario("Referência não cruza tenant e preço válido fica à frente de revisão sem evidência", async () => {
    await reset(); await seed({ages:[]}); await seed({tenant:"other"});
    await seed({id:"verified"});
    const candidates = await load("local",1);
    assert.equal(candidates.length,1);
    assert.equal(candidates[0].id,"verified");
    assert.equal((await load()).find((candidate: any) => candidate.id==="flash").comparablePriceHistory.referencePriceCents,null);
  });
  await scenario("Adiados e produtos fora da validade continuam fora da triagem", async () => {
    await reset(); await seed();
    await pg.exec("update garimpa.product_curation set deferred_until=now()+interval '1 day'");
    assert.equal((await load()).length,0);
    await pg.exec("update garimpa.product_curation set deferred_until=null; update garimpa.product set last_seen_at=now()-interval '8 days'");
    assert.equal((await load()).length,0);
  });
  await scenario("Persiste aprovação recuperada e fatos da política sem repetir decisão", async () => {
    await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule"});
    const decisions = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
    const summary = await applyAutomatedTriageDecisions(decisions,"local","isolated-run",factory);
    assert.equal(summary.approved,1);
    const stored = (await pg.query<any>("select status,reason_code from garimpa.product_curation")).rows[0];
    assert.deepEqual(stored,{status:"approved",reason_code:null});
    const event = (await pg.query<any>("select * from garimpa.curation_event order by id desc limit 1")).rows[0];
    assert.equal(event.from_status,"held"); assert.equal(event.to_status,"approved");
    assert.equal(event.policy_version,"ai-triage-v2");
    assert.equal(event.metadata.automation.pricePolicy.outcome,"verified_discount");
    assert.equal(event.metadata.automation.inputVersion.status,"held");
    assert.equal(event.triage_run_id,"isolated-run");
    assert.equal((await applyAutomatedTriageDecisions(decisions,"local","isolated-run",factory)).approved,0);
    assert.equal((await pg.query<any>("select count(*)::int as count from garimpa.curation_event")).rows[0].count,2);
  });
  await scenario("Com piloto desligado, retenção recuperada passa de held para pending no banco", async () => {
    await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule"});
    const decisions = await processIngestionPipeline(await load(),{autoPublish:false,evaluator});
    const summary = await applyAutomatedTriageDecisions(decisions,"local",undefined,factory);
    assert.equal(summary.annotatedPending,1); assert.equal(summary.approved,0);
    assert.equal((await pg.query<any>("select status from garimpa.product_curation")).rows[0].status,"pending");
    assert.equal((await load()).length,0);
  });
  await scenario("Aplicação descarta avaliação vencida por ação humana ou mudança de preço", async () => {
    for (const changed of ["human","price"]) {
      await reset(); await seed({status:"held",reason:"weak_offer",actor:"rule"});
      const decisions = await processIngestionPipeline(await load(),{autoPublish:true,evaluator});
      if (changed==="human") await pg.exec(`insert into garimpa.curation_event(product_id,tenant_id,actor_type,to_status,reason_code,metadata)
        values('flash','local','human','held','weak_offer','{}')`);
      else await pg.exec("update garimpa.price_observation set price_cents=1200 where id='local:flash:current'");
      const before = (await pg.query<any>("select count(*)::int as count from garimpa.curation_event")).rows[0].count;
      assert.equal((await applyAutomatedTriageDecisions(decisions,"local",undefined,factory)).approved,0);
      assert.equal((await pg.query<any>("select status from garimpa.product_curation")).rows[0].status,"held");
      assert.equal((await pg.query<any>("select count(*)::int as count from garimpa.curation_event")).rows[0].count,before);
    }
  });
  await scenario("Pendências separam aguardando, retidos e adiados; contadores refletem a fila recente", async () => {
    await reset(); await seed({id:"pending"}); await seed({id:"held",status:"held",reason:"weak_offer",actor:"rule"});
    await seed({id:"deferred",status:"held",reason:"insufficient_evidence",actor:"rule"});
    await seed({id:"stale"}); await seed({id:"approved",status:"approved"}); await seed({id:"outside",tenant:"other"});
    await pg.exec("update garimpa.product_curation set deferred_until=now()+interval '7 days' where product_id='deferred'; update garimpa.product set last_seen_at=now()-interval '8 days' where id='stale'");
    assert.deepEqual((await curationQueue(20,"local","awaiting",factory)).map((p:any)=>p.id),["pending"]);
    assert.deepEqual((await curationQueue(20,"local","held",factory)).map((p:any)=>p.id),["held"]);
    assert.deepEqual((await curationQueue(20,"local","deferred",factory)).map((p:any)=>p.id),["deferred"]);
    const localContext = {
      tenantId: "local",
      affiliateId: "aff_local",
      actor: "worker" as const,
      actorAppUserId: "u_local",
      authenticatedAuthUserId: null,
      membershipRole: "owner",
      requestId: "req_test",
    };
    const summary = await curationSummary("local", factory, localContext);
    assert.equal(summary.awaiting,1); assert.equal(summary.held,1); assert.equal(summary.deferred,1); assert.equal(summary.approved,1);
  });
  await scenario("Revisão humana de retido e adiado conclui decisão e preserva o motivo anterior", async () => {
    await reset(); await seed({status:"held",reason:"insufficient_evidence",actor:"rule"});
    await pg.exec("update garimpa.product_curation set reason_detail='Sem variante verificada',deferred_until=now()+interval '7 days'");
    const result = await reviewProduct({productId:"flash",decision:"approve",status:"approved",reasonCode:null,reasonDetail:null},"reviewer","local",{},factory);
    assert.ok(result);
    const stored = (await pg.query<any>("select status,deferred_until,reason_code from garimpa.product_curation")).rows[0];
    assert.deepEqual(stored,{status:"approved",deferred_until:null,reason_code:null});
    const event = (await pg.query<any>("select * from garimpa.curation_event order by id desc limit 1")).rows[0];
    assert.equal(event.from_reason_detail,"Sem variante verificada"); assert.ok(event.from_deferred_until);
    assert.equal(event.actor_type,"human");
  });
  await scenario("Qualidade só amostra aprovação recente da IA com produto recente", async () => {
    await reset();
    for (const id of ["valid","old-decision","stale-offer","human-reviewed"]) await seed({id,status:"approved",actor:"llm"});
    await pg.exec("update garimpa.curation_event set created_at=now()-interval '8 days' where product_id='old-decision'; update garimpa.product set last_seen_at=now()-interval '8 days' where id='stale-offer'; insert into garimpa.curation_event(product_id,tenant_id,actor_type,to_status,metadata) values('human-reviewed','local','human','approved','{}')");
    const products = await getRecentSpotCheckProducts("local",12,factory);
    assert.deepEqual(products.map((p:any)=>p.id),["valid"]); assert.ok(products[0].sourceEventId);
  });
  await scenario("Confirmação de qualidade é persistida uma vez e não altera decisão humana posterior", async () => {
    await reset(); await seed({status:"approved",actor:"llm"});
    const [item] = await getRecentSpotCheckProducts("local",12,factory);
    assert.equal(await confirmSpotCheck("flash","reviewer","local",item.sourceEventId,factory),true);
    assert.equal(await confirmSpotCheck("flash","reviewer","local",item.sourceEventId,factory),false);
    assert.equal(await rejectAndLearnSpotCheck("flash","Correção vencida","reviewer","local",item.sourceEventId,factory),false);
    assert.equal((await getRecentSpotCheckProducts("local",12,factory)).length,0);
    assert.equal((await pg.query<any>("select status from garimpa.product_curation")).rows[0].status,"approved");
    assert.equal((await pg.query<any>("select count(*)::int as count from garimpa.curation_event")).rows[0].count,2);
  });
  await scenario("Correção de qualidade rejeita apenas o evento exibido; estado rejeitado nunca é confirmado", async () => {
    await reset(); await seed({status:"approved",actor:"llm"});
    const [item] = await getRecentSpotCheckProducts("local",12,factory);
    assert.equal(await rejectAndLearnSpotCheck("flash","Compra mal explicada","reviewer","local",item.sourceEventId,factory),true);
    assert.equal(await confirmSpotCheck("flash","reviewer","local",item.sourceEventId,factory),false);
    assert.equal((await pg.query<any>("select status from garimpa.product_curation")).rows[0].status,"rejected");
  });
  console.log(`${passed} cenários PostgreSQL de preço/triagem passaram.`);
} finally {
  await pg.close();
}
