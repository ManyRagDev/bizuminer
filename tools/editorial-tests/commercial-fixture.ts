import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { replacementRollout } from "./replacement-rollout.ts";
import { installObservedBaseline } from "./observed-baseline.ts";

const root = new URL("../../", import.meta.url);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** PostgreSQL WASM, isolated in memory. Executes real SQL/RLS, not query mocks.
 * This does not emulate the production pooler or independent network sessions. */
export async function commercialFixture(options:{migrationCount?:number;chain?:"legacy"|"replacement";onQuery?:(query:string,rows:unknown[])=>void}={}) {
  if(process.env.BIZUMINER_TEST_NATIVE==='true') {
    const {nativePostgresFixture}=await import('./native-postgres-fixture.ts');
    const fx=await nativePostgresFixture(),applied:string[]=[];
    try {
      if(options.chain==='legacy'||options.migrationCount!==undefined) {
        for(const file of fx.files.slice(0,options.migrationCount)){await fx.migrate(file);applied.push(file);}
      } else {
        for(const unit of (await replacementRollout()).units){await fx.admin.begin((tx:any)=>tx.unsafe(unit.sql));applied.push(unit.file);}
      }
      const wrap=(base:any):any=>{
        const proxy:any=(...args:any[])=>{
          if(Array.isArray(args[0])&&args.slice(1).some(v=>v===undefined))throw new Error('fixture_undefined_parameter: '+args[0].join('?'));
          return base(...args);
        };
        proxy.unsafe=(query:string,values?:any[])=>{options.onQuery?.(query,[]);return base.unsafe(query,values);};
        proxy.json=base.json.bind(base);proxy.end=async()=>{};
        proxy.begin=(...args:any[])=>base.begin(...args.slice(0,-1),(tx:any)=>args.at(-1)(wrap(tx)));
        return proxy;
      };
      return {pg:{...fx.pg,close:fx.close},applied,factory:()=>wrap(fx.factoryA()),adminFactory:()=>wrap(fx.admin)};
    }catch(error){await fx.close();throw error;}
  }
  const pg = new PGlite();
  await installObservedBaseline(pg);
  const applied: string[] = [];
  const directory = new URL("packages/persistence/supabase/migrations/", root);
  if(options.chain==='legacy' || options.migrationCount!==undefined) {
    const files = (await readdir(directory)).filter((f) => /^\d{14}_/.test(f) && f >= "20261014" && f.endsWith(".sql")).sort();
    for(const file of files.slice(0,options.migrationCount)) {
      try {await pg.exec(await readFile(new URL(file,directory),'utf8'));}
      catch(error){await pg.close();throw error;}
      applied.push(file);
    }
  } else {
    const {units}=await replacementRollout();
    for(const unit of units) {
      try {await pg.transaction(tx=>tx.exec(unit.sql));}
      catch(error){console.error('REPLACEMENT MIGRATION FAILED '+unit.file);await pg.close();throw error;}
      applied.push(unit.file);
    }
  }
  function adapter(client: any, role?: string): any {
    const run = async (query: string, values: unknown[]) => {
      const execute = async (c: any) => {
        const result = await c.query(query, values);
        const rows = result.rows as any;
        options.onQuery?.(query, rows);
        rows.count = result.affectedRows ?? rows.length;
        return rows;
      };
      if (role && client === pg) return pg.transaction(async (tx) => { await tx.exec(`set local role ${quote(role)}`); return execute(tx); });
      return execute(client);
    };
    const sql: any = async (parts: TemplateStringsArray, ...values: any[]) => {
      const parameters: unknown[] = []; let query = parts[0];
      values.forEach((value, i) => { if (value?.rawFragment !== undefined) query += value.rawFragment; else { parameters.push(value); query += `$${parameters.length}`; } query += parts[i + 1]; });
      return run(query, parameters);
    };
    sql.unsafe = (query: string, values: unknown[] = []) => ({ rawFragment: query, then: (resolve: any, reject: any) => run(query, values).then(resolve, reject) });
    sql.json = (value: unknown) => JSON.stringify(value);
    sql.end = async () => {};
    sql.begin = async (...args: any[]) => pg.transaction(async (tx) => {
      if (typeof args[0] === "string") await tx.exec(`set transaction ${args[0]}`);
      if (role) await tx.exec(`set local role ${quote(role)}`);
      return args.at(-1)(adapter(tx));
    });
    return sql;
  }
  return { pg, applied, factory: () => adapter(pg, "garimpa_app"), adminFactory: () => adapter(pg) };
}
