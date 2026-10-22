import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const entrypoints = [
  new URL("../bin/sweep.ts", import.meta.url),
  new URL("../../capture/bin/probe-ml-deals.ts", import.meta.url),
];
const gate = new URL("../../capture/src/automated-capture.ts", import.meta.url).href;
const scenarios = [
  {},
  { NODE_ENV: "development", ML_AUTOMATED_CAPTURE_ENABLED: "true" },
  { NODE_ENV: "production", ML_AUTOMATED_CAPTURE_ENABLED: "true", ML_AUTOMATED_CAPTURE_PRODUCTION: "true" },
  { NODE_ENV: "development", ML_AUTOMATED_CAPTURE_ENABLED: "true", ML_AUTOMATED_CAPTURE_PRODUCTION: "true" },
  { NODE_ENV: "test", ML_AUTOMATED_CAPTURE_ENABLED: "true", ML_AUTOMATED_CAPTURE_PRODUCTION: "true" },
  { ML_AUTOMATED_CAPTURE_ENABLED: "true", ML_AUTOMATED_CAPTURE_PRODUCTION: "true" },
];

for (const entry of entrypoints) {
  test(`OS-032: ${entry.pathname} recusa antes de importar adapter/store/transporte`, () => {
    const dir = mkdtempSync(join(tmpdir(), "os-032-cli-"));
    try {
      const marker = join(dir, "effects.txt");
      const preload = join(dir, "guard.mjs");
      // Só a entrada e o gate puro podem ser resolvidos. Qualquer tentativa
      // de carregar adapter, store, SQL ou transporte falha ANTES da avaliação.
      // O marcador impede que um catch no CLI esconda uma tentativa proibida.
      writeFileSync(preload, `
        import { registerHooks } from 'node:module';
        import { appendFileSync } from 'node:fs';
        const fail = () => {
          appendFileSync(${JSON.stringify(marker)}, 'forbidden_effect\\n');
          throw new Error('forbidden_effect');
        };
        globalThis.fetch = fail;
        registerHooks({ resolve(specifier, context, nextResolve) {
          const resolved = new URL(specifier, context.parentURL).href;
          if (![${JSON.stringify(entry.href)}, ${JSON.stringify(gate)}].includes(resolved)) fail();
          return nextResolve(specifier, context);
        }});
      `);
      for (const scenario of scenarios) {
        writeFileSync(marker, "");
        // Lista fechada: não herdar NODE_OPTIONS, DATABASE_URL, PG*, segredos
        // ou configurações de conexão do processo que está rodando a suíte.
        const result = spawnSync(process.execPath, [
          "--import", preload, "--experimental-strip-types", fileURLToPath(entry),
          "--pages", "99", "--trigger-triage", "--consent", "true",
          "--operation-batch", "synthetic-private-argument",
        ], {
          env: { ...scenario, NO_COLOR: "1" },
          encoding: "utf8",
          timeout: 10_000,
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, 1, result.stderr);
        assert.equal(readFileSync(marker, "utf8"), "", "tentou carregar dependência operacional/fetch");
        const output = result.stdout + result.stderr;
        assert.match(output, /manual_capture_only/);
        assert.match(output, /extensão BizuMiner|bloco manual/);
        assert.doesNotMatch(output, /synthetic-private-argument|postgres(?:ql)?:\/\/|https?:\/\//);
        if (entry.pathname.endsWith("/sweep.ts")) {
          assert.deepEqual(JSON.parse(result.stdout.trim().replace(/^CAPTURE_FAILURE=/, "")), {
            version: 1, marketplace: "mercadolivre", kind: "manual_capture_only",
          });
        } else {
          const refusal = JSON.parse(result.stdout);
          assert.equal(refusal.ok, false);
          assert.equal(refusal.kind, "manual_capture_only");
          assert.deepEqual(refusal.requests, []);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("OS-032 BF-032-01: diagnóstico ML recusa antes de fetch/curl e não grava --output", () => {
  const entry = new URL("../../capture/bin/diagnose-ml-verification.mjs", import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), "os-032-diagnostic-"));
  try {
    const marker = join(dir, "effects.txt");
    const report = join(dir, "report.json");
    const preload = join(dir, "guard.mjs");
    writeFileSync(preload, `
      import { registerHooks } from 'node:module';
      import { appendFileSync } from 'node:fs';
      const fail = () => {
        appendFileSync(${JSON.stringify(marker)}, 'forbidden_effect\\n');
        throw new Error('forbidden_effect');
      };
      globalThis.fetch = fail;
      registerHooks({ resolve(specifier, context, nextResolve) {
        const resolved = new URL(specifier, context.parentURL).href;
        if (resolved === ${JSON.stringify(entry.href)}) return nextResolve(specifier, context);
        fail();
      }});
    `);
    writeFileSync(marker, "");
    const result = spawnSync(process.execPath, [
      "--import", preload, fileURLToPath(entry), "--output", report,
    ], {
      env: {
        NODE_ENV: "development",
        ML_AUTOMATED_CAPTURE_ENABLED: "true",
        ML_AUTOMATED_CAPTURE_PRODUCTION: "true",
        NO_COLOR: "1",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readFileSync(marker, "utf8"), "", "tentou importar transporte ou chamar fetch");
    assert.equal(existsSync(report), false, "--output não deve criar arquivo");
    const refusal = JSON.parse(result.stdout.trim());
    assert.equal(refusal.ok, false);
    assert.equal(refusal.error, "manual_capture_only");
    assert.match(refusal.message, /extensão BizuMiner|bloco manual/);
    assert.doesNotMatch(result.stdout + result.stderr, /https?:\/\/|synthetic-private-argument/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
