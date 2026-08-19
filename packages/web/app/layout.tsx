import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bizuminer.com.br"),
  title: "BizuMiner — Um bizu bom vale ouro",
  description:
    "Ofertas selecionadas com preço atual, histórico disponível e evidências do Mercado Livre.",
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
        url: "/hero-bizuminer.png",
        width: 1732,
        height: 909,
        alt: "BizuMiner — Um bizu bom vale ouro",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BizuMiner — Um bizu bom vale ouro",
    description:
      "Curadoria em profundidade de ofertas com histórico de preço.",
    images: ["/hero-bizuminer.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
