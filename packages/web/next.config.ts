import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.BIZUMINER_DIST_DIR || '.next',
  // Evita que lockfiles fora do repositório façam o Next inferir C:\\Users\\emanu
  // como raiz de tracing durante build/deploy.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "http2.mlstatic.com" },
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "https", hostname: "cf.shopee.com.br" },
      // AliExpress serve imagem de produto por CDN numerada (ae-pic-a1, -a2…).
      // Curinga de propósito: com host fixo, a primeira imagem vinda de outro
      // shard quebraria o card. Mesma lição do incidente com a Shopee, em que
      // o host ausente derrubou a vitrine inteira.
      { protocol: "https", hostname: "**.aliexpress-media.com" },
      { protocol: "https", hostname: "**.alicdn.com" },
      { protocol: "https", hostname: "**.media-amazon.com" },
      { protocol: "https", hostname: "**.ssl-images-amazon.com" },
      { protocol: "https", hostname: "**.images-amazon.com" },
    ],
  },
  experimental: {},
};

export default nextConfig;
