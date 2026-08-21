import assert from "node:assert/strict";
import test from "node:test";
import { siteUrl } from "../lib/site-url.ts";

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("siteUrl prioriza NEXT_PUBLIC_SITE_URL quando definida", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://bizuminer.com.br", VERCEL_URL: "web-khaki.vercel.app" }, () => {
    assert.equal(siteUrl(), "https://bizuminer.com.br");
  });
});

test("siteUrl cai para VERCEL_URL quando não há domínio próprio", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: undefined, VERCEL_URL: "web-khaki-beta-l29v7h3o33.vercel.app" }, () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(siteUrl(), "https://web-khaki-beta-l29v7h3o33.vercel.app");
  });
});

test("siteUrl cai para localhost sem nenhuma variável definida", () => {
  const previousSite = process.env.NEXT_PUBLIC_SITE_URL;
  const previousVercel = process.env.VERCEL_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
  try {
    assert.equal(siteUrl(), "http://localhost:3100");
  } finally {
    if (previousSite !== undefined) process.env.NEXT_PUBLIC_SITE_URL = previousSite;
    if (previousVercel !== undefined) process.env.VERCEL_URL = previousVercel;
  }
});
