/**
 * Testes do kill switch da captura automatizada do ML (E0).
 *
 * Prova o contrato de falha fechada: nenhum caminho liga a automação de rede
 * sem flag explícita E ambiente de desenvolvimento explícito. O "teste
 * sabotado" é a asserção de que flag ausente nunca retorna true — se o gate
 * fosse removido ou invertido, estes testes quebrariam.
 *
 *   node --test --experimental-strip-types test/automated-capture.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mlAutomatedCaptureEnabled } from "../src/automated-capture.ts";

describe("mlAutomatedCaptureEnabled (kill switch E0)", () => {
  it("flag ausente → desligado (default seguro)", () => {
    assert.equal(mlAutomatedCaptureEnabled({}), false);
    assert.equal(mlAutomatedCaptureEnabled({ NODE_ENV: "development" }), false);
  });

  it("flag vazia ou com qualquer outro valor → desligado", () => {
    assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "" }), false);
    assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "false" }), false);
    assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "1" }), false);
    assert.equal(
      mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "TRUE" }),
      false,
      "comparação é case-sensitive: só 'true' literal liga",
    );
  });

  it("flag true em produção → desligado (falha fechada)", () => {
    assert.equal(
      mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true", NODE_ENV: "production" }),
      false,
    );
  });

  it("flag true sem NODE_ENV (CLI solto) → desligado", () => {
    assert.equal(mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true" }), false);
  });

  it("flag true + development → ligado (autorização explícita)", () => {
    assert.equal(
      mlAutomatedCaptureEnabled({ ML_AUTOMATED_CAPTURE_ENABLED: "true", NODE_ENV: "development" }),
      true,
    );
  });
});
