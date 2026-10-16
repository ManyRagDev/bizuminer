import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret,
  decryptSecret,
  resolveKeyForVersion,
  DEFAULT_KEY_VERSION,
} from "../lib/affiliate-secret.ts";

const SYNTHETIC_TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes hex
process.env.AFFILIATE_SECRETS_MASTER_KEY = SYNTHETIC_TEST_KEY;

test("10-A2: encryptSecret e decryptSecret cifram e decifram fielmente com AES-256-GCM", () => {
  const secret = "token-secreto-ml-123456";
  const tenantId = "tenant_parceiro_alpha";
  const marketplace = "mercadolivre";
  const secretId = "api_credential";

  const encrypted = encryptSecret(secret, tenantId, marketplace, secretId);
  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.nonce);
  assert.ok(encrypted.tag);
  assert.notEqual(encrypted.ciphertext, secret);

  const decrypted = decryptSecret(encrypted, tenantId, marketplace, secretId);
  assert.equal(decrypted, secret, "Texto decifrado deve ser exatamente igual ao original");
});

test("10-A2: AAD estrito impede transplante de segredo entre contas ou lojas", () => {
  const secret = "token-sensivel";
  const tenantA = "tenant_conta_a";
  const tenantB = "tenant_conta_b";
  const marketplace = "mercadolivre";
  const secretId = "app_token";

  const encrypted = encryptSecret(secret, tenantA, marketplace, secretId);

  // Tentativa de decifrar no contexto de outro tenant -> DEVE FALHAR (Auth tag mismatch / AAD check)
  assert.throws(
    () => {
      decryptSecret(encrypted, tenantB, marketplace, secretId);
    },
    /Unsupported state or unable to authenticate data/,
    "Decifrar com outro tenantId deve falhar pela verificação de AAD"
  );

  // Tentativa de decifrar no contexto de outro marketplace -> DEVE FALHAR
  assert.throws(
    () => {
      decryptSecret(encrypted, tenantA, "shopee", secretId);
    },
    /Unsupported state or unable to authenticate data/,
    "Decifrar com outro marketplace deve falhar pela verificação de AAD"
  );
});

test("10-A2: Criptografia não é determinística (nonce aleatório protege contra análise de frequência)", () => {
  const secret = "mesmo-segredo-repetido";
  const tenant = "local";
  const marketplace = "shopee";
  const secretId = "key";

  const enc1 = encryptSecret(secret, tenant, marketplace, secretId);
  const enc2 = encryptSecret(secret, tenant, marketplace, secretId);

  assert.notEqual(enc1.nonce, enc2.nonce, "Nonces devem ser aleatórios a cada cifragem");
  assert.notEqual(enc1.ciphertext, enc2.ciphertext, "Ciphertexts devem diferir");
  assert.equal(decryptSecret(enc1, tenant, marketplace, secretId), secret);
  assert.equal(decryptSecret(enc2, tenant, marketplace, secretId), secret);
});

test("RX-04: Ausência de chave em produção interrompe a operação imediatamente", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.AFFILIATE_SECRETS_MASTER_KEY;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.AFFILIATE_SECRETS_MASTER_KEY;

    assert.throws(
      () => {
        resolveKeyForVersion(DEFAULT_KEY_VERSION);
      },
      /AFFILIATE_SECRETS_MASTER_KEY é obrigatória and deve conter exatamente 32 bytes em ambiente de produção|obrigatória/,
      "Deve interromper imediatamente em produção se a chave mestra não estiver configurada"
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.AFFILIATE_SECRETS_MASTER_KEY = originalKey;
  }
});

test("RX-04: Chave de tamanho inválido é rejeitada com erro explícito", () => {
  assert.throws(
    () => {
      resolveKeyForVersion("v1", "chave-curta-de-14b");
    },
    /Chave fornecida possui tamanho inválido/,
    "Chave com menos de 32 bytes deve ser rejeitada"
  );
});

test("RX-04: Resolução de segredos suporta chaves específicas por versão de rotação", () => {
  const keyV1 = "1111111111111111111111111111111111111111111111111111111111111111"; // 32 bytes hex
  const keyV2 = "2222222222222222222222222222222222222222222222222222222222222222"; // 32 bytes hex

  process.env.AFFILIATE_SECRETS_KEY_V1 = keyV1;
  process.env.AFFILIATE_SECRETS_KEY_V2 = keyV2;

  try {
    const secret = "token-rotativo-456";
    const encV1 = encryptSecret(secret, "tenant_x", "mercadolivre", "sec1", "v1");
    assert.equal(encV1.keyVersion, "v1");

    const encV2 = encryptSecret(secret, "tenant_x", "mercadolivre", "sec1", "v2");
    assert.equal(encV2.keyVersion, "v2");

    // Decifra cada um resolvendo a versão correta
    const decV1 = decryptSecret(encV1, "tenant_x", "mercadolivre", "sec1");
    const decV2 = decryptSecret(encV2, "tenant_x", "mercadolivre", "sec1");

    assert.equal(decV1, secret);
    assert.equal(decV2, secret);
  } finally {
    delete process.env.AFFILIATE_SECRETS_KEY_V1;
    delete process.env.AFFILIATE_SECRETS_KEY_V2;
  }
});
