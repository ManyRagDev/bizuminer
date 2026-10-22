import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { installObservedBaseline } from './observed-baseline.ts';

const run = promisify(execFile);
const require = createRequire(new URL('../../packages/web/package.json', import.meta.url));
const postgres = require('postgres');
const root = new URL('../../', import.meta.url);

/** Creates its own disposable localhost server. Never accepts a DATABASE_URL.
 * Native PostgreSQL must be supplied explicitly; no download/install occurs here.
 * This is not Supabase staging: Auth, Storage and Supavisor are not emulated. */
export async function nativePostgresFixture() {
  const bin = process.env.BIZUMINER_TEST_PG_BIN;
  if (!bin) throw new Error('BIZUMINER_TEST_PG_BIN is required (directory containing PostgreSQL binaries)');
  const directory = await mkdtemp(join(tmpdir(), 'bizuminer-native-pg-'));
  const env = { ...process.env };
  const server = createServer();
  await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
  const port = (server.address() as {port:number}).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  let started = false;
  const clients: any[] = [];
  async function close() {
    await Promise.allSettled(clients.map(client => client.end({ timeout: 3 })));
    if (started) {
      // pg_ctl stop must succeed before deleting its data directory.
      await run(join(bin!, 'pg_ctl'), ['-D', directory, '-m', 'fast', '-w', 'stop'], {env, timeout:15000});
      started = false;
    }
    await rm(directory, {recursive:true, force:true});
  }
  try {
    const {stdout: version} = await run(join(bin, 'postgres'), ['--version'], {env});
    await run(join(bin, 'initdb'), ['-D', directory, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale'], {env, timeout:30000});
    await run(join(bin, 'pg_ctl'), ['-D', directory, '-l', join(directory,'server.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory} -c max_connections=20`, '-w', 'start'], {env, timeout:30000});
    started = true;
    function connect(user: string) {
      const sql = postgres({host:'127.0.0.1',port,database:'postgres',username:user,max:1,prepare:false,
        connect_timeout:5,onnotice:()=>{}});
      clients.push(sql);return sql;
    }
    const admin = connect('postgres');
    const pg = {
      exec: async (query:string) => {await admin.unsafe(query);},
      query: async (query:string, values:any[] = []) => ({rows: await admin.unsafe(query,values)})
    };
    await installObservedBaseline(pg);
    // Only this disposable server uses trust on loopback; runtime still has no superuser/BYPASSRLS.
    await admin`alter role garimpa_app login`;
    const clientA=connect('garimpa_app'),clientB=connect('garimpa_app');
    const migrationsDirectory = new URL('packages/persistence/supabase/migrations/', root);
    const files = (await readdir(migrationsDirectory)).filter(f=>/^\d{14}_/.test(f)&&f>='20261014'&&f.endsWith('.sql')).sort();
    const migrate = async (file:string) => {
      if (!files.includes(file)) throw new Error('unknown_test_migration');
      const content=await readFile(new URL(file,migrationsDirectory),'utf8');
      await admin.begin(async (tx:any)=>{await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='45s'`;await tx.unsafe(content);});
    };
    // Factory expected by application services; they must not close the fixture's shared clients.
    const factory = (client:any) => () => {
      const proxy:any=(...args:any[])=>client(...args);
      proxy.begin=client.begin.bind(client);proxy.unsafe=client.unsafe.bind(client);proxy.json=client.json.bind(client);
      proxy.end=async()=>{};return proxy;
    };
    return {pg,admin,clientA,clientB,files,migrate,version:version.trim(),factoryA:factory(clientA),factoryB:factory(clientB),close};
  } catch(error) {await close();throw error;}
}
