/**
 * Testes do kill switch da captura da Shopee (M1).
 *
 *   node --test --experimental-strip-types test/shopee-capture.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { shopeeCaptureEnabled } from "../src/shopee-capture.ts";

describe("shopeeCaptureEnabled", () => {
  it("nenhuma variável definida → desligado (default seguro)", () => {
    assert.equal(shopeeCaptureEnabled({}), false);
  });

  it("flag ligada mas sem credencial → desligado", () => {
    assert.equal(shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true" }), false);
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true", SHOPEE_APP_ID: "x" }),
      false,
    );
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true", SHOPEE_APP_SECRET: "y" }),
      false,
    );
  });

  it("credencial completa mas flag desligada/ausente → desligado", () => {
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }),
      false,
    );
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "false", SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }),
      false,
    );
  });

  it("flag com valor diferente de 'true' literal → desligado (case-sensitive)", () => {
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "TRUE", SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }),
      false,
    );
  });

  it("flag true + credencial completa → ligado", () => {
    assert.equal(
      shopeeCaptureEnabled({ SHOPEE_CAPTURE_ENABLED: "true", SHOPEE_APP_ID: "x", SHOPEE_APP_SECRET: "y" }),
      true,
    );
  });

  it("independente do gate do ML — não lê NODE_ENV nem ML_AUTOMATED_CAPTURE_ENABLED", () => {
    assert.equal(
      shopeeCaptureEnabled({
        SHOPEE_CAPTURE_ENABLED: "true",
        SHOPEE_APP_ID: "x",
        SHOPEE_APP_SECRET: "y",
        // @ts-expect-error -- campos extras não fazem parte do contrato, mas não podem afetar o resultado
        NODE_ENV: "production",
      }),
      true,
    );
  });
});
