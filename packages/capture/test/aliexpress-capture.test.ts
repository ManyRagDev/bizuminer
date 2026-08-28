/**
 * Testes do kill switch da captura da AliExpress (M5).
 *
 *   node --test --experimental-strip-types test/aliexpress-capture.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aliexpressCaptureEnabled } from "../src/aliexpress-capture.ts";

describe("aliexpressCaptureEnabled", () => {
  it("nenhuma variável definida → desligado (default seguro)", () => {
    assert.equal(aliexpressCaptureEnabled({}), false);
  });

  it("flag ligada mas sem credencial → desligado", () => {
    assert.equal(aliexpressCaptureEnabled({ ALIEXPRESS_CAPTURE_ENABLED: "true" }), false);
    assert.equal(
      aliexpressCaptureEnabled({ ALIEXPRESS_CAPTURE_ENABLED: "true", ALIEXPRESS_APP_KEY: "k" }),
      false,
    );
    assert.equal(
      aliexpressCaptureEnabled({ ALIEXPRESS_CAPTURE_ENABLED: "true", ALIEXPRESS_APP_SECRET: "s" }),
      false,
    );
  });

  it("credencial completa mas flag desligada/ausente → desligado", () => {
    assert.equal(
      aliexpressCaptureEnabled({ ALIEXPRESS_APP_KEY: "k", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" }),
      false,
    );
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "false",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
        ALIEXPRESS_TRACKING_ID: "t",
      }),
      false,
    );
  });

  it("flag com valor diferente de 'true' literal → desligado (case-sensitive)", () => {
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "TRUE",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
        ALIEXPRESS_TRACKING_ID: "t",
      }),
      false,
    );
  });

  it("flag true + credencial completa → ligado", () => {
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "true",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
        ALIEXPRESS_TRACKING_ID: "t",
      }),
      true,
    );
  });

  it("é independente dos gates do ML e da Shopee (M-R3)", () => {
    // Nenhuma flag de outra plataforma pode ligar nem desligar esta.
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "true",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
        ALIEXPRESS_TRACKING_ID: "t",
        // @ts-expect-error -- campos fora do contrato não podem afetar o resultado
        SHOPEE_CAPTURE_ENABLED: "false",
        ML_AUTOMATED_CAPTURE_ENABLED: "false",
        NODE_ENV: "production",
      }),
      true,
    );
  });
});

describe("aliexpressCaptureEnabled — tracking_id obrigatório", () => {
  it("credencial completa mas SEM tracking_id → desligado", () => {
    // Verificado em campo (28/08/2026): sem tracking_id a API responde
    // normalmente, mas o promotion_link não tem atribuição e o clique não
    // gera comissão. Rodar assim encheria o catálogo de links que não pagam
    // nada, sem erro visível. O gate impede a rodagem inútil.
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "true",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
      }),
      false,
    );
  });

  it("tracking_id vazio conta como ausente", () => {
    assert.equal(
      aliexpressCaptureEnabled({
        ALIEXPRESS_CAPTURE_ENABLED: "true",
        ALIEXPRESS_APP_KEY: "k",
        ALIEXPRESS_APP_SECRET: "s",
        ALIEXPRESS_TRACKING_ID: "",
      }),
      false,
    );
  });
});
