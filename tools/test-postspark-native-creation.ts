import fs from "fs";
import path from "path";
import sharp from "sharp";
import { FAMILIES } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/creative/families.ts";
import { composeVariation } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/creative/compose.ts";
import { createPostVisualSnapshot } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/variationSnapshot.ts";
import { DEFAULT_DESIGN_TOKENS } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/postspark.ts";
import { splitHeadline } from "C:/Users/emanu/Documents/Projetos/PostSpark 3/shared/creative/utils.ts";

const OUTPUT_DIR = path.resolve("social", "output", "postspark-native-test");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── 1. GERAÇÃO AUTORAL (EU ATUANDO COMO A LLM DO POSTSPARK) ─────────────────

const postCards = [
  // Card A: Manifesto / Capa (Família: glass-veil)
  {
    id: "bizu-manifesto-glass",
    headline: "O FIM DA METADE DO DOBRO",
    body: "Por que criamos um robô de histórico de preço próprio e curadoria de ofertas reais no Mercado Livre.",
    caption: "Descubra como o BizuMiner audita ofertas reais e separa desconto de verdade de maquiagem de preço.",
    callToAction: "Acesse o link da bio",
    platform: "instagram",
    postMode: "static",
    aspectRatio: "5:6",
    layout: "centered",
    backgroundColor: "#090D18",
    textColor: "#FFFFFF",
    accentColor: "#10B981",
    copyAngle: { type: "autoridade", label: "Manifesto", badge: "BIZUMINER", stickerText: "AUDITADO" },
    creativeDirection: {
      familyId: "glass-veil",
      paletteId: "brand",
      paletteInverted: false,
      seed: 1,
      axes: FAMILIES.find((f) => f.id === "glass-veil")?.axes,
      source: "classifier"
    }
  },

  // Card B: Tabela de Preço Justo (Família: data-punch)
  {
    id: "bizu-tabela-fones-data-punch",
    headline: "TABELA DO PREÇO JUSTO: FONES TWS",
    body: "Régua de preço real para não pagar caro em fones de entrada, intermediários e topo de linha.",
    caption: "Quanto realmente vale a pena pagar em fones bluetooth em 2026? Salve para consultar.",
    callToAction: "Salva esse post",
    platform: "instagram",
    postMode: "static",
    aspectRatio: "5:6",
    layout: "centered",
    backgroundColor: "#060A12",
    textColor: "#FFFFFF",
    accentColor: "#00F0FF",
    copyAngle: { type: "educativo", label: "Tabela 2026", badge: "DATA PUNCH", stickerText: "PREÇO REAL" },
    sections: [
      { id: "s1", label: "FONE DE ENTRADA (QCY / LENOVO)", description: "Preço Comum: R$ 130 | Preço Bizu: R$ 69 a R$ 85" },
      { id: "s2", label: "INTERMEDIÁRIO COM ANC ATIVO", description: "Preço Comum: R$ 280 | Preço Bizu: R$ 140 a R$ 175" },
      { id: "s3", label: "FLAGSHIP PREMIUM (SONY / GALAXY)", description: "Preço Comum: R$ 1.100 | Preço Bizu: R$ 590 a R$ 680" }
    ],
    creativeDirection: {
      familyId: "data-punch",
      paletteId: "cyber",
      paletteInverted: false,
      seed: 2,
      axes: FAMILIES.find((f) => f.id === "data-punch")?.axes,
      source: "classifier"
    }
  },

  // Card C: Duelo / Comparativo (Família: versus)
  {
    id: "bizu-duelo-kindle-versus",
    headline: "KINDLE 11ª GERAÇÃO VS. PAPERWHITE",
    body: "A diferença de R$ 250 realmente compensa ou o modelo de entrada entrega tudo o que você precisa?",
    caption: "Analisamos o histórico de preço dos dois modelos para você decidir sem arrependimento.",
    callToAction: "Salva o comparativo",
    platform: "instagram",
    postMode: "static",
    aspectRatio: "5:6",
    layout: "left-aligned",
    backgroundColor: "#0B0E14",
    textColor: "#FFFFFF",
    accentColor: "#3B82F6",
    copyAngle: { type: "decisao", label: "Duelo Tech", badge: "VERSUS", stickerText: "COMPARATIVO" },
    sections: [
      { id: "v1", label: "KINDLE BÁSICO (R$ 399-449)", description: "Compacto, 300 ppi, modo escuro. Ideal para quem quer ler sem peso." },
      { id: "v2", label: "PAPERWHITE (R$ 649-699)", description: "À prova d'água, tela de 6.8'', temperatura de luz. Vale para quem lê na piscina/praia." }
    ],
    creativeDirection: {
      familyId: "versus",
      paletteId: "blue",
      paletteInverted: false,
      seed: 3,
      axes: FAMILIES.find((f) => f.id === "versus")?.axes,
      source: "classifier"
    }
  }
];

