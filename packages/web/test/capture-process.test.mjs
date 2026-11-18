import assert from "node:assert/strict";
import test from "node:test";
import { captureProcessRetry, captureProcessFailure, runBoundedCaptureProcess } from "../lib/capture-process.ts";

test("Verificação ML exige falha tipada do CLI, nunca uma mensagem ou outro erro de processo", () => {
  const failure = {
    ok: false, error: "step_exit_failed",
    output: 'CAPTURE_FAILURE={"version":1,"marketplace":"mercadolivre","kind":"auth"}\n',
  };
  assert.equal(captureProcessFailure(failure, "mercadolivre"), "ml_access_verification_required");
  for (const error of ["step_timeout", "spawn_failed"])
    assert.equal(captureProcessFailure({ ...failure, error }, "mercadolivre"), error);
  assert.equal(captureProcessFailure(failure, "shopee"), "step_exit_failed");
  for (const output of [
    "continue pelo navegador",
    "CAPTURE_FAILURE=invalid",
    'CAPTURE_FAILURE={"version":1,"marketplace":"shopee","kind":"auth"}',
    'CAPTURE_FAILURE={"version":1,"marketplace":"mercadolivre","kind":"transport"}',
  ]) assert.equal(captureProcessFailure({ ...failure, output }, "mercadolivre"), "step_exit_failed");
  assert.equal(captureProcessFailure({ ...failure, ok: true }, "mercadolivre"), undefined);
});

test("Executável ausente retorna falha de inicialização assíncrona", async () => {
  const result = await runBoundedCaptureProcess(
    "/tmp/bizuminer-missing-executable",
    [],
    { timeoutMs: 1000 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "spawn_failed");
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, null);
  assert.equal(result.stderrBytes, 0);
  assert.equal(result.diagnosticCode, undefined);
  assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
});
test("Processo travado é encerrado no prazo e não mantém operação aberta", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { timeoutMs: 50 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "step_timeout");
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, "SIGKILL");
  assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 40);
  assert.equal(result.diagnosticCode, undefined);
});
test("Saída não zero é falha mesmo quando o processo imprimiu um resumo", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "console.log('resumo');process.exit(1)"],
    { timeoutMs: 2000 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "step_exit_failed");
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, null);
  assert.equal(result.output.trim(), "resumo");
});
test("Execução concluída transporta resultado sem exibir stderr", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "console.log('resultado');console.error('privado')"],
    { timeoutMs: 2000 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "resultado");
  assert.equal(result.exitCode, 0);
  assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderrBytes, Buffer.byteLength("privado\n"));
  assert.equal(JSON.stringify(result).includes("privado"), false);
});


test("retries aceitam apenas saída CLI tipada da mesma fonte", () => {
  const failure = { ok:false, error:"step_exit_failed", output:'CAPTURE_FAILURE={"version":1,"marketplace":"shopee","kind":"rate_limit","retryAfterMs":90000}' };
  assert.deepEqual(captureProcessRetry(failure,"shopee"), {failureKind:"rate_limit",retryAfterMs:90000});
  assert.deepEqual(captureProcessRetry(failure,"aliexpress"), {});
  assert.deepEqual(captureProcessRetry({...failure,output:"rate limit token=privado"},"shopee"), {});
  assert.deepEqual(captureProcessRetry({...failure,output:'CAPTURE_FAILURE={"version":1,"marketplace":"shopee","kind":"credential"}'},"shopee"), {failureKind:"credential"});
  assert.deepEqual(captureProcessRetry({...failure,error:"step_timeout"},"shopee"), {failureKind:"transient"});
});

test("processo supervisionado pelo lease não recebe teto de duração global", async () => {
  const lease=new AbortController();
  const result=await runBoundedCaptureProcess(process.execPath,["-e","setTimeout(()=>console.log('complete'),80)"],{signal:lease.signal});
  assert.equal(result.ok,true);
  assert.equal(result.output.trim(),"complete");
});

test("revogação do lease encerra subprocesso e sinal pré-abortado não inicia trabalho", async () => {
  const lease=new AbortController();
  const running=runBoundedCaptureProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{signal:lease.signal});
  lease.abort();
  assert.equal((await running).error,"step_aborted");
  const skipped=await runBoundedCaptureProcess('/tmp/should-not-start',[],{signal:lease.signal});
  assert.equal(skipped.error,"step_aborted");
  assert.equal(skipped.exitCode,null);
  assert.equal(skipped.signal,null);
  assert.equal(skipped.stderrBytes,0);
  assert.ok(Number.isInteger(skipped.durationMs) && skipped.durationMs >= 0);
});

