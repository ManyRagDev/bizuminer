#!/usr/bin/env node
/**
 * oauth-login — obtém o primeiro access token do Mercado Livre (OAuth 2.0 + PKCE).
 *
 * Passos:
 *   1. Gera o par code_verifier/code_challenge (PKCE S256).
 *   2. Monta a URL de autorização e abre no navegador (você autoriza).
 *   3. O ML redireciona para o redirect_uri com ?code=... — você cola a URL
 *      final aqui, e o script troca o code pelos tokens.
 *
 * Uso:
 *   export ML_CLIENT_ID="1234567890"
 *   export ML_CLIENT_SECRET="..."                (secret da app no DevCenter)
 *   export ML_REDIRECT_URI="https://localhost"   (mesma URL cadastrada na app)
 *   node --experimental-strip-types bin/oauth-login.ts
 *
 * Saída: access token (expira em 6h) e refresh token (GUARDE — é de uso único).
 */

import { webcrypto } from "node:crypto";
import {
  ML_AUTH_BASE,
  MercadoLivreTokenManager,
  buildAuthorizationUrl,
  type TokenStore,
} from "../src/adapters/mercadolivre/oauth.ts";

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Defina a variável ${name} antes de rodar.`);
    process.exit(1);
  }
  return v;
}

/** Store descartável — os tokens só aparecem no stdout desta execução. */
const throwaway: TokenStore = {
  load: async () => null,
  save: async () => {},
};

async function main() {
  const clientId = env("ML_CLIENT_ID");
  const clientSecret = env("ML_CLIENT_SECRET");
  const redirectUri = env("ML_REDIRECT_URI");

  // base64url sem padding
  const b64url = (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  // PKCE: verifier aleatório em base64url, challenge = SHA256(verifier).
  const verifier = b64url(webcrypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );

  const state = b64url(webcrypto.getRandomValues(new Uint8Array(16)));

  const url = buildAuthorizationUrl(
    { clientId, clientSecret, redirectUri },
    state,
    { codeChallenge: challenge },
  );

  console.log(`\n${"=".repeat(78)}`);
  console.log(`OAUTH LOGIN — MERCADO LIVRE`);
  console.log(`${"=".repeat(78)}\n`);
  console.log(`1. Abra esta URL no navegador e autorize:\n`);
  console.log(`   ${url}\n`);
  console.log(
    `2. Depois de autorizar, o navegador cai em ${redirectUri}?code=...&state=...\n` +
      `   (pode dar erro de página não encontrada — NORMAL, o que importa é a URL.)\n`,
  );
  console.log(`3. Cole a URL completa para onde o navegador foi:\n`);

  // Lê a URL colada no stdin.
  const pasted = await new Promise<string>((resolve) => {
    process.stdout.write("   URL: ");
    process.stdin.once("data", (d) => resolve(d.toString().trim()));
  });

  let code: string;
  let returnedState: string | undefined;
  try {
    const u = new URL(pasted);
    code = u.searchParams.get("code") ?? "";
    returnedState = u.searchParams.get("state") ?? undefined;
  } catch {
    // tolera colar só o trecho ?code=...
    const m = /[?&]code=([^&]+)/.exec(pasted);
    code = m ? decodeURIComponent(m[1]!) : "";
  }

  if (!code) {
    console.error("\nNão encontrei ?code= na URL colada. Tente de novo.");
    process.exit(1);
  }
  if (returnedState !== state) {
    console.error(
      `\nstate divergente (CSUSF?): esperado ${state}, veio ${returnedState}. Não prossiga.`,
    );
    process.exit(1);
  }

  const mgr = new MercadoLivreTokenManager({
    config: { clientId, clientSecret, redirectUri },
    store: throwaway,
  });

  console.log(`\nTrocando o code pelos tokens...\n`);
  try {
    const tokens = await mgr.exchangeCode(code, verifier);

    console.log(`${"=".repeat(78)}`);
    console.log(`TOKENS OBTIDOS`);
    console.log(`${"=".repeat(78)}\n`);
    console.log(`  ACCESS TOKEN (expira ${tokens.expiresAt.toISOString()}):`);
    console.log(`\n    ${tokens.accessToken}\n`);
    console.log(`  REFRESH TOKEN (GUARDE — de uso único, cada renovação invalida o anterior):`);
    console.log(`\n    ${tokens.refreshToken}\n`);
    if (tokens.userId != null) console.log(`  user_id: ${tokens.userId}`);
    console.log(
      `\n  Para o link-lab:\n    $env:ML_ACCESS_TOKEN="${tokens.accessToken.slice(0, 12)}..."`,
    );
    console.log(`\n  NÃO comite estes valores no repositório.\n`);
  } catch (err) {
    console.error(
      "\nFalha na troca:",
      err instanceof Error ? err.message : err,
      "\nVerifique client_id/secret e se o redirect_uri é EXATAMENTE o cadastrado na app.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
