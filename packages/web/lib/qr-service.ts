import os from "node:os";
import QRCode from "qrcode";
import { shareBaseUrl } from "./site-url.ts";

export interface PautaQrItem {
  url: string;
  qrDataUrl: string;
  label: string;
  badge: string;
  description: string;
}

export interface PautaQrBundle {
  local: PautaQrItem;
  production: PautaQrItem;
  defaultMode: "local" | "production";
}

/**
 * Encontra o IP IPv4 da máquina na rede local (Wi-Fi / Ethernet).
 * Descarta faixas link-local (169.254.x.x) e prioriza faixas privadas (192.168.x.x, 10.x.x.x).
 */
export function getLocalNetworkIp(): string {
  if (process.env.DEV_LAN_IP) return process.env.DEV_LAN_IP;
  if (process.env.LOCAL_IP) return process.env.LOCAL_IP;

  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string; score: number }[] = [];

  for (const [name, list] of Object.entries(interfaces)) {
    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes("virtual") ||
      lowerName.includes("loopback") ||
      lowerName.includes("pseudo") ||
      lowerName.includes("wsl") ||
      lowerName.includes("vethernet");

    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        const addr = iface.address;
        // Rejeita link-local / APIPA (169.254.x.x)
        if (addr.startsWith("169.254.")) continue;

        let score = 0;
        // Prioriza sub-redes LAN residenciais e de escritório (192.168.x.x)
        if (addr.startsWith("192.168.")) {
          // 192.168.56.x costuma ser host-only do VirtualBox
          score = addr.startsWith("192.168.56.") ? 20 : 100;
        } else if (addr.startsWith("10.")) {
          score = 80;
        } else if (addr.startsWith("172.")) {
          const secondOctet = parseInt(addr.split(".")[1] ?? "0", 10);
          if (secondOctet >= 16 && secondOctet <= 31) {
            score = 70;
          }
        } else {
          score = 10;
        }

        if (isVirtual) score -= 50;
        if (lowerName.includes("tailscale")) score -= 30;
        if (
          lowerName.includes("ethernet") ||
          lowerName.includes("wi-fi") ||
          lowerName.includes("wifi") ||
          lowerName.includes("wlan")
        ) {
          score += 20;
        }

        candidates.push({ name, address: addr, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0 && candidates[0].score > 0) {
    return candidates[0].address;
  }

  return "localhost";
}

/**
 * Resolve a URL apropriada para o celular escanear e abrir a /pauta:
 * - Se for um domínio público configurado, usa https.
 * - Se for localhost / rede local, resolve para o IP local real com a porta correspondente.
 */
export function resolveMobileAccessUrl(hostHeader: string | null): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && !siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1")) {
    return `${siteUrl.replace(/\/$/, "")}/pauta`;
  }

  const rawHost = hostHeader ?? "localhost:3100";
  const [hostName, port] = rawHost.split(":");
  const resolvedPort = port ?? "3100";

  if (hostName === "localhost" || hostName === "127.0.0.1" || !hostName) {
    const localIp = getLocalNetworkIp();
    return `http://${localIp}:${resolvedPort}/pauta`;
  }

  return `http://${rawHost}/pauta`;
}

/**
 * Resolve a URL local na LAN (ex: http://192.168.5.110:3100/pauta).
 */
export function resolveLocalNetworkUrl(hostHeader: string | null, authToken?: string): string {
  const rawHost = hostHeader ?? "localhost:3100";
  const [, port] = rawHost.split(":");
  const resolvedPort = port ?? "3100";
  const localIp = getLocalNetworkIp();
  const query = authToken ? `?auth=${encodeURIComponent(authToken)}` : "";

  return `http://${localIp}:${resolvedPort}/pauta${query}`;
}

/**
 * Resolve a URL de produção (ex: https://www.bizuminer.com.br/pauta).
 */
export function resolveProductionUrl(authToken?: string): string {
  const base = shareBaseUrl().replace(/\/$/, "");
  const query = authToken ? `?auth=${encodeURIComponent(authToken)}` : "";
  return `${base}/pauta${query}`;
}

/**
 * Gera um Data URL PNG do QR Code (pronto para usar na tag <img>)
 */
export async function generateQrCodeDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    margin: 1,
    width: 200,
    color: {
      dark: "#09090b",
      light: "#ffffff",
    },
  });
}

/**
 * Gera o pacote completo com os 2 QR Codes (Localhost / IP LAN e Produção)
 */
export async function getPautaQrBundle(
  hostHeader: string | null,
  authToken?: string,
): Promise<PautaQrBundle> {
  const localUrl = resolveLocalNetworkUrl(hostHeader, authToken);
  const productionUrl = resolveProductionUrl(authToken);

  const [localQr, prodQr] = await Promise.all([
    generateQrCodeDataUrl(localUrl),
    generateQrCodeDataUrl(productionUrl),
  ]);

  const rawHost = hostHeader ?? "";
  const isLocalEnv =
    rawHost.includes("localhost") ||
    rawHost.includes("127.0.0.1") ||
    rawHost.includes("192.168.") ||
    rawHost.includes("10.");

  return {
    local: {
      url: localUrl,
      qrDataUrl: localQr,
      label: "Rede Local (Wi-Fi)",
      badge: "Localhost / LAN",
      description: "Use para testar no celular conectado ao mesmo Wi-Fi deste computador.",
    },
    production: {
      url: productionUrl,
      qrDataUrl: prodQr,
      label: "Produção (Online)",
      badge: "Site Oficial",
      description: "Use para acessar o catálogo publicado no servidor de produção na nuvem.",
    },
    defaultMode: isLocalEnv ? "local" : "production",
  };
}