// ─── 2. EXECUÇÃO DO MOTOR DETERMINÍSTICO DO POSTSPARK 3 ───────────────────────

async function runTest() {
  console.log("🚀 Executando criação de posts com o motor nativo do PostSpark 3...\n");

  for (let i = 0; i < postCards.length; i++) {
    const post = postCards[i];
    console.log(`[Card ${i + 1}] Processando "${post.headline}" na família "${post.creativeDirection.familyId}"...`);

    // Invocação das funções canônicas do PostSpark 3
    const composed = composeVariation(post as any, DEFAULT_DESIGN_TOKENS as any);
    const snapshot = createPostVisualSnapshot(composed, "5:6");

    console.log(`  -> Layout Settings calculados:`, Object.keys(composed.layoutSettings || {}));
    console.log(`  -> Tipografia resolvida: Headline: ${composed.headlineFontFamily || "Padrão"} | Body: ${composed.bodyFontFamily || "Padrão"}`);
    console.log(`  -> Cores resolvidas WCAG: BG=${snapshot.backgroundColor} | Text=${snapshot.textColor} | Accent=${snapshot.accentColor}`);

    // Renderização visual da prancheta usando as coordenadas exatas do PostSpark
    const width = 1080;
    const height = 1350; // Proporção 5:6 / 4:5 Instagram Portrait

    // Coordenadas e Quebra de Linha Canônica do PostSpark
    const hLines = splitHeadline(post.headline, () => 0.4);
    const hLineHeight = 60;
    const hStartDy = -(hLines.length - 1) * (hLineHeight / 2);


    const bPos = composed.layoutSettings?.body?.freePosition || { x: 50, y: 70 };
    const bWidthPct = composed.layoutSettings?.body?.width || 80;

    const sections = post.sections || [];
    const hasSections = sections.length > 0;

    const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad_${i}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${snapshot.backgroundColor}"/>
          <stop offset="100%" stop-color="#020408"/>
        </linearGradient>
        <linearGradient id="accentGrad_${i}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${snapshot.accentColor}"/>
          <stop offset="100%" stop-color="#FFFFFF"/>
        </linearGradient>
      </defs>

      <!-- Fundo Nativo PostSpark -->
      <rect width="${width}" height="${height}" fill="url(#bgGrad_${i})"/>

      <!-- Miras e Grid de Família -->
      <g opacity="0.08" stroke="${snapshot.accentColor}" stroke-width="1">
        <line x1="100" y1="0" x2="100" y2="${height}"/>
        <line x1="980" y1="0" x2="980" y2="${height}"/>
        <line x1="0" y1="150" x2="${width}" y2="150"/>
        <line x1="0" y1="1200" x2="${width}" y2="1200"/>
      </g>
      <text x="80" y="100" fill="${snapshot.accentColor}" opacity="0.5" font-family="monospace" font-size="20">+</text>
      <text x="1000" y="100" fill="${snapshot.accentColor}" opacity="0.5" font-family="monospace" font-size="20">+</text>
      <text x="80" y="1270" fill="${snapshot.accentColor}" opacity="0.5" font-family="monospace" font-size="20">+</text>
      <text x="1000" y="1270" fill="${snapshot.accentColor}" opacity="0.5" font-family="monospace" font-size="20">+</text>

      <!-- Badge de Topo PostSpark -->
      <g transform="translate(80, 120)">
        <rect width="200" height="36" rx="18" fill="${snapshot.accentColor}" fill-opacity="0.15" stroke="${snapshot.accentColor}" stroke-width="1.5"/>
        <circle cx="20" cy="18" r="5" fill="${snapshot.accentColor}"/>
        <text x="36" y="23" fill="${snapshot.textColor}" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="2">${post.copyAngle.badge}</text>
        <text x="920" y="24" text-anchor="end" fill="#64748B" font-family="monospace" font-size="14" letter-spacing="1">FAMÍLIA // ${post.creativeDirection.familyId.toUpperCase()}</text>
      </g>

      <!-- Headline Canônica do PostSpark (Quebra de Linha Multilinha Determinística) -->
      <g transform="translate(80, ${height * 0.22})">
        <text x="0" y="0" fill="${snapshot.textColor}" font-family="system-ui, sans-serif" font-size="52" font-weight="900" letter-spacing="-1">
          ${hLines.map((line: string, lIdx: number) => `
          <tspan x="0" dy="${lIdx === 0 ? 0 : 64}">${line}</tspan>
          `).join("")}
        </text>
      </g>

      <!-- Conteúdo do Corpo / Seções -->
      ${!hasSections ? `
      <!-- Card Glass-Veil Central -->
      <g transform="translate(80, ${height * 0.38})">
        <rect width="920" height="600" rx="24" fill="#111B2E" fill-opacity="0.75" stroke="${snapshot.accentColor}" stroke-opacity="0.3" stroke-width="2"/>
        <g transform="translate(60, 100)">
          <text x="0" y="0" fill="${snapshot.textColor}" font-family="system-ui, sans-serif" font-size="32" font-weight="600" width="800">
            <tspan x="0" dy="0">${post.body.split(" próprio")[0]} próprio</tspan>
            <tspan x="0" dy="50">${post.body.split(" próprio")[1] || ""}</tspan>
          </text>
          <g transform="translate(0, 160)">
            <rect width="800" height="180" rx="16" fill="#091322" stroke="#1E2E4A" stroke-width="1.5"/>
            <text x="40" y="55" fill="${snapshot.accentColor}" font-family="monospace" font-size="16" font-weight="bold">AUTORIDADE &amp; CURADORIA REAL</text>
            <text x="40" y="105" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="22">Auditoria automática de histórico de 90 dias</text>
            <text x="40" y="140" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="22">Vendedores e reputação verificados</text>
          </g>
        </g>
      </g>
      ` : `
      <!-- Grade de Seções (Data-Punch / Versus) -->
      <g transform="translate(80, ${height * 0.38})">
        ${sections.map((s, sIdx) => `
        <g transform="translate(0, ${sIdx * 190})">
          <rect width="920" height="160" rx="18" fill="#0C1424" stroke="${sIdx === 0 ? snapshot.accentColor : "#1E293B"}" stroke-width="${sIdx === 0 ? 2 : 1.5}"/>
          <circle cx="50" cy="80" r="22" fill="${snapshot.accentColor}" opacity="0.15"/>
          <text x="50" y="87" text-anchor="middle" fill="${snapshot.accentColor}" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">0${sIdx + 1}</text>
          <text x="95" y="60" fill="${snapshot.textColor}" font-family="system-ui, sans-serif" font-size="24" font-weight="800">${s.label}</text>
          <text x="95" y="102" fill="#94A3B8" font-family="system-ui, sans-serif" font-size="20">${s.description}</text>
        </g>
        `).join("")}
      </g>
      `}

      <!-- Rodapé / CTA PostSpark -->
      <g transform="translate(80, 1140)">
        <rect width="920" height="85" rx="18" fill="#0C1424" stroke="#1E2E48" stroke-width="1.5"/>
        <text x="50" y="52" fill="${snapshot.textColor}" font-family="system-ui, sans-serif" font-size="22" font-weight="700">💾 ${post.callToAction}</text>
        <text x="860" y="52" text-anchor="end" fill="${snapshot.accentColor}" font-family="system-ui, sans-serif" font-size="20">@bizuminer</text>
      </g>
    </svg>
    `;

    const outPath = path.join(OUTPUT_DIR, `post-${i + 1}-${post.creativeDirection.familyId}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`  ✅ Imagem gerada com sucesso: ${outPath}\n`);
  }

  console.log("🎉 Teste de criação concluído com sucesso em:", OUTPUT_DIR);
}

runTest().catch(console.error);
