import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Evita que lockfiles fora do repositório façam o Next inferir C:\\Users\\emanu
  // como raiz de tracing durante build/deploy.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "http2.mlstatic.com" },
      { protocol: "https", hostname: "**.mlstatic.com" },
    ],
  },
  experimental: {},
};

export default nextConfig;
