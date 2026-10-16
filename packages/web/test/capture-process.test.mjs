import assert from "node:assert/strict";
import test from "node:test";
import { captureProcessFailure, runBoundedCaptureProcess } from "../lib/capture-process.ts";

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
});
test("Processo travado é encerrado no prazo e não mantém operação aberta", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { timeoutMs: 50 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "step_timeout");
});
test("Saída não zero é falha mesmo quando o processo imprimiu um resumo", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "console.log('resumo');process.exit(1)"],
    { timeoutMs: 2000 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "step_exit_failed");
});
test("Execução concluída transporta resultado sem exibir stderr", async () => {
  const result = await runBoundedCaptureProcess(
    process.execPath,
    ["-e", "console.log('resultado');console.error('privado')"],
    { timeoutMs: 2000 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.output.trim(), "resultado");
});
