/**
 * Gerenciamento de token OAuth 2.0 do Mercado Livre.
 *
 * O detalhe que decide se isto funciona em produção:
 *
 *   O REFRESH TOKEN É DE USO ÚNICO.
 *
 * Cada renovação devolve um par novo e invalida o anterior. Se dois processos
 * renovarem ao mesmo tempo, um ganha e o outro fica com um refresh token morto
 * — e a conta do Mercado Livre sai do ar até alguém refazer a autorização
 * manualmente. Em dev isso nunca acontece; com dois workers, acontece.
 *
 * Duas defesas:
 *
 * 1. Single-flight: uma renovação por vez no processo. Chamadas concorrentes
 *    esperam a mesma promessa em vez de disparar renovações paralelas.
 * 2. Persistir ANTES de usar. Se gravar o par novo falhar, abortamos — melhor
 *    falhar a requisição do que seguir com um token que não conseguimos salvar
 *    e perder a cadeia na próxima reinicialização.
 *
 * Para vários processos (workers em contêineres separados) o single-flight em
 * memória não basta: a porta `TokenStore` precisa de um lock distribuído.
 * Ver `withLock` — a implementação em Redis fica na camada de infraestrutura.
 */

import { CaptureError } from "../../errors.ts";

export const ML_MARKETPLACE = "mercadolivre";
export const ML_API_BASE = "https://api.mercadolibre.com";
export const ML_AUTH_BASE = "https://auth.mercadolivre.com.br";

/** Margem antes do vencimento para renovar. O token dura 6h. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Instante de expiração do access token. */
  readonly expiresAt: Date;
  readonly userId?: number;
  readonly scope?: string;
}

/**
 * Porta de persistência. A camada de captura não conhece banco de dados.
 * A implementação real grava em `affiliate_credential`, cifrado.
 */
export interface TokenStore {
  load(): Promise<OAuthTokens | null>;
  save(tokens: OAuthTokens): Promise<void>;
  /**
   * Executa `fn` com exclusão mútua entre processos.
   * Sem isto, dois workers podem renovar em paralelo e quebrar a cadeia.
   * Implementação em memória serve para um processo só.
   */
  withLock?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface OAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface TokenManagerOptions {
  readonly config: OAuthConfig;
  readonly store: TokenStore;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly apiBase?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
  scope?: string;
  error?: string;
  message?: string;
}

/**
 * Monta a URL de autorização. `state` é obrigatório na prática: sem ele
 * não há proteção contra CSRF no callback.
 */
export function buildAuthorizationUrl(
  config: OAuthConfig,
  state: string,
  pkce?: { codeChallenge: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
  });

  if (pkce) {
    params.set("code_challenge", pkce.codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `${ML_AUTH_BASE}/authorization?${params.toString()}`;
}

export class MercadoLivreTokenManager {
  private readonly config: OAuthConfig;
  private readonly store: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly apiBase: string;

  /** Renovação em andamento. Garante uma por vez dentro do processo. */
  private inFlight: Promise<OAuthTokens> | null = null;

  constructor(opts: TokenManagerOptions) {
    this.config = opts.config;
    this.store = opts.store;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.apiBase = opts.apiBase ?? ML_API_BASE;
  }

  /** Troca o authorization code pelo primeiro par de tokens. */
  async exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
    });
    if (codeVerifier) body.set("code_verifier", codeVerifier);