test("erro nativo de import informa código permitido sem retornar path, mensagem ou segredo", async () => {
  const result = await runBoundedCaptureProcess(process.execPath,
    ["--input-type=module", "-e", "await import('/tmp/garimpa-synthetic-private-token-missing.mjs')"],
    { timeoutMs: 2000 });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, null);
  assert.equal(result.diagnosticCode, "ERR_MODULE_NOT_FOUND");
  assert.ok(result.stderrBytes > 0);
  assert.equal(result.output, "");
  for (const value of ["private-token", "/tmp/", "Cannot find", "stderr\""])
    assert.equal(JSON.stringify(result).includes(value), false);
});

test("sinal de encerramento mantém evidência separada do exitCode", async () => {
  const result = await runBoundedCaptureProcess(process.execPath,
    ["-e", "process.kill(process.pid,'SIGTERM')"], { timeoutMs: 2000 });
  assert.equal(result.error, "step_exit_failed");
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(result.diagnosticCode, undefined);
});

test("prosa de fornecedor, JSON e fragmentos forjados não viram diagnóstico Node", async () => {
  const samples = [
    "vendor token=private-secret failed ERR_MODULE_NOT_FOUND",
    "vendor code: 'ERR_MODULE_NOT_FOUND' private-secret",
    JSON.stringify({ code: "ERR_MODULE_NOT_FOUND", message: "private-secret" }),
    "Error [ERR_MODULE_NOT_FOUND]: private-secret\nNode.js v22.20.0\n",
    "Error [ERR_MODULE_NOT_FOUND]: private-secret\n    at provider (private-path:1:1)\n  code: 'ERR_MODULE_NOT_FOUND'\n}\n\nNode.js v22.20.0\n",
    "Error [ERR_MODULE_NOT_FOUND]: private-secret\n    at provider (node:internal/modules/esm/resolve:1:1)\n  code: 'ERR_UNKNOWN_FILE_EXTENSION'\n}\n\nNode.js v22.20.0\n",
    "Error [VENDOR_PRIVATE_ERROR]: private-secret\n    at provider (node:internal/modules/esm/resolve:1:1)\n  code: 'VENDOR_PRIVATE_ERROR'\n}\n\nNode.js v22.20.0\n",
  ];
  for (const sample of samples) {
    const result = await runBoundedCaptureProcess(process.execPath,
      ["-e", `process.stderr.write(${JSON.stringify(sample)},()=>process.exit(1))`], { timeoutMs: 2000 });
    assert.equal(result.stderrBytes, Buffer.byteLength(sample));
    assert.equal(result.diagnosticCode, undefined);
    assert.equal(JSON.stringify(result).includes("private-secret"), false);
    assert.equal(result.output, "");
  }
});

test("stderr volumoso conta bytes sem ampliar o diagnóstico retido; stdout legado continua limitado", async () => {
  const result = await runBoundedCaptureProcess(process.execPath,
    ["-e", "process.stdout.write('x'.repeat(70000));process.stderr.write('ç'.repeat(70000),()=>process.exit(2))"],
    { timeoutMs: 2000 });
  assert.equal(result.stderrBytes, 140000);
  assert.equal(result.output.length, 64000);
  assert.equal(result.exitCode, 2);
  assert.equal(result.diagnosticCode, undefined);
  assert.equal(Object.hasOwn(result, "stderr"), false);
});

test("sucesso com código de erro no stderr não recebe rótulo de falha Node", async () => {
  const nativeLike = "Error [ERR_MODULE_NOT_FOUND]: private-secret\n    at one (node:internal/modules/esm/resolve:1:1)\n    at two (node:internal/modules/esm/resolve:2:1) {\n  code: 'ERR_MODULE_NOT_FOUND'\n}\n\nNode.js v22.20.0\n";
  const result = await runBoundedCaptureProcess(process.execPath,
    ["-e", `process.stderr.write(${JSON.stringify(nativeLike)})`], { timeoutMs: 2000 });
  assert.equal(result.ok, true);
  assert.equal(result.diagnosticCode, undefined);
});
