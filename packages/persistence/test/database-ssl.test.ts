import assert from "node:assert/strict";
import test from "node:test";
import { databaseSsl } from "../src/database-ssl.ts";

test("private session transport requires explicit opt-in and preserves TLS configuration", () => {
  assert.equal(databaseSsl("postgresql://worker@db:5432/postgres?sslmode=disable"), false);
  assert.equal(databaseSsl("postgresql://worker@db:5432/postgres?sslmode=verify-full"), "verify-full");
  assert.equal(databaseSsl("postgresql://worker@db:5432/postgres?sslmode=require"), "require");
  assert.deepEqual(databaseSsl("postgresql://worker@db:5432/postgres"), { rejectUnauthorized: false });
  assert.deepEqual(databaseSsl("postgresql://localhost:secret@remote.test/postgres"), { rejectUnauthorized: false });
  assert.equal(databaseSsl("postgresql://worker@127.0.0.1/postgres"), false);
  assert.throws(() => databaseSsl("postgresql://worker@db/postgres?sslmode=typo"), /unsupported_database_sslmode/);
});