    const tokens = await this.postToken(body);
    await this.store.save(tokens);
    return tokens;
  }

  /**
   * Devolve um access token válido, renovando se estiver perto de vencer.
   * É o único método que o cliente HTTP precisa conhecer.
   */
  async getAccessToken(): Promise<string> {
    const current = await this.store.load();

    if (!current) {
      throw new CaptureError({
        kind: "auth",
        marketplace: ML_MARKETPLACE,
        message: "nenhum token do Mercado Livre armazenado — refazer autorização",
      });
    }

    if (!this.needsRefresh(current)) return current.accessToken;

    const refreshed = await this.refresh(current);
    return refreshed.accessToken;
  }

  /**
   * Força renovação a partir do que estiver armazenado.
   * Usado quando a API devolve 401 apesar de o token parecer válido —
   * relógio fora de sincronia ou revogação do outro lado.
   */
  async forceRefresh(): Promise<OAuthTokens> {
    const current = await this.store.load();
    if (!current) {
      throw new CaptureError({
        kind: "auth",
        marketplace: ML_MARKETPLACE,
        message: "nenhum token armazenado para renovar — refazer autorização",
      });
    }
    return this.refresh(current);
  }

  /** Renovação com single-flight. Prefira `forceRefresh` fora desta classe. */
  async refresh(current: OAuthTokens): Promise<OAuthTokens> {
    // Single-flight: quem chegar durante uma renovação espera a mesma promessa.
    if (this.inFlight) return this.inFlight;

    const run = async (): Promise<OAuthTokens> => {
      // Relê sob o lock: outro processo pode ter renovado enquanto esperávamos.
      const fresh = await this.store.load();
      if (fresh && !this.needsRefresh(fresh) && fresh.refreshToken !== current.refreshToken) {
        return fresh;
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: (fresh ?? current).refreshToken,
      });

      const tokens = await this.postToken(body);

      // Persistir ANTES de devolver. Se a gravação falhar, o par novo se perde
      // e o antigo já foi invalidado pelo Mercado Livre — a cadeia quebra.
      try {
        await this.store.save(tokens);
      } catch (cause) {
        throw new CaptureError({
          kind: "auth",
          marketplace: ML_MARKETPLACE,
          message:
            "token renovado mas não foi possível persistir — refazer autorização",
          cause,
        });
      }

      return tokens;
    };

    const guarded = this.store.withLock ? () => this.store.withLock!(run) : run;

    this.inFlight = guarded().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private needsRefresh(tokens: OAuthTokens): boolean {
    return tokens.expiresAt.getTime() - this.now() <= REFRESH_MARGIN_MS;
  }

  private async postToken(body: URLSearchParams): Promise<OAuthTokens> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}/oauth/token`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch (cause) {
      throw new CaptureError({
        kind: "transport",
        marketplace: ML_MARKETPLACE,
        message: "falha de rede ao obter token do Mercado Livre",
        cause,
      });
    }

    let payload: TokenResponse;
    try {
      payload = (await response.json()) as TokenResponse;
    } catch (cause) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: ML_MARKETPLACE,
        message: "resposta de token não é JSON válido",
        cause,
      });
    }

    if (!response.ok || payload.error) {
      // invalid_grant significa que o code ou o refresh token morreu.
      // Não adianta repetir: exige nova autorização do usuário.
      const kind = payload.error === "invalid_grant" || response.status === 400
        ? "auth"
        : response.status >= 500
          ? "transport"
          : "auth";

      throw new CaptureError({
        kind,
        marketplace: ML_MARKETPLACE,
        message: payload.message ?? payload.error ?? `HTTP ${response.status}`,
        vendorCode: payload.error ?? response.status,
      });
    }

    if (!payload.access_token || !payload.refresh_token) {
      throw new CaptureError({
        kind: "malformed_response",
        marketplace: ML_MARKETPLACE,
        message: "resposta de token sem access_token ou refresh_token",
      });
    }

    const expiresInSec = Number(payload.expires_in) || 21_600; // 6h padrão
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: new Date(this.now() + expiresInSec * 1000),
      userId: payload.user_id,
      scope: payload.scope,
    };
  }
}

/** Implementação em memória. Serve para teste e para um processo único. */
export class InMemoryTokenStore implements TokenStore {
  private tokens: OAuthTokens | null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(initial: OAuthTokens | null = null) {
    this.tokens = initial;
  }

  async load(): Promise<OAuthTokens | null> {
    return this.tokens;
  }

  async save(tokens: OAuthTokens): Promise<void> {
    this.tokens = tokens;
  }

  /** Serializa as renovações. Não protege entre processos. */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(fn, fn);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
