/** Real Next HTTP + installed Supabase SDK against a loopback-only Auth fixture. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createServer as reservePort } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const web = fileURLToPath(new URL('../../packages/web/', import.meta.url));
const requireWeb = createRequire(new URL('../../packages/web/package.json', import.meta.url));
const { createChunks } = requireWeb('@supabase/ssr') as {
  createChunks(name: string, value: string): { name: string; value: string }[];
};
const distDir = process.env.BIZUMINER_DIST_DIR || '.next-shared-links';
await readFile(new URL(`../../packages/web/${distDir}/BUILD_ID`, import.meta.url));

const userId = '54e74396-062e-498b-a91d-0676c14def01';
const fixtureEmail = 'session-fixture@example.invalid';
const fixturePassword = 'local-fixture-password-not-a-real-credential';
const fixtureKey = 'synthetic-loopback-signing-key-only';
const counters = { password: 0, refresh: 0, user: 0, unexpected: 0 };
const tokens = new Set<string>();
let refreshSequence = 0;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: fixtureEmail,
  email_confirmed_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  // Enough genuine session data to exercise the SDK's cookie chunking, under HTTP header limits.
  user_metadata: { full_name: 'Usuário de teste local', fixture_padding: 'x'.repeat(3300) },
  identities: [],
};
function currentUser() {
  // The SDK omits unchanged cookie chunks. Change this harmless padding on
  // refresh so that the redirect must transfer multiple modified chunks too.
  return { ...user, user_metadata: { ...user.user_metadata, fixture_padding: (refreshSequence ? 'y' : 'x').repeat(3300) } };
}
function token(expiresAt: number, sequence = 0): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated',
    exp: expiresAt, iat: nowSeconds() - 120, session_id: 'ce8566da-de15-4c5b-8cce-d56056ec930e', sequence })).toString('base64url');
  const signed = `${header}.${payload}`;
  const value = `${signed}.${createHmac('sha256', fixtureKey).update(signed).digest('base64url')}`;
  tokens.add(value);
  return value;
}
function session() {
  const expiresAt = nowSeconds() + 3600;
  return { access_token: token(expiresAt, refreshSequence), token_type: 'bearer', expires_in: 3600,
    expires_at: expiresAt, refresh_token: `local-refresh-fixture-${refreshSequence}`, user: currentUser() };
}
const auth: Server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname === '/auth/v1/token') {
      let text = '';
      for await (const bytes of request) {
        text += bytes.toString();
        if (text.length > 16384) throw new Error('fixture_body_limit');
      }
      const input = JSON.parse(text);
      if (url.searchParams.get('grant_type') === 'password'
        && input.email === fixtureEmail && input.password === fixturePassword) {
        counters.password++;
        response.end(JSON.stringify(session()));
        return;
      }
      if (url.searchParams.get('grant_type') === 'refresh_token'
        && input.refresh_token === `local-refresh-fixture-${refreshSequence}`) {
        counters.refresh++;
        refreshSequence++;
        response.end(JSON.stringify(session()));
        return;
      }
      response.statusCode = 400;
      response.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid synthetic session' }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
      counters.user++;
      const supplied = request.headers.authorization?.replace(/^Bearer /, '');
      if (!supplied || !tokens.has(supplied)) {
        response.statusCode = 401;
        response.end(JSON.stringify({ code: 'bad_jwt', msg: 'Invalid synthetic session' }));
      } else response.end(JSON.stringify(currentUser()));
      return;
    }
    counters.unexpected++;
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'fixture_endpoint_not_found' }));
  } catch {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: 'fixture_bad_request' }));
  }
});

let child: ChildProcess | undefined;
let nextOutputBytes = 0;
const jar = new Map<string, string>();
function responseCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}
function acceptCookies(response: Response) {
  for (const cookie of responseCookies(response)) {
    const pair = cookie.slice(0, cookie.indexOf(';') < 0 ? undefined : cookie.indexOf(';'));
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator), value = pair.slice(separator + 1);
    if (/;\s*max-age=0(?:;|$)/i.test(cookie) || !value) jar.delete(name);
    else jar.set(name, value);
  }
}
function cookieHeader(): string { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); }
function authCookieNames(): string[] { return [...jar.keys()].filter(name => /^sb-.+-auth-token(?:\.\d+)?$/.test(name)); }
function cookieSession(): { key: string; value: Record<string, any> } {
  const names = authCookieNames();
  assert.ok(names.length >= 2, 'synthetic session must use at least two cookie chunks');
  const key = names[0]!.replace(/\.\d+$/, '');
  const joined = names.sort((a, b) => Number(a.split('.').at(-1)) - Number(b.split('.').at(-1)))
    .map(name => decodeURIComponent(jar.get(name)!)).join('');
  assert.ok(joined.startsWith('base64-'), 'SDK cookie encoding must be base64url');
  return { key, value: JSON.parse(Buffer.from(joined.slice('base64-'.length), 'base64url').toString('utf8')) };
}

try {
  await new Promise<void>((resolve, reject) => { auth.once('error', reject); auth.listen(0, '127.0.0.1', resolve); });
  const authPort = (auth.address() as { port: number }).port;
  const reservation = reservePort();
  await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [`${web}/node_modules/next/dist/bin/next`, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: web,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', BIZUMINER_DIST_DIR: distDir,
      DATABASE_URL: 'postgresql://fixture@127.0.0.1:9/fixture?sslmode=disable&connect_timeout=1',
      SUPABASE_URL: `http://127.0.0.1:${authPort}`, SUPABASE_PUBLISHABLE_KEY: 'fixture-not-a-real-key',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-not-a-real-key',
      NEXT_PUBLIC_SITE_URL: origin, AUTH_LOGIN_MODE: 'password', NEXT_PUBLIC_GA_ID: '', GEMINI_API_KEY: '',
      SHOPEE_CAPTURE_ENABLED: 'false', ALIEXPRESS_CAPTURE_ENABLED: 'false', CAPTURE_EXECUTOR: 'durable' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Never print Next output: Auth diagnostics can contain session data.
  child.stdout?.on('data', bytes => { nextOutputBytes += bytes.length; });
  child.stderr?.on('data', bytes => { nextOutputBytes += bytes.length; });
  const get = (path: string) => fetch(`${origin}${path}`, { redirect: 'manual', headers: { Cookie: cookieHeader() }, signal: AbortSignal.timeout(20000) });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('next_session_fixture_exited');
    try { const response = await get('/favicon.svg'); if (response.status === 200) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'next_session_fixture_not_ready');
  const login = await get('/entrar');
  assert.equal(login.status, 200);
  acceptCookies(login);
  assert.ok((await login.text()).includes('action="/auth/password"'));
  const signedIn = await fetch(`${origin}/auth/password`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { Origin: origin, Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: fixtureEmail, password: fixturePassword, next: '/minha-area' }),
  });
  assert.equal(signedIn.status, 303);
  assert.equal(new URL(signedIn.headers.get('location')!, origin).pathname, '/minha-area');
  assert.match(signedIn.headers.get('cache-control') ?? '', /no-store/);
  const loginChunks = responseCookies(signedIn).filter(cookie => /^sb-.+-auth-token\.\d+=/.test(cookie));
  assert.ok(loginChunks.length >= 2, 'HTTP login must preserve every Set-Cookie chunk');
  acceptCookies(signedIn);
  const saved = cookieSession();
  assert.ok(saved.value.access_token && saved.value.refresh_token, 'complete session must survive chunk reassembly');
  for (let i = 0; i < 2; i++) {
    const reopened = await get('/entrar');
    assert.equal(reopened.status, 307, 'persisted session must redirect from login');
    assert.equal(new URL(reopened.headers.get('location')!, origin).pathname, '/minha-area');
    acceptCookies(reopened);
  }

  // Seed an expired version of the same synthetic session using the installed SDK chunker.
  const expiredAt = nowSeconds() - 120;
  const expired = { ...saved.value, expires_at: expiredAt, access_token: token(expiredAt) };
  for (const name of authCookieNames()) jar.delete(name);
  const encoded = `base64-${Buffer.from(JSON.stringify(expired)).toString('base64url')}`;
  for (const chunk of createChunks(saved.key, encoded)) jar.set(chunk.name, chunk.value);
  const refreshed = await get('/entrar');
  assert.equal(refreshed.status, 307, 'middleware must refresh the expired session before redirect');
  assert.equal(new URL(refreshed.headers.get('location')!, origin).pathname, '/minha-area');
  const refreshChunks = responseCookies(refreshed).filter(cookie => /^sb-.+-auth-token\.\d+=/.test(cookie));
  assert.ok(refreshChunks.length >= 2, 'redirect response must preserve every refreshed Set-Cookie chunk');
  assert.match(refreshed.headers.get('cache-control') ?? '', /no-store/);
  acceptCookies(refreshed);
  const renewed = cookieSession().value;
  assert.ok(renewed.expires_at > nowSeconds(), 'refresh must persist a future expiry');
  assert.ok(renewed.refresh_token !== saved.value.refresh_token, 'refresh token rotation must reach the browser jar');
  const refreshCount = counters.refresh;
  const reopened = await get('/entrar');
  assert.equal(reopened.status, 307);
  assert.equal(new URL(reopened.headers.get('location')!, origin).pathname, '/minha-area');
  assert.equal(counters.refresh, refreshCount, 'reopening must use the refreshed cookie without another refresh');
  assert.equal(counters.password, 1);
  assert.equal(counters.refresh, 1);
  assert.ok(counters.user >= 4);
  assert.equal(counters.unexpected, 0);
  console.log(JSON.stringify({ passed: true, test: 'password-session-http', loginCookieChunks: loginChunks.length,
    refreshCookieChunks: refreshChunks.length, authCalls: counters, database: 'unused-loopback-port', externalRequests: 0 }));
} catch (error) {
  // Assertion values may contain synthetic session material; report the failing condition only.
  const message = error instanceof Error ? error.message.split('\n')[0] : 'password_session_http_failed';
  console.error(JSON.stringify({ passed: false, test: 'password-session-http', message, authCalls: counters, nextOutputBytes }));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise<void>(resolve => child!.once('exit', () => resolve())), delay(5000)]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await Promise.race([new Promise<void>(resolve => child!.once('exit', () => resolve())), delay(2000)]);
    }
  }
  auth.closeAllConnections();
  if (auth.listening) await new Promise<void>(resolve => auth.close(() => resolve()));
}
