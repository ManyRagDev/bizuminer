/**
 * Serviço de integração com Google Analytics 4 (GA4 Data API v1beta).
 * Consulta relatórios de tráfego, audiência, páginas mais vistas e canais de origem
 * diretamente do Google Analytics para alimentar o Painel Admin do BizuMiner.
 */

import crypto from "node:crypto";

export interface GA4Overview {
  realtimeUsers: number;
  today: { activeUsers: number; pageViews: number; sessions: number };
  last7Days: { activeUsers: number; pageViews: number; sessions: number };
  last30Days: {
    activeUsers: number;
    pageViews: number;
    sessions: number;
    avgSessionDurationSec: number;
    bounceRatePct: number;
  };
}

export interface GA4TopPage {
  path: string;
  pageViews: number;
  activeUsers: number;
}

export interface GA4TrafficSource {
  channel: string;
  sourceMedium: string;
  sessions: number;
  activeUsers: number;
}

export interface GA4EventCount {
  eventName: string;
  count: number;
}

export interface GA4DashboardData {
  propertyId: string;
  fetchedAt: string;
  overview: GA4Overview;
  topPages: GA4TopPage[];
  trafficSources: GA4TrafficSource[];
  events: GA4EventCount[];
}

export type GA4DashboardResult =
  | { status: "ready"; data: GA4DashboardData }
  | { status: "unconfigured" }
  | { status: "unavailable" };

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let cachedReport: { data: GA4DashboardData; expiresAt: number } | null = null;
const requestTimeoutMs = 10_000;

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getCredentials() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return propertyId && clientEmail && privateKey ? { propertyId, clientEmail, privateKey } : null;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.accessToken;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  signer.end();
  const signature = signer
    .sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(requestTimeoutMs),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao obter token OAuth2 do Google (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return cachedToken.accessToken;
}

async function runGA4Report(
  token: string,
  propertyId: string,
  body: Record<string, unknown>
): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    throw new Error(`GA4 runReport (HTTP ${res.status})`);
  }

  return res.json();
}

async function runGA4RealtimeReport(token: string, propertyId: string): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
      body: JSON.stringify({
        metrics: [{ name: "activeUsers" }],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`GA4 runRealtimeReport (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Guarda em cache por cinco minutos apenas relatórios que carregaram por completo.
 */
export async function getGA4DashboardData(forceRefresh = false): Promise<GA4DashboardResult> {
  const credentials = getCredentials();
  if (!credentials) return { status: "unconfigured" };

  const { propertyId, clientEmail, privateKey } = credentials;
  const now = Date.now();
  if (!forceRefresh && cachedReport && cachedReport.expiresAt > now) {
    return { status: "ready", data: cachedReport.data };
  }

  try {
    const token = await getAccessToken(clientEmail, privateKey);

    const [
      realtimeRes,
      todayRes,
      last7DaysRes,
      last30DaysRes,
      topPagesRes,
      sourcesRes,
      eventsRes,
    ] = await Promise.all([
      runGA4RealtimeReport(token, propertyId),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "today", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "sessions" },
        ],
      }),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "sessions" },
        ],
      }),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 8,
      }),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [
          { name: "sessionDefaultChannelGroup" },
          { name: "sessionSourceMedium" },
        ],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      }),
      runGA4Report(token, propertyId, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 8,
      }),
    ]);

    const realtimeUsers = Number(realtimeRes?.rows?.[0]?.metricValues?.[0]?.value || 0);

    const parseMetrics = (row?: any) => {
      const vals = row?.metricValues || [];
      return {
        activeUsers: Number(vals[0]?.value || 0),
        pageViews: Number(vals[1]?.value || 0),
        sessions: Number(vals[2]?.value || 0),
      };
    };

    const todayMetrics = parseMetrics(todayRes?.rows?.[0]);
    const last7DaysMetrics = parseMetrics(last7DaysRes?.rows?.[0]);

    const l30Row = last30DaysRes?.rows?.[0]?.metricValues || [];
    const last30DaysMetrics = {
      activeUsers: Number(l30Row[0]?.value || 0),
      pageViews: Number(l30Row[1]?.value || 0),
      sessions: Number(l30Row[2]?.value || 0),
      avgSessionDurationSec: Number(l30Row[3]?.value || 0),
      bounceRatePct: Number(l30Row[4]?.value || 0) * 100,
    };

    const topPages: GA4TopPage[] = (topPagesRes?.rows || []).map((r: any) => ({
      path: r.dimensionValues?.[0]?.value || "/",
      pageViews: Number(r.metricValues?.[0]?.value || 0),
      activeUsers: Number(r.metricValues?.[1]?.value || 0),
    }));

    const trafficSources: GA4TrafficSource[] = (sourcesRes?.rows || []).map((r: any) => ({
      channel: r.dimensionValues?.[0]?.value || "Desconhecido",
      sourceMedium: r.dimensionValues?.[1]?.value || "(not set)",
      sessions: Number(r.metricValues?.[0]?.value || 0),
      activeUsers: Number(r.metricValues?.[1]?.value || 0),
    }));

    const events: GA4EventCount[] = (eventsRes?.rows || []).map((r: any) => ({
      eventName: r.dimensionValues?.[0]?.value || "",
      count: Number(r.metricValues?.[0]?.value || 0),
    }));

    const result: GA4DashboardData = {
      propertyId,
      fetchedAt: new Date().toISOString(),
      overview: {
        realtimeUsers,
        today: todayMetrics,
        last7Days: last7DaysMetrics,
        last30Days: last30DaysMetrics,
      },
      topPages,
      trafficSources,
      events,
    };

    cachedReport = {
      data: result,
      expiresAt: now + 5 * 60 * 1000, // 5 minutos de cache
    };

    return { status: "ready", data: result };
  } catch (err) {
    console.warn("[ga4-reporting] Erro ao carregar métricas do GA4:", err);
    return { status: "unavailable" };
  }
}
