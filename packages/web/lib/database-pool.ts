import postgres from "postgres";
import { authorizeAccountTransaction } from "./account-scope.ts";
import type { AccountContext } from "./account-context.ts";

export const WEB_DATABASE_CONNECTIONS = 3;
const registryKey = Symbol.for("bizuminer.web-database-pools.v1");
const registryHost = globalThis as typeof globalThis & { [registryKey]?: Map<string, postgres.Sql> };
const pools = registryHost[registryKey] ??= new Map<string, postgres.Sql>();

/** Only transport is shared, including across Next dev module reloads. Never store an account here. */
export function accountDatabase(connectionString: string, context?: AccountContext): postgres.Sql {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = postgres(connectionString, {
      prepare: false,
      max: WEB_DATABASE_CONNECTIONS,
      idle_timeout: 5,
      connect_timeout: 10,
      max_lifetime: 60,
      connection: { application_name: "bizuminer-web" },
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    pools.set(connectionString, pool);
  }
  return databaseHandle(pool, context);
}

/** A service owns its handle, while the driver owns/queues the bounded physical connections. */
export function databaseHandle(pool: postgres.Sql, context?: AccountContext): postgres.Sql {
  let closed = false;
  const assertOpen = () => { if (closed) throw new Error("database_handle_closed"); };
  function queryResult(value: any): any {
    if (!value || typeof value.execute !== "function" || typeof value.then !== "function") return value;
    let started = false;
    const start = () => { if (!started) { assertOpen(); started = true; } };
    const executionMethods = new Set(["then", "catch", "finally", "execute", "forEach", "readable", "writable"]);
    const query = new Proxy(value, {
      get(target, key) {
        const method = Reflect.get(target, key, target);
        if (typeof method !== "function" || key === "constructor") return method;
        return (...args: any[]) => {
          if (key === "cancel") return Reflect.apply(method, target, args);
          if (executionMethods.has(String(key))) start();
          else if (!started) assertOpen();
          const result: any = Reflect.apply(method, target, args);
          if (key === "cursor" && result !== target) {
            return { [Symbol.asyncIterator]() {
              const iterator = result[Symbol.asyncIterator]();
              return {
                next(...values: any[]) { start(); return iterator.next(...values); },
                return(...values: any[]) { return iterator.return(...values); },
              };
            } };
          }
          return result === target ? query : result;
        };
      },
    });
    return query;
  }
  return new Proxy(pool, {
    apply(target, receiver, args) {
      assertOpen();
      return queryResult(Reflect.apply(target, receiver, args));
    },
    get(target, key) {
      if (key === "end") return async () => { closed = true; };
      if (key === "begin") return async (...args: any[]) => {
        assertOpen();
        const callback = args.pop();
        return (target.begin as Function)(...args, async (tx: any) => {
          if (context) await authorizeAccountTransaction(tx, context);
          return callback(tx);
        });
      };
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args: any[]) => {
        assertOpen();
        return queryResult(Reflect.apply(value, target, args));
      };
    },
  });
}
