import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { siteUrl } from "../lib/site-url";
import { themeBootScript } from "./theme-toggle";
import "./globals.css";

// Manrope entra só para o wordmark da marca, que o design system especifica.
// O corpo do site segue em Arial/Georgia — trocar a tipografia de conteúdo é
// outra decisão. Assim a palavra "BizuMiner" vira texto vivo e os 255 KB de
// fonte embutida em cada SVG de logo deixam de existir.
const manrope = Manrope({ subsets: ["latin"], weight: ["800"], display: "swap", variable: "--font-brand" });

export const metadata: Metadata = {
  // Resolve para o domínio próprio quando existir, para a URL da Vercel
  // enquanto ele não estiver registrado, e para localhost em desenvolvimento.
  metadataBase: new URL(siteUrl()),
  title: "BizuMiner — Um bizu bom vale ouro",
  description:
    "Ofertas selecionadas com preço atual, histórico disponível e evidências do Mercado Livre.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "BizuMiner — Um bizu bom vale ouro",
    description:
      "Curadoria de ponta a ponta com ofertas selecionadas e histórico de preço.",
    url: "/",
    siteName: "BizuMiner",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-bizuminer.jpg",
        width: 1200,
        height: 630,
        alt: "BizuMiner — Um bizu bom vale ouro",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BizuMiner — Um bizu bom vale ouro",
    description:
      "Curadoria em profundidade de ofertas com histórico de preço.",
    images: ["/og-bizuminer.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <head>
        {/* Bloqueante de propósito: roda antes da primeira pintura para a página
            não piscar clara antes de virar escura. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
